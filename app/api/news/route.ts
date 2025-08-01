import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { fetchNewsArticles, DatabaseNewsArticle } from '../../../utils/database';
import {
  withErrorHandling,
  validatePagination,
  validateOptionalAuthToken,
  getClientId,
} from '../../../utils/errors';
import {
  trackPerformanceMetrics,
  createPerformanceHeaders,
  type PerformanceMetrics,
} from '../../../utils/analytics';

// 표준화된 API 응답 인터페이스
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  articles?: T; // Flutter 호환성을 위한 추가 필드
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    pagination?: {
      page: number;
      limit: number;
      total?: number;
    };
    performance?: {
      processingTime: number;
      cacheStatus: string;
    };
  };
}

async function handler(req: NextRequest): Promise<NextResponse<ApiResponse<DatabaseNewsArticle[]>>> {
  const startTime = Date.now();

  try {
    // 1. 메서드 검증
    if (req.method !== 'GET') {
      return NextResponse.json({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Method ${req.method} not allowed`
        }
      }, { 
        status: 405,
        headers: { 'Allow': 'GET' }
      });
    }

    // 2. 인증 헤더 검증 (선택사항 - 익명 접근 허용)
    const authHeader = req.headers.get('Authorization');
    let token: string | null = null;
    
    try {
      token = validateOptionalAuthToken(authHeader);
    } catch (authError: any) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: authError.message || 'Invalid authorization token'
        }
      }, { status: 401 });
    }

    // 3. 페이지네이션 파라미터 추출 및 검증
    const { page, limit } = validatePagination(req.nextUrl.searchParams);

    // 4. 페이지네이션 정보를 포함하여 뉴스 기사 조회
    const articles = await fetchNewsArticles(supabase, {
      limit,
      page,
    });

    const processingTime = Date.now() - startTime;

    // 5. 성능 메트릭 추적
    const metrics: PerformanceMetrics = {
      endpoint: '/api/news',
      method: 'GET',
      statusCode: 200,
      processingTime,
      cacheStatus: 'MISS',
      articlesCount: articles.length,
      userId: token ? 'authenticated' : getClientId(req),
      sortMode: 'latest',
      timestamp: Date.now(),
    };
    trackPerformanceMetrics(metrics);

    // 6. 성공 응답 반환
    const response: ApiResponse<DatabaseNewsArticle[]> = {
      success: true,
      data: articles,
      articles: articles, // Flutter 호환성
      metadata: {
        pagination: {
          page,
          limit,
          total: articles.length
        },
        performance: {
          processingTime,
          cacheStatus: 'MISS'
        }
      }
    };

    return NextResponse.json(response, { 
      status: 200,
      headers: createPerformanceHeaders(metrics)
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    
    console.error('API Error in /api/news:', error.message);
    
    // 에러 메트릭 추적
    const errorMetrics: PerformanceMetrics = {
      endpoint: '/api/news',
      method: 'GET',
      statusCode: 500,
      processingTime,
      cacheStatus: 'MISS',
      articlesCount: 0,
      userId: 'error',
      sortMode: 'latest',
      timestamp: Date.now(),
    };
    trackPerformanceMetrics(errorMetrics);

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      }
    }, { 
      status: 500,
      headers: createPerformanceHeaders(errorMetrics)
    });
  }
}

export const GET = withErrorHandling(handler);