// Vercel Edge function for personalized news API endpoint
// Runtime: Edge (1024MB memory, 10s max duration)

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient, verifySupabaseToken } from '../../../../lib/supabase';
import { rankAndFilterArticles, createPersonalizationContext, calculateRelevanceScore, validatePerformance } from '../../../../utils/personalization';
import { 
  getCachedUserInterests, 
  cacheUserInterests,
  getCachedUserPortfolio, 
  cacheUserPortfolio,
  getCachedNewsArticles,
  cacheNewsArticles,
  generateUserCacheKey,
  generateArticlesCacheKey,
  getCacheStats
} from '../../../../utils/cache';
import { 
  createStreamingResponse, 
  shouldUseStreaming,
  StreamingPerformanceMonitor 
} from '../../../../utils/streaming';
import { 
  trackPerformanceMetrics,
  checkPerformanceAlerts,
  createPerformanceHeaders,
  type PerformanceMetrics 
} from '../../../../utils/analytics';
import { 
  fetchUserInterests, 
  fetchUserPortfolio, 
  fetchUserNewsHistory, 
  fetchNewsArticles,
  fetchUserBookmarks 
} from '../../../../utils/database';
import { 
  validateMethod, 
  validateAuthToken, 
  validatePagination, 
  createErrorResponse,
  withErrorHandling,
  checkRateLimit,
  getClientId,
  RateLimitError
} from '../../../../utils/errors';
import type { 
  PersonalizedNewsResponse, 
  PersonalizedNewsQuery,
  ApiErrorResponse,
  DatabaseNewsArticle,
  UserInterest,
  UserPortfolio,
  UserNewsHistory 
} from '../../../../types/news';

// Edge runtime configuration
export const config = {
  runtime: 'edge',
  memory: 1024,
  maxDuration: 10,
};

/**
 * Advanced Personalized News API Endpoint with TF-IDF Vectorization
 * GET /api/news/personalized
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - sortBy: Sort mode 'relevance' (default) or 'latest'
 * - includeBookmarks: Include bookmarked articles (default: false)
 * - minSentiment: Minimum sentiment score (-1 to 1)
 * - maxAge: Maximum article age in hours (default: 168 = 7 days, max: 720)
 * 
 * Headers:
 * - Authorization: Bearer <jwt_token> (Required)
 * 
 * Enhanced Features:
 * - TF-IDF vectorization for keyword matching
 * - Industry correlation matrix for portfolio analysis
 * - Sentiment profiling based on user history
 * - Category-specific time decay algorithms
 * - Performance validation (<500ms target)
 * - Comprehensive security headers
 */
// Main handler with error handling wrapper
const personalizedNewsHandler = async (req: NextRequest): Promise<NextResponse> => {
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

  // Extract and validate Authorization token
  const authHeader = req.headers.get('authorization');
  const token = validateAuthToken(authHeader);

  // Verify JWT token and get user
  const user = await verifySupabaseToken(token);
  const userId = user.user?.id;

  if (!userId) {
    throw new Error('Invalid token or user not found');
  }

  // Parse and validate query parameters with enhanced validation
  const { searchParams } = new URL(req.url);
  const { page, limit } = validatePagination(searchParams);
  
  const includeBookmarks = searchParams.get('includeBookmarks') === 'true';
  const sortBy = searchParams.get('sortBy') === 'latest' ? 'latest' : 'relevance'; // Default to relevance
  const minSentiment = searchParams.get('minSentiment') 
    ? Math.max(-1, Math.min(1, parseFloat(searchParams.get('minSentiment')!)))
    : undefined;
  const maxAge = Math.max(1, Math.min(720, parseInt(searchParams.get('maxAge') || '168'))); // 1-720 hours (30 days max)
  
  // Input validation for numeric parameters
  if (searchParams.get('minSentiment') && isNaN(parseFloat(searchParams.get('minSentiment')!))) {
    throw new Error('Invalid minSentiment parameter: must be a number between -1 and 1');
  }
  if (searchParams.get('maxAge') && isNaN(parseInt(searchParams.get('maxAge')!))) {
    throw new Error('Invalid maxAge parameter: must be a number between 1 and 720');
  }

  // Create authenticated Supabase client
  const supabase = createAuthenticatedSupabaseClient(token);

  // L2 Application-level caching with parallel data fetching optimization
  const cacheStats = getCacheStats();
  
  // Try to get cached data first
  let userInterests = getCachedUserInterests(userId);
  let userPortfolio = getCachedUserPortfolio(userId);
  
  // News articles cache key based on filters
  const newsFilters = {
    limit: Math.min(500, limit * 10),
    maxAge,
    minSentiment,
  };
  let articles = getCachedNewsArticles(newsFilters);
  
  // Parallel fetching for cache misses only
  const fetchPromises: Promise<any>[] = [];
  
  if (!userInterests) {
    fetchPromises.push(
      fetchUserInterests(supabase, userId).then(data => {
        userInterests = data;
        cacheUserInterests(userId, data);
        return data;
      })
    );
  }
  
  if (!userPortfolio) {
    fetchPromises.push(
      fetchUserPortfolio(supabase, userId).then(data => {
        userPortfolio = data;
        cacheUserPortfolio(userId, data);
        return data;
      })
    );
  }
  
  if (!articles) {
    fetchPromises.push(
      fetchNewsArticles(supabase, newsFilters).then(data => {
        articles = data;
        cacheNewsArticles(newsFilters, data);
        return data;
      })
    );
  }
  
  // Always fetch user history (frequently changing data)
  fetchPromises.push(fetchUserNewsHistory(supabase, userId, 1000));
  
  // Execute remaining fetches
  const results = await Promise.all(fetchPromises);
  const userHistory = results[results.length - 1]; // User history is always last
  
  // Ensure all data is available (fallback for cache misses)
  if (!userInterests || !userPortfolio || !articles) {
    throw new Error('Failed to load required user data');
  }

  // Create advanced personalization context with TF-IDF and performance tracking
  const personalizationContext = createPersonalizationContext(
    userInterests,
    userPortfolio,
    userHistory,
    articles
  );
  
  const contextStartTime = Date.now();
  
  // Apply advanced personalization algorithm with enhanced scoring
  const rankedArticles = sortBy === 'latest' 
    ? articles.sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    : rankAndFilterArticles(
        articles,
        userInterests,
        userPortfolio,
        userHistory,
        {
          minRelevanceScore: 0.05, // Very low threshold to allow variety
          maxAge,
          includeBookmarks,
          weights: {
            keywordMatch: 0.4,
            symbolMatch: 0.3,
            sentimentWeight: 0.2,
            timeDecay: 0.1,
          },
          context: personalizationContext
        }
      );
  
  // Update performance metrics
  personalizationContext.performanceMetrics.processingTime = Date.now() - contextStartTime;

  // Apply pagination to ranked results
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedArticles = rankedArticles.slice(startIndex, endIndex);
  
  // Check if streaming should be used for large datasets
  const useStreaming = shouldUseStreaming(paginatedArticles.length, 100) && 
                      req.headers.get('accept')?.includes('application/x-ndjson');

  // Fetch bookmark status for paginated articles if requested
  let bookmarkedArticles: Set<string> = new Set();
  if (includeBookmarks && paginatedArticles.length > 0) {
    const articleIds = paginatedArticles.map((article: any) => article.id);
    bookmarkedArticles = await fetchUserBookmarks(supabase, userId, articleIds);
  }

  // Convert to Flutter-compatible format
  const formattedArticles = paginatedArticles.map((article: any) => ({
    id: article.id,
    title: article.title,
    summary: article.summary,
    content: article.content,
    url: article.url,
    source: article.source,
    published_at: article.published_at,
    keywords: article.keywords,
    image_url: article.image_url,
    sentiment_score: article.sentiment_score,
    sentiment_label: article.sentiment_label,
    is_bookmarked: bookmarkedArticles.has(article.id),
  }));

  // Calculate relevance scores for response metadata
  const relevanceScores: Record<string, number> = {};
  paginatedArticles.forEach((article: any) => {
    if (article.relevance_score !== undefined) {
      relevanceScores[article.id] = article.relevance_score;
    }
  });

  const processingTime = Date.now() - startTime;
  
  // Validate performance against targets
  const performanceValidation = validatePerformance(personalizationContext);

  // Build enhanced response with performance metrics
  const response: PersonalizedNewsResponse = {
    articles: formattedArticles,
    pagination: {
      page,
      limit,
      total: rankedArticles.length,
      hasMore: endIndex < rankedArticles.length,
    },
    personalization: {
      userId,
      relevanceScores,
      appliedFilters: [
        ...(minSentiment !== undefined ? [`minSentiment:${minSentiment}`] : []),
        `maxAge:${maxAge}`,
        `sortBy:${sortBy}`,
        ...(includeBookmarks ? ['includeBookmarks'] : []),
      ],
      processingTime,
    },
  };

  // L1 Vercel Edge Cache with multi-layer caching strategy
  const isDataFromCache = !!getCachedUserInterests(userId) && !!getCachedUserPortfolio(userId) && !!getCachedNewsArticles(newsFilters);
  const cacheHitStatus = isDataFromCache ? 'HIT' : 'MISS';
  
  // Dynamic cache control based on sort mode and data freshness
  const edgeCacheMaxAge = sortBy === 'latest' ? 60 : 300; // L1 Edge cache: 1-5 minutes
  const staleWhileRevalidate = sortBy === 'latest' ? 300 : 900; // Stale while revalidate: 5-15 minutes
  
  const cacheControlValue = `public, s-maxage=${edgeCacheMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
  
  // Handle streaming response for large datasets
  if (useStreaming) {
    const streamingMonitor = new StreamingPerformanceMonitor();
    const streamingMetadata = {
      pagination: response.pagination,
      personalization: response.personalization,
      cacheStatus: cacheHitStatus,
      processingTime,
      streaming: true
    };
    
    const streamingResponse = createStreamingResponse(
      formattedArticles, 
      25, // 25 articles per chunk
      streamingMetadata
    );
    
    // Add headers to streaming response
    const headers = new Headers(streamingResponse.headers);
    headers.set('Cache-Control', cacheControlValue);
    headers.set('Vary', 'Authorization, Accept-Encoding, Accept');
    headers.set('X-Cache-Status', cacheHitStatus);
    headers.set('X-Processing-Time', `${processingTime}ms`);
    headers.set('X-Response-Mode', 'streaming');
    
    return new NextResponse(streamingResponse.body, {
      status: 200,
      headers
    });
  }
  
  return NextResponse.json(response, {
    status: 200,
    headers: {
      // L1 Vercel Edge Cache Headers
      'Cache-Control': cacheControlValue,
      'Vary': 'Authorization, Accept-Encoding', // User-specific caching with compression support
      'CDN-Cache-Control': `s-maxage=${edgeCacheMaxAge}`,
      'Vercel-Cache-Tags': `user:${userId},news:${sortBy},filters:${maxAge}`,
      
      // Content and Performance Headers
      'Content-Type': 'application/json',
      'X-Processing-Time': `${processingTime}ms`,
      'X-Cache-Status': cacheHitStatus,
      'X-Cache-Stats': `size:${cacheStats.size},max:${cacheStats.maxSize}`,
      'X-Articles-Analyzed': `${articles.length}`,
      'X-User-Interests': `${userInterests.length}`,
      'X-Portfolio-Holdings': `${userPortfolio.length}`,
      'X-Performance-Target': performanceValidation.passesPerformanceTarget ? 'PASS' : 'FAIL',
      'X-Algorithms-Used': personalizationContext.performanceMetrics.algorithmsUsed.join(','),
      'X-Sort-Mode': sortBy,
      
      // Rate Limiting Headers
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
      
      // Security Headers
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      
      // Performance and Monitoring Headers
      'Server-Timing': `db;dur=${processingTime}, cache;desc="${cacheHitStatus}"`,
      'X-Response-Time': `${processingTime}ms`,
      'X-Response-Mode': 'standard',
    },
  });
};

// Enhanced handler with analytics tracking
const analyticsEnhancedHandler = async (req: NextRequest): Promise<NextResponse> => {
  const startTime = Date.now();
  
  try {
    const response = await personalizedNewsHandler(req);
    const processingTime = Date.now() - startTime;
    
    // Extract metrics for analytics
    const url = new URL(req.url);
    const { searchParams } = url;
    const sortBy = searchParams.get('sortBy') || 'relevance';
    
    // Get user ID from response headers or extract from auth
    const authHeader = req.headers.get('authorization');
    let userId = 'anonymous';
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const user = await verifySupabaseToken(token);
        userId = user.user?.id || 'anonymous';
      } catch {
        // Ignore auth errors for analytics
      }
    }
    
    const performanceMetrics: PerformanceMetrics = {
      endpoint: '/api/news/personalized',
      method: req.method || 'GET',
      statusCode: response.status,
      processingTime,
      cacheStatus: response.headers.get('X-Cache-Status') as 'HIT' | 'MISS' || 'MISS',
      userAgent: req.headers.get('user-agent') || undefined,
      region: req.headers.get('x-vercel-ip-country') || undefined,
      articlesCount: parseInt(response.headers.get('X-Articles-Analyzed') || '0'),
      userId,
      sortMode: sortBy,
      timestamp: Date.now()
    };
    
    // Track performance metrics
    trackPerformanceMetrics(performanceMetrics);
    
    // Check for performance alerts
    const alerts = checkPerformanceAlerts(performanceMetrics);
    if (alerts.alerts.length > 0 && alerts.severity !== 'info') {
      console.warn('Performance Alert:', alerts);
    }
    
    return response;
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    // Track error metrics
    const errorMetrics: PerformanceMetrics = {
      endpoint: '/api/news/personalized',
      method: req.method || 'GET',
      statusCode: 500,
      processingTime,
      cacheStatus: 'MISS',
      articlesCount: 0,
      userId: 'error',
      sortMode: 'unknown',
      timestamp: Date.now()
    };
    
    trackPerformanceMetrics(errorMetrics);
    throw error;
  }
};

// Export handler with error handling and analytics
export default withErrorHandling(analyticsEnhancedHandler);