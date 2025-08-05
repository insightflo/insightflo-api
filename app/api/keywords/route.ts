// Keywords management API endpoint
// Runtime: Edge (512MB memory, 5s max duration)

import { NextRequest, NextResponse } from 'next/server';
import { 
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

// 뉴스 응답 인터페이스
interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
  source: string;
  keywords: string[];
  score: number;
}

interface NewsListData {
  articles: NewsArticle[];
  total: number;
  personalizedBy?: string[];
  message?: string;
}

/**
 * News API Endpoint (키워드 기반 뉴스 조회)
 * 
 * GET /api/keywords - 키워드 기반 뉴스 조회 (로컬 키워드를 파라미터로 전송)
 * 
 * Query Parameters:
 * - keywords: 콤마로 구분된 키워드 목록 (예: "AI,스타트업,기술")
 * - weights: 키워드별 가중치 (예: "0.8,0.6,0.9")
 * - limit: 반환할 뉴스 개수 (기본값: 20)
 * 
 * Headers: 인증 불필요
 */

// GET - 키워드 기반 뉴스 조회 (인증 불필요)
const getPersonalizedNews = async (req: NextRequest): Promise<NextResponse> => {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  
  // URL 파라미터에서 키워드와 설정 추출
  const keywordsParam = searchParams.get('keywords') || '';
  const weightsParam = searchParams.get('weights') || '';
  const limitParam = parseInt(searchParams.get('limit') || '20');
  
  const keywords = keywordsParam ? keywordsParam.split(',').map(k => k.trim()) : [];
  const weights = weightsParam ? weightsParam.split(',').map(w => parseFloat(w.trim())) : [];
  
  console.log('Fetching personalized news for keywords:', keywords);

  // 키워드가 없으면 일반 뉴스 반환
  if (keywords.length === 0) {
    const response: ApiResponse<NewsListData> = {
      success: true,
      data: {
        articles: [],
        total: 0,
        message: 'No keywords provided, add some interests for personalized news'
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
        'Cache-Control': 'public, max-age=300',
        'Content-Type': 'application/json',
      },
    });
  }

  // TODO: 실제 뉴스 데이터베이스에서 키워드 기반 검색
  // 현재는 더미 데이터 반환
  const mockNews = keywords.map((keyword, index) => ({
    id: `news_${index + 1}`,
    title: `${keyword}에 대한 최신 뉴스`,
    summary: `${keyword} 관련 중요한 업데이트가 있습니다.`,
    url: `https://example.com/news/${keyword}`,
    publishedAt: new Date().toISOString(),
    source: 'MockNews',
    keywords: [keyword],
    score: weights[index] || 1.0,
  }));

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/keywords',
    method: 'GET',
    statusCode: 200,
    processingTime,
    cacheStatus: 'MISS',
    userId: null, // 인증 없음
    timestamp: Date.now(),
    articlesCount: mockNews.length,
    sortMode: 'personalized',
  };
  trackPerformanceMetrics(metrics);

  const response: ApiResponse<NewsListData> = {
    success: true,
    data: {
      articles: mockNews,
      total: mockNews.length,
      personalizedBy: keywords,
    },
    metadata: {
      total: mockNews.length,
      performance: {
        processingTime,
        cacheStatus: 'MISS'
      }
    }
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=300', // 5분 캐시
      'Content-Type': 'application/json',
      ...createPerformanceHeaders(metrics),
    },
  });
};

// POST, PUT, DELETE 메서드는 더 이상 지원하지 않음
// 키워드 관리는 로컬에서만 수행

// Named exports for Next.js API Routes - 인증 없는 뉴스 조회만 지원
export const GET = withErrorHandling(async (req: NextRequest): Promise<NextResponse> => {
  // 레이트 리미팅만 적용 (인증 불필요)
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(clientId, 100, 60000); // 더 관대한 제한
  
  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetTime).toISOString();
    throw new RateLimitError(
      `Rate limit exceeded. Try again after ${resetDate}`
    );
  }

  return getPersonalizedNews(req);
});