// Portfolio management API endpoint
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
import { UserPortfolio } from '../../../utils/database';

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

interface PortfolioRequest {
  stock_code: string;
  stock_name: string;
  weight?: number;
  purchase_price?: number;
  quantity?: number;
}

interface PortfolioListData {
  holdings: UserPortfolio[];
  total: number;
}

/**
 * Portfolio Management API Endpoint
 * 
 * GET /api/portfolio - 사용자의 포트폴리오 목록 조회
 * POST /api/portfolio - 새로운 종목 추가
 * PUT /api/portfolio/:id - 종목 수정 (weight, sector)
 * DELETE /api/portfolio/:id - 종목 삭제
 * 
 * Headers:
 * - Authorization: Bearer <jwt_token> (Required)
 */

// GET - 포트폴리오 목록 조회
const getPortfolio = async (req: NextRequest, userId: string | null): Promise<NextResponse> => {
  const startTime = Date.now();

  if (!userId) {
    // 익명 사용자의 경우 빈 배열 반환
    const response: ApiResponse<PortfolioListData> = {
      success: true,
      data: {
        holdings: [],
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
    .from('user_portfolio')
    .select('*')
    .eq('user_id', userId)
    .order('weight', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch portfolio: ${error.message}`);
  }

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/portfolio',
    method: 'GET',
    statusCode: 200,
    processingTime,
    cacheStatus: 'MISS',
    userId,
    timestamp: Date.now(),
    articlesCount: 0,
    sortMode: 'weight',
  };
  trackPerformanceMetrics(metrics);

  const responseData: PortfolioListData = {
    holdings: data || [],
    total: (data || []).length,
  };

  const response: ApiResponse<PortfolioListData> = {
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

// POST - 새로운 종목 추가
const addHolding = async (req: NextRequest, userId: string | null): Promise<NextResponse> => {
  const startTime = Date.now();

  if (!userId) {
    throw new Error('Authentication required for portfolio management');
  }

  const body: PortfolioRequest = await req.json();

  if (!body.stock_code || body.stock_code.trim().length === 0) {
    throw new Error('Stock code is required');
  }

  if (!body.stock_name || body.stock_name.trim().length === 0) {
    throw new Error('Stock name is required');
  }

  // 주식 코드 유효성 검사 (대문자, 숫자, 점, 하이픈만 허용)
  const codeRegex = /^[A-Z0-9.-]+$/;
  const cleanCode = body.stock_code.trim().toUpperCase();
  
  if (!codeRegex.test(cleanCode)) {
    throw new Error('Invalid stock code format');
  }

  if (cleanCode.length > 20) {
    throw new Error('Stock code must be less than 20 characters');
  }

  if (body.stock_name.length > 100) {
    throw new Error('Stock name must be less than 100 characters');
  }


  // 중복 종목 확인
  const { data: existing } = await supabase
    .from('user_portfolio')
    .select('id')
    .eq('user_id', userId)
    .eq('stock_code', cleanCode);

  if (existing && existing.length > 0) {
    throw new Error('Stock code already exists in portfolio');
  }

  // 종목 추가
  const { data, error } = await supabase
    .from('user_portfolio')
    .insert({
      user_id: userId,
      stock_code: cleanCode,
      stock_name: body.stock_name.trim(),
      weight: body.weight || 0,
      purchase_price: body.purchase_price || null,
      quantity: body.quantity || 0,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add holding: ${error.message}`);
  }

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/portfolio',
    method: 'POST',
    statusCode: 201,
    processingTime,
    cacheStatus: 'MISS',
    userId,
    timestamp: Date.now(),
    articlesCount: 0,
    sortMode: 'weight',
  };
  trackPerformanceMetrics(metrics);

  const response: ApiResponse<UserPortfolio> = {
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

// PUT - 종목 수정
const updateHolding = async (req: NextRequest, userId: string | null): Promise<NextResponse> => {
  const startTime = Date.now();

  if (!userId) {
    throw new Error('Authentication required for portfolio management');
  }

  const { searchParams } = new URL(req.url);
  const holdingId = searchParams.get('id');

  if (!holdingId) {
    throw new Error('Holding ID is required');
  }

  const body: Partial<PortfolioRequest> = await req.json();

  // 소유권 확인
  const { data: existing } = await supabase
    .from('user_portfolio')
    .select('id')
    .eq('id', holdingId)
    .eq('user_id', userId)
    .single();

  if (!existing) {
    throw new Error('Holding not found or access denied');
  }

  // 업데이트할 필드 구성
  const updateData: any = {};
  
  if (body.stock_code) {
    const codeRegex = /^[A-Z0-9.-]+$/;
    const cleanCode = body.stock_code.trim().toUpperCase();
    
    if (!codeRegex.test(cleanCode)) {
      throw new Error('Invalid stock code format');
    }
    
    if (cleanCode.length > 20) {
      throw new Error('Stock code must be less than 20 characters');
    }
    
    updateData.stock_code = cleanCode;
  }
  
  if (body.stock_name) {
    if (body.stock_name.length > 100) {
      throw new Error('Stock name must be less than 100 characters');
    }
    updateData.stock_name = body.stock_name.trim();
  }
  
  if (body.weight !== undefined) {
    updateData.weight = Math.max(0, body.weight); // 0 이상
  }
  
  if (body.purchase_price !== undefined) {
    updateData.purchase_price = Math.max(0, body.purchase_price);
  }
  
  if (body.quantity !== undefined) {
    updateData.quantity = Math.max(0, body.quantity);
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('user_portfolio')
    .update(updateData)
    .eq('id', holdingId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update holding: ${error.message}`);
  }

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/portfolio',
    method: 'PUT',
    statusCode: 200,
    processingTime,
    cacheStatus: 'MISS',
    userId,
    timestamp: Date.now(),
    articlesCount: 0,
    sortMode: 'weight',
  };
  trackPerformanceMetrics(metrics);

  const response: ApiResponse<UserPortfolio> = {
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

// DELETE - 종목 삭제
const deleteHolding = async (req: NextRequest, userId: string | null): Promise<NextResponse> => {
  const startTime = Date.now();

  if (!userId) {
    throw new Error('Authentication required for portfolio management');
  }

  const { searchParams } = new URL(req.url);
  const holdingId = searchParams.get('id');

  if (!holdingId) {
    throw new Error('Holding ID is required');
  }


  // 소유권 확인 후 삭제
  const { error } = await supabase
    .from('user_portfolio')
    .delete()
    .eq('id', holdingId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete holding: ${error.message}`);
  }

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/portfolio',
    method: 'DELETE',
    statusCode: 200,
    processingTime,
    cacheStatus: 'MISS',
    userId,
    timestamp: Date.now(),
    articlesCount: 0,
    sortMode: 'weight',
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
  return getPortfolio(req, userId);
});

export const POST = withErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await authenticateAndGetUser(req);
  return addHolding(req, userId);
});

export const PUT = withErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await authenticateAndGetUser(req);
  return updateHolding(req, userId);
});

export const DELETE = withErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
  const userId = await authenticateAndGetUser(req);
  return deleteHolding(req, userId);
});