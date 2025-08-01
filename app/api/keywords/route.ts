// Keywords management API endpoint
// Runtime: Edge (512MB memory, 5s max duration)

import { NextRequest, NextResponse } from 'next/server';
import { supabase, verifySupabaseToken } from '../../../lib/supabase';
import { 
  validateOptionalAuthToken, 
  withErrorHandling,
  checkRateLimit,
  getClientId,
  RateLimitError
} from '../../../utils/errors';
import {
  trackPerformanceMetrics,
  createPerformanceHeaders,
  type PerformanceMetrics,
} from '../../../utils/analytics';
import { UserInterest } from '../../../utils/database';

// Edge runtime configuration
export const config = {
  runtime: 'edge',
  memory: 512,
  maxDuration: 5,
};

// 표준화된 API 응답 인터페이스
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    total?: number;
    performance?: {
      processingTime: number;
      cacheStatus: string;
    };
  };
}

interface KeywordRequest {
  interest_category: string;
  interest_keywords?: string[];
  priority_level?: number;
}

interface InterestListData {
  interests: UserInterest[];
  total: number;
}

/**
 * Keywords Management API Endpoint
 * 
 * GET /api/keywords - 사용자의 관심 키워드 목록 조회
 * POST /api/keywords - 새로운 키워드 추가
 * PUT /api/keywords/:id - 키워드 수정 (weight, category)
 * DELETE /api/keywords/:id - 키워드 삭제
 * 
 * Headers:
 * - Authorization: Bearer <jwt_token> (Required)
 */

// GET - 키워드 목록 조회
const getInterests = async (req: NextRequest, userId: string | null): Promise<NextResponse> => {
  const startTime = Date.now();

  if (!userId) {
    // 익명 사용자의 경우 빈 배열 반환
    const response: ApiResponse<InterestListData> = {
      success: true,
      data: {
        interests: [],
        total: 0,
      },
      metadata: {
        total: 0,
        performance: {
          processingTime: Date.now() - startTime,
          cacheStatus: 'MISS'
        }
      }
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=300',
        'Content-Type': 'application/json',
      },
    });
  }

  const { data, error } = await supabase
    .from('user_interests')
    .select('*')
    .eq('user_id', userId)
    .order('priority_level', { ascending: false });

  if (error) {
    console.warn('Failed to fetch user interests:', error.message);
    throw new Error(`Failed to fetch interests: ${error.message}`);
  }

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/interests',
    method: 'GET',
    statusCode: 200,
    processingTime,
    cacheStatus: 'MISS',
    userId,
    timestamp: Date.now(),
    articlesCount: 0,
    sortMode: 'priority',
  };
  trackPerformanceMetrics(metrics);

  const responseData: InterestListData = {
    interests: data || [],
    total: (data || []).length,
  };

  const response: ApiResponse<InterestListData> = {
    success: true,
    data: responseData,
    metadata: {
      total: responseData.total,
      performance: {
        processingTime,
        cacheStatus: 'MISS'
      }
    }
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'private, max-age=300', // 5분 캐시
      'Content-Type': 'application/json',
      ...createPerformanceHeaders(metrics),
    },
  });
};

// POST - 새로운 키워드 추가
const addInterest = async (req: NextRequest, userId: string | null): Promise<NextResponse> => {
  const startTime = Date.now();

  if (!userId) {
    throw new Error('Authentication required for interest management');
  }

  const body: KeywordRequest = await req.json();

  if (!body.interest_category || body.interest_category.trim().length === 0) {
    throw new Error('Interest category is required');
  }

  if (body.interest_category.length > 100) {
    throw new Error('Interest category must be less than 100 characters');
  }

  if (body.priority_level && (body.priority_level < 1 || body.priority_level > 5)) {
    throw new Error('Priority level must be between 1 and 5');
  }


  // 중복 카테고리 확인
  const { data: existing } = await supabase
    .from('user_interests')
    .select('id')
    .eq('user_id', userId)
    .eq('interest_category', body.interest_category.trim());

  if (existing && existing.length > 0) {
    throw new Error('Interest category already exists');
  }

  // 관심사 추가
  const { data, error } = await supabase
    .from('user_interests')
    .insert({
      user_id: userId,
      interest_category: body.interest_category.trim(),
      interest_keywords: body.interest_keywords || [],
      priority_level: body.priority_level || 1,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add interest: ${error.message}`);
  }

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/interests',
    method: 'POST',
    statusCode: 201,
    processingTime,
    cacheStatus: 'MISS',
    userId,
    timestamp: Date.now(),
    articlesCount: 0,
    sortMode: 'priority',
  };
  trackPerformanceMetrics(metrics);

  const response: ApiResponse<UserInterest> = {
    success: true,
    data,
    metadata: {
      performance: {
        processingTime,
        cacheStatus: 'MISS'
      }
    }
  };

  return NextResponse.json(response, {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      ...createPerformanceHeaders(metrics),
    },
  });
};

// PUT - 관심사 수정
const updateInterest = async (req: NextRequest, userId: string | null): Promise<NextResponse> => {
  const startTime = Date.now();

  if (!userId) {
    throw new Error('Authentication required for interest management');
  }

  const { searchParams } = new URL(req.url);
  const interestId = searchParams.get('id');

  if (!interestId) {
    throw new Error('Interest ID is required');
  }

  const body: Partial<KeywordRequest> = await req.json();

  // 소유권 확인
  const { data: existing } = await supabase
    .from('user_interests')
    .select('id')
    .eq('id', interestId)
    .eq('user_id', userId)
    .single();

  if (!existing) {
    throw new Error('Interest not found or access denied');
  }

  // 업데이트할 필드 구성
  const updateData: any = {};
  if (body.interest_category) {
    if (body.interest_category.length > 100) {
      throw new Error('Interest category must be less than 100 characters');
    }
    updateData.interest_category = body.interest_category.trim();
  }
  if (body.priority_level !== undefined) {
    updateData.priority_level = Math.max(1, Math.min(5, body.priority_level)); // 1-5 범위
  }
  if (body.interest_keywords !== undefined) {
    updateData.interest_keywords = body.interest_keywords;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('user_interests')
    .update(updateData)
    .eq('id', interestId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update interest: ${error.message}`);
  }

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/interests',
    method: 'PUT',
    statusCode: 200,
    processingTime,
    cacheStatus: 'MISS',
    userId,
    timestamp: Date.now(),
    articlesCount: 0,
    sortMode: 'priority',
  };
  trackPerformanceMetrics(metrics);

  const response: ApiResponse<UserInterest> = {
    success: true,
    data,
    metadata: {
      performance: {
        processingTime,
        cacheStatus: 'MISS'
      }
    }
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...createPerformanceHeaders(metrics),
    },
  });
};

// DELETE - 관심사 삭제
const deleteInterest = async (req: NextRequest, userId: string | null): Promise<NextResponse> => {
  const startTime = Date.now();

  if (!userId) {
    throw new Error('Authentication required for interest management');
  }

  const { searchParams } = new URL(req.url);
  const interestId = searchParams.get('id');

  if (!interestId) {
    throw new Error('Interest ID is required');
  }


  // 소유권 확인 후 삭제
  const { error } = await supabase
    .from('user_interests')
    .delete()
    .eq('id', interestId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete interest: ${error.message}`);
  }

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/interests',
    method: 'DELETE',
    statusCode: 200,
    processingTime,
    cacheStatus: 'MISS',
    userId,
    timestamp: Date.now(),
    articlesCount: 0,
    sortMode: 'priority',
  };
  trackPerformanceMetrics(metrics);

  const response: ApiResponse<{ success: boolean }> = {
    success: true,
    data: { success: true },
    metadata: {
      performance: {
        processingTime,
        cacheStatus: 'MISS'
      }
    }
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...createPerformanceHeaders(metrics),
    },
  });
};

// Common authentication and rate limiting logic
const authenticateAndGetUser = async (req: NextRequest) => {
  // Apply rate limiting (50 requests per minute per client)
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(clientId, 50, 60000);
  
  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetTime).toISOString();
    throw new RateLimitError(
      `Rate limit exceeded. Try again after ${resetDate}`
    );
  }

  // Extract and validate Authorization token (optional)
  const authHeader = req.headers.get('authorization');
  let token: string | null = null;
  let userId: string | null = null;

  try {
    token = validateOptionalAuthToken(authHeader);
    if (token) {
      const user = await verifySupabaseToken(token);
      userId = user.user?.id || null;
    }
  } catch (authError: any) {
    // 인증 에러는 무시하고 익명 사용자로 처리
    console.warn('Authentication failed, treating as anonymous:', authError.message);
  }

  return userId;
};

// Named exports for Next.js API Routes
export const GET = withErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await authenticateAndGetUser(req);
  return getInterests(req, userId);
});

export const POST = withErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await authenticateAndGetUser(req);
  return addInterest(req, userId);
});

export const PUT = withErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await authenticateAndGetUser(req);
  return updateInterest(req, userId);
});

export const DELETE = withErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await authenticateAndGetUser(req);
  return deleteInterest(req, userId);
});