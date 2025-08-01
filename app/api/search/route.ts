// Search API endpoint for keywords and stock symbols
// Runtime: Edge (256MB memory, 3s max duration)

import { NextRequest, NextResponse } from 'next/server';
import { verifySupabaseToken } from '../../../lib/supabase';
import { 
  validateMethod, 
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

// Edge runtime configuration
export const config = {
  runtime: 'edge',
  memory: 256,
  maxDuration: 3,
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
    query?: string;
    total?: number;
    performance?: {
      processingTime: number;
      cacheStatus: string;
    };
  };
}

interface SearchResult {
  type: 'keyword' | 'symbol';
  value: string;
  category?: string;
  sector?: string;
  description?: string;
}

interface SearchData {
  results: SearchResult[];
  total: number;
  query: string;
}

/**
 * Search API Endpoint
 * 
 * GET /api/search?q=query&type=keyword|symbol|all&limit=10
 * 
 * Query Parameters:
 * - q: Search query (required, min 1 char)
 * - type: Search type - 'keyword', 'symbol', 'all' (default: 'all')
 * - limit: Results limit (default: 10, max: 50)
 * 
 * Headers:
 * - Authorization: Bearer <jwt_token> (Required)
 */

// 인기 키워드 목록 (실제로는 데이터베이스에서 가져와야 함)
const popularKeywords = [
  { value: '삼성전자', category: 'stock' },
  { value: 'SK하이닉스', category: 'stock' },
  { value: 'NAVER', category: 'stock' },
  { value: '카카오', category: 'stock' },
  { value: 'LG화학', category: 'stock' },
  { value: '현대차', category: 'stock' },
  { value: '기아', category: 'stock' },
  { value: 'POSCO홀딩스', category: 'stock' },
  { value: '셀트리온', category: 'stock' },
  { value: 'KB금융', category: 'stock' },
  { value: '코로나', category: 'health' },
  { value: '백신', category: 'health' },
  { value: '바이오', category: 'biotech' },
  { value: '반도체', category: 'technology' },
  { value: '전기차', category: 'automotive' },
  { value: '배터리', category: 'energy' },
  { value: 'AI', category: 'technology' },
  { value: '인공지능', category: 'technology' },
  { value: '메타버스', category: 'technology' },
  { value: '블록체인', category: 'technology' },
];

// 주식 심볼 목록 (실제로는 외부 API나 데이터베이스에서 가져와야 함)
const stockSymbols = [
  { value: '005930', description: '삼성전자', sector: 'Technology' },
  { value: '000660', description: 'SK하이닉스', sector: 'Technology' },
  { value: '035420', description: 'NAVER', sector: 'Technology' },
  { value: '035720', description: '카카오', sector: 'Technology' },
  { value: '051910', description: 'LG화학', sector: 'Chemical' },
  { value: '005380', description: '현대차', sector: 'Automotive' },
  { value: '000270', description: '기아', sector: 'Automotive' },
  { value: '005490', description: 'POSCO홀딩스', sector: 'Steel' },
  { value: '068270', description: '셀트리온', sector: 'Biotech' },
  { value: '105560', description: 'KB금융', sector: 'Financial' },
  { value: 'AAPL', description: 'Apple Inc.', sector: 'Technology' },
  { value: 'GOOGL', description: 'Alphabet Inc.', sector: 'Technology' },
  { value: 'MSFT', description: 'Microsoft Corporation', sector: 'Technology' },
  { value: 'AMZN', description: 'Amazon.com Inc.', sector: 'E-commerce' },
  { value: 'TSLA', description: 'Tesla Inc.', sector: 'Automotive' },
  { value: 'META', description: 'Meta Platforms Inc.', sector: 'Technology' },
  { value: 'NVDA', description: 'NVIDIA Corporation', sector: 'Technology' },
  { value: 'JPM', description: 'JPMorgan Chase & Co.', sector: 'Financial' },
];

const searchHandler = async (req: NextRequest): Promise<NextResponse> => {
  const startTime = Date.now();
  
  // Validate request method
  validateMethod(req, ['GET']);

  // Apply rate limiting (100 requests per minute per client)
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(clientId, 100, 60000);
  
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

  // Parse query parameters
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim();
  const searchType = searchParams.get('type') || 'all';
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')));

  if (!query || query.length === 0) {
    throw new Error('Search query is required');
  }

  if (query.length > 50) {
    throw new Error('Search query must be less than 50 characters');
  }

  if (!['keyword', 'symbol', 'all'].includes(searchType)) {
    throw new Error('Invalid search type. Must be: keyword, symbol, or all');
  }

  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  // 키워드 검색
  if (searchType === 'keyword' || searchType === 'all') {
    const keywordMatches = popularKeywords
      .filter(keyword => keyword.value.toLowerCase().includes(queryLower))
      .slice(0, searchType === 'keyword' ? limit : Math.floor(limit / 2))
      .map(keyword => ({
        type: 'keyword' as const,
        value: keyword.value,
        category: keyword.category,
      }));
    
    results.push(...keywordMatches);
  }

  // 심볼 검색
  if (searchType === 'symbol' || searchType === 'all') {
    const symbolMatches = stockSymbols
      .filter(stock => 
        stock.value.toLowerCase().includes(queryLower) ||
        stock.description.toLowerCase().includes(queryLower)
      )
      .slice(0, searchType === 'symbol' ? limit : Math.floor(limit / 2))
      .map(stock => ({
        type: 'symbol' as const,
        value: stock.value,
        description: stock.description,
        sector: stock.sector,
      }));
    
    results.push(...symbolMatches);
  }

  // 결과를 관련도순으로 정렬 (정확한 매치가 먼저)
  results.sort((a, b) => {
    const aExact = a.value.toLowerCase() === queryLower || a.description?.toLowerCase() === queryLower;
    const bExact = b.value.toLowerCase() === queryLower || b.description?.toLowerCase() === queryLower;
    
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    const aStarts = a.value.toLowerCase().startsWith(queryLower) || a.description?.toLowerCase().startsWith(queryLower);
    const bStarts = b.value.toLowerCase().startsWith(queryLower) || b.description?.toLowerCase().startsWith(queryLower);
    
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    return 0;
  });

  const processingTime = Date.now() - startTime;
  
  // 성능 메트릭 추적
  const metrics: PerformanceMetrics = {
    endpoint: '/api/search',
    method: 'GET',
    statusCode: 200,
    processingTime,
    cacheStatus: 'MISS',
    userId: userId || 'anonymous',
    timestamp: Date.now(),
    articlesCount: 0,
    sortMode: 'relevance',
  };
  trackPerformanceMetrics(metrics);

  const responseData: SearchData = {
    results: results.slice(0, limit),
    total: results.length,
    query,
  };

  const response: ApiResponse<SearchData> = {
    success: true,
    data: responseData,
    metadata: {
      query,
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
      'X-Rate-Limit-Remaining': rateLimit.remaining.toString(),
      ...createPerformanceHeaders(metrics),
    },
  });
};

// Named export for Next.js API Routes
export const GET = withErrorHandling(searchHandler);