// Vercel Edge function for analytics dashboard
// Runtime: Edge (512MB memory, 10s max duration)

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient, verifySupabaseToken } from '@/lib/supabase';
import { 
  validateMethod, 
  validateAuthToken, 
  createErrorResponse,
  withErrorHandling,
  checkRateLimit,
  getClientId,
  RateLimitError
} from '@/utils/errors';

// Edge runtime configuration
export const config = {
  runtime: 'edge',
  memory: 512,
  maxDuration: 10,
};

/**
 * Analytics Dashboard API Endpoint
 * GET /api/analytics/dashboard
 * 
 * Query Parameters:
 * - timeRange: '1h' | '24h' | '7d' | '30d' (default: '24h')
 * - metrics: 'performance' | 'usage' | 'cache' | 'all' (default: 'all')
 * - userId: specific user filter (optional)
 * - endpoint: specific endpoint filter (optional)
 * 
 * Headers:
 * - Authorization: Bearer <jwt_token> (Required)
 * 
 * Features:
 * - Real-time performance metrics aggregation
 * - Cache hit rate analysis and optimization insights
 * - User behavior pattern analysis
 * - Personalization algorithm effectiveness tracking
 * - Performance threshold monitoring
 * - Regional performance breakdown
 */

interface AnalyticsDashboardResponse {
  timeRange: string;
  generatedAt: string;
  summary: {
    totalRequests: number;
    averageResponseTime: number;
    cacheHitRate: number;
    errorRate: number;
    uniqueUsers: number;
  };
  performance: {
    responseTimeDistribution: {
      p50: number;
      p95: number;
      p99: number;
    };
    regionPerformance: Record<string, {
      averageResponseTime: number;
      requestCount: number;
      errorRate: number;
    }>;
    endpointPerformance: Record<string, {
      averageResponseTime: number;
      requestCount: number;
      cacheHitRate: number;
    }>;
    trends: {
      hourly: Array<{
        hour: string;
        avgResponseTime: number;
        requestCount: number;
        errorCount: number;
      }>;
    };
  };
  cacheAnalysis: {
    overallHitRate: number;
    hitRateByType: Record<string, number>;
    cacheEfficiencyScore: number;
    optimizationOpportunities: string[];
    cacheSizeUtilization: number;
  };
  userPatterns: {
    activeUsers: number;
    topUsersByRequests: Array<{
      userId: string;
      requestCount: number;
      averageResponseTime: number;
      preferredSortMode: string;
    }>;
    usageByTimeOfDay: Record<string, number>;
    deviceTypeDistribution: Record<string, number>;
  };
  personalizationEffectiveness: {
    averageRelevanceScore: number;
    relevanceScoreDistribution: {
      excellent: number; // > 0.8
      good: number;      // 0.6-0.8
      fair: number;      // 0.4-0.6
      poor: number;      // < 0.4
    };
    algorithmPerformance: {
      keywordMatchEffectiveness: number;
      symbolMatchEffectiveness: number;
      sentimentWeightEffectiveness: number;
      timeDecayEffectiveness: number;
    };
    userSatisfactionMetrics: {
      averageArticlesReturned: number;
      averageProcessingTime: number;
      cacheHitRateForPersonalized: number;
    };
  };
  alerts: Array<{
    type: 'performance' | 'cache' | 'error' | 'usage';
    severity: 'info' | 'warning' | 'critical';
    message: string;
    timestamp: string;
    affectedMetric: string;
    threshold: number;
    currentValue: number;
  }>;
  recommendations: Array<{
    category: 'performance' | 'cache' | 'personalization' | 'infrastructure';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    expectedImpact: string;
    implementationEffort: 'low' | 'medium' | 'high';
  }>;
}

// Time range to SQL interval mapping
function getTimeRangeInterval(timeRange: string): string {
  switch (timeRange) {
    case '1h': return '1 hour';
    case '24h': return '24 hours';
    case '7d': return '7 days';
    case '30d': return '30 days';
    default: return '24 hours';
  }
}

// Fetch performance metrics from analytics logs
async function fetchPerformanceMetrics(
  supabase: any,
  timeRange: string,
  userId?: string,
  endpoint?: string
): Promise<any[]> {
  let query = supabase
    .from('analytics_performance_logs')
    .select('*')
    .gte('timestamp', new Date(Date.now() - getTimeRangeMs(timeRange)).toISOString())
    .order('timestamp', { ascending: false });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (endpoint) {
    query = query.eq('endpoint', endpoint);
  }

  const { data, error } = await query.limit(10000);

  if (error) {
    console.error('Failed to fetch performance metrics:', error);
    return [];
  }

  return data || [];
}

// Convert time range to milliseconds
function getTimeRangeMs(timeRange: string): number {
  switch (timeRange) {
    case '1h': return 60 * 60 * 1000;
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    case '30d': return 30 * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

// Generate performance summary
function generatePerformanceSummary(metrics: any[]): AnalyticsDashboardResponse['summary'] {
  if (metrics.length === 0) {
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      cacheHitRate: 0,
      errorRate: 0,
      uniqueUsers: 0
    };
  }

  const totalRequests = metrics.length;
  const averageResponseTime = metrics.reduce((sum, m) => sum + (m.processing_time || 0), 0) / totalRequests;
  const cacheHits = metrics.filter(m => m.cache_status === 'HIT').length;
  const errors = metrics.filter(m => m.status_code >= 400).length;
  const uniqueUsers = new Set(metrics.map(m => m.user_id).filter(Boolean)).size;

  return {
    totalRequests,
    averageResponseTime: Math.round(averageResponseTime),
    cacheHitRate: Math.round((cacheHits / totalRequests) * 100),
    errorRate: Math.round((errors / totalRequests) * 100),
    uniqueUsers
  };
}

// Analyze cache performance
function analyzeCachePerformance(metrics: any[]): AnalyticsDashboardResponse['cacheAnalysis'] {
  if (metrics.length === 0) {
    return {
      overallHitRate: 0,
      hitRateByType: {},
      cacheEfficiencyScore: 0,
      optimizationOpportunities: [],
      cacheSizeUtilization: 0
    };
  }

  const totalRequests = metrics.length;
  const cacheHits = metrics.filter(m => m.cache_status === 'HIT').length;
  const overallHitRate = (cacheHits / totalRequests) * 100;

  // Hit rate by endpoint type
  const hitRateByType: Record<string, number> = {};
  const endpointGroups = metrics.reduce((groups, metric) => {
    const endpoint = metric.endpoint || 'unknown';
    if (!groups[endpoint]) groups[endpoint] = [];
    groups[endpoint].push(metric);
    return groups;
  }, {} as Record<string, any[]>);

  Object.entries(endpointGroups).forEach(([endpoint, endpointMetrics]) => {
    const metrics = endpointMetrics as any[];
    const hits = metrics.filter((m: any) => m.cache_status === 'HIT').length;
    hitRateByType[endpoint] = Math.round((hits / metrics.length) * 100);
  });

  // Calculate cache efficiency score (0-100)
  const avgResponseTimeHit = metrics
    .filter(m => m.cache_status === 'HIT')
    .reduce((sum, m) => sum + (m.processing_time || 0), 0) / cacheHits || 0;
  
  const avgResponseTimeMiss = metrics
    .filter(m => m.cache_status === 'MISS')
    .reduce((sum, m) => sum + (m.processing_time || 0), 0) / (totalRequests - cacheHits) || 0;

  const speedImprovement = avgResponseTimeMiss > 0 ? (avgResponseTimeMiss - avgResponseTimeHit) / avgResponseTimeMiss : 0;
  const cacheEfficiencyScore = Math.round(overallHitRate * 0.6 + speedImprovement * 100 * 0.4);

  // Optimization opportunities
  const optimizationOpportunities: string[] = [];
  if (overallHitRate < 70) {
    optimizationOpportunities.push('Increase cache TTL for stable content');
  }
  if (avgResponseTimeHit > 200) {
    optimizationOpportunities.push('Optimize cache retrieval mechanism');
  }
  Object.entries(hitRateByType).forEach(([endpoint, hitRate]) => {
    if (hitRate < 50) {
      optimizationOpportunities.push(`Improve caching strategy for ${endpoint}`);
    }
  });

  return {
    overallHitRate: Math.round(overallHitRate),
    hitRateByType,
    cacheEfficiencyScore,
    optimizationOpportunities,
    cacheSizeUtilization: 75 // Mock value - would come from actual cache stats
  };
}

// Analyze personalization effectiveness
function analyzePersonalizationEffectiveness(metrics: any[]): AnalyticsDashboardResponse['personalizationEffectiveness'] {
  const personalizedMetrics = metrics.filter(m => m.endpoint?.includes('personalized'));
  
  if (personalizedMetrics.length === 0) {
    return {
      averageRelevanceScore: 0,
      relevanceScoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
      algorithmPerformance: {
        keywordMatchEffectiveness: 0,
        symbolMatchEffectiveness: 0,
        sentimentWeightEffectiveness: 0,
        timeDecayEffectiveness: 0
      },
      userSatisfactionMetrics: {
        averageArticlesReturned: 0,
        averageProcessingTime: 0,
        cacheHitRateForPersonalized: 0
      }
    };
  }

  // Mock relevance scores - in real implementation, these would be tracked in metrics
  const relevanceScores = personalizedMetrics.map(() => Math.random() * 0.6 + 0.4); // 0.4-1.0
  const averageRelevanceScore = relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length;

  const distribution = {
    excellent: relevanceScores.filter(s => s > 0.8).length,
    good: relevanceScores.filter(s => s >= 0.6 && s <= 0.8).length,
    fair: relevanceScores.filter(s => s >= 0.4 && s < 0.6).length,
    poor: relevanceScores.filter(s => s < 0.4).length
  };

  const cacheHits = personalizedMetrics.filter(m => m.cache_status === 'HIT').length;
  const avgProcessingTime = personalizedMetrics.reduce((sum, m) => sum + (m.processing_time || 0), 0) / personalizedMetrics.length;
  const avgArticles = personalizedMetrics.reduce((sum, m) => sum + (m.articles_count || 0), 0) / personalizedMetrics.length;

  return {
    averageRelevanceScore: Math.round(averageRelevanceScore * 100) / 100,
    relevanceScoreDistribution: distribution,
    algorithmPerformance: {
      keywordMatchEffectiveness: 0.75, // Mock values - would be calculated from actual algorithm metrics
      symbolMatchEffectiveness: 0.68,
      sentimentWeightEffectiveness: 0.72,
      timeDecayEffectiveness: 0.80
    },
    userSatisfactionMetrics: {
      averageArticlesReturned: Math.round(avgArticles),
      averageProcessingTime: Math.round(avgProcessingTime),
      cacheHitRateForPersonalized: Math.round((cacheHits / personalizedMetrics.length) * 100)
    }
  };
}

// Generate performance alerts
function generatePerformanceAlerts(metrics: any[]): AnalyticsDashboardResponse['alerts'] {
  const alerts: AnalyticsDashboardResponse['alerts'] = [];
  const now = new Date().toISOString();

  if (metrics.length === 0) return alerts;

  const avgResponseTime = metrics.reduce((sum, m) => sum + (m.processing_time || 0), 0) / metrics.length;
  const errorRate = (metrics.filter(m => m.status_code >= 400).length / metrics.length) * 100;
  const cacheHitRate = (metrics.filter(m => m.cache_status === 'HIT').length / metrics.length) * 100;

  // Response time alerts
  if (avgResponseTime > 2000) {
    alerts.push({
      type: 'performance',
      severity: 'critical',
      message: 'Average response time critically high',
      timestamp: now,
      affectedMetric: 'responseTime',
      threshold: 2000,
      currentValue: Math.round(avgResponseTime)
    });
  } else if (avgResponseTime > 1000) {
    alerts.push({
      type: 'performance',
      severity: 'warning',
      message: 'Average response time elevated',
      timestamp: now,
      affectedMetric: 'responseTime',
      threshold: 1000,
      currentValue: Math.round(avgResponseTime)
    });
  }

  // Error rate alerts
  if (errorRate > 5) {
    alerts.push({
      type: 'error',
      severity: 'critical',
      message: 'Error rate critically high',
      timestamp: now,
      affectedMetric: 'errorRate',
      threshold: 5,
      currentValue: Math.round(errorRate)
    });
  } else if (errorRate > 2) {
    alerts.push({
      type: 'error',
      severity: 'warning',
      message: 'Error rate elevated',
      timestamp: now,
      affectedMetric: 'errorRate',
      threshold: 2,
      currentValue: Math.round(errorRate)
    });
  }

  // Cache hit rate alerts
  if (cacheHitRate < 50) {
    alerts.push({
      type: 'cache',
      severity: 'warning',
      message: 'Cache hit rate below optimal threshold',
      timestamp: now,
      affectedMetric: 'cacheHitRate',
      threshold: 70,
      currentValue: Math.round(cacheHitRate)
    });
  }

  return alerts;
}

// Generate optimization recommendations
function generateRecommendations(
  metrics: any[],
  cacheAnalysis: AnalyticsDashboardResponse['cacheAnalysis'],
  performance: AnalyticsDashboardResponse['performance']
): AnalyticsDashboardResponse['recommendations'] {
  const recommendations: AnalyticsDashboardResponse['recommendations'] = [];

  // Performance recommendations
  if (performance.responseTimeDistribution.p95 > 2000) {
    recommendations.push({
      category: 'performance',
      priority: 'high',
      title: 'Optimize slow endpoints',
      description: '95th percentile response time exceeds 2 seconds. Consider database query optimization and caching improvements.',
      expectedImpact: 'Reduce P95 response time by 40-60%',
      implementationEffort: 'medium'
    });
  }

  // Cache recommendations
  if (cacheAnalysis.overallHitRate < 70) {
    recommendations.push({
      category: 'cache',
      priority: 'high',
      title: 'Improve cache strategy',
      description: 'Cache hit rate is below optimal threshold. Consider increasing TTL and implementing more aggressive caching.',
      expectedImpact: 'Increase cache hit rate to 80%+',
      implementationEffort: 'low'
    });
  }

  // Personalization recommendations
  recommendations.push({
    category: 'personalization',
    priority: 'medium',
    title: 'Enhance personalization algorithms',
    description: 'Fine-tune keyword matching weights and implement machine learning-based relevance scoring.',
    expectedImpact: 'Improve user engagement by 15-25%',
    implementationEffort: 'high'
  });

  // Infrastructure recommendations
  if (Object.keys(performance.regionPerformance).length > 1) {
    const worstRegion = Object.entries(performance.regionPerformance)
      .sort(([,a], [,b]) => b.averageResponseTime - a.averageResponseTime)[0];
    
    if (worstRegion && worstRegion[1].averageResponseTime > 1000) {
      recommendations.push({
        category: 'infrastructure',
        priority: 'medium',
        title: 'Optimize regional performance',
        description: `${worstRegion[0]} region shows elevated response times. Consider additional edge locations or regional optimizations.`,
        expectedImpact: 'Reduce regional response time by 30-50%',
        implementationEffort: 'medium'
      });
    }
  }

  return recommendations;
}

// Main handler for analytics dashboard
const analyticsDashboardHandler = async (req: NextRequest): Promise<NextResponse> => {
  const startTime = Date.now();
  
  // Validate request method
  validateMethod(req, ['GET']);

  // Apply rate limiting (20 requests per minute per client for analytics)
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(clientId, 20, 60000);
  
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

  // Parse query parameters
  const { searchParams } = new URL(req.url);
  const timeRange = searchParams.get('timeRange') || '24h';
  const metricsType = searchParams.get('metrics') || 'all';
  const userFilter = searchParams.get('userId');
  const endpointFilter = searchParams.get('endpoint');

  // Validate time range
  if (!['1h', '24h', '7d', '30d'].includes(timeRange)) {
    throw new Error('Invalid timeRange parameter. Must be: 1h, 24h, 7d, or 30d');
  }

  // Create authenticated Supabase client
  const supabase = createAuthenticatedSupabaseClient(token);

  // Fetch analytics data (mock implementation - replace with actual data fetching)
  const metrics = await fetchPerformanceMetrics(supabase, timeRange, userFilter || undefined, endpointFilter || undefined);

  // Generate analytics dashboard data
  const summary = generatePerformanceSummary(metrics);
  const cacheAnalysis = analyzeCachePerformance(metrics);
  const personalizationEffectiveness = analyzePersonalizationEffectiveness(metrics);
  
  // Mock performance data (in real implementation, compute from metrics)
  const performance: AnalyticsDashboardResponse['performance'] = {
    responseTimeDistribution: {
      p50: metrics.length > 0 ? Math.round(metrics.map(m => m.processing_time || 0).sort()[Math.floor(metrics.length * 0.5)]) : 0,
      p95: metrics.length > 0 ? Math.round(metrics.map(m => m.processing_time || 0).sort()[Math.floor(metrics.length * 0.95)]) : 0,
      p99: metrics.length > 0 ? Math.round(metrics.map(m => m.processing_time || 0).sort()[Math.floor(metrics.length * 0.99)]) : 0
    },
    regionPerformance: {
      'icn1': { averageResponseTime: 245, requestCount: 1250, errorRate: 0.8 },
      'nrt1': { averageResponseTime: 278, requestCount: 890, errorRate: 1.2 },
      'sin1': { averageResponseTime: 312, requestCount: 567, errorRate: 0.5 }
    },
    endpointPerformance: {
      '/api/news/personalized': { averageResponseTime: 267, requestCount: 2100, cacheHitRate: 73 },
      '/api/push/trigger': { averageResponseTime: 156, requestCount: 450, cacheHitRate: 0 }
    },
    trends: {
      hourly: Array.from({ length: 24 }, (_, i) => ({
        hour: `${String(i).padStart(2, '0')}:00`,
        avgResponseTime: 200 + Math.random() * 200,
        requestCount: Math.floor(50 + Math.random() * 100),
        errorCount: Math.floor(Math.random() * 5)
      }))
    }
  };

  // Mock user patterns data
  const userPatterns: AnalyticsDashboardResponse['userPatterns'] = {
    activeUsers: summary.uniqueUsers,
    topUsersByRequests: metrics
      .reduce((users, metric) => {
        const userId = metric.user_id;
        if (!userId) return users;
        
        if (!users[userId]) {
          users[userId] = {
            userId,
            requestCount: 0,
            totalResponseTime: 0,
            sortModes: {}
          };
        }
        
        users[userId].requestCount++;
        users[userId].totalResponseTime += metric.processing_time || 0;
        
        const sortMode = metric.sort_mode || 'relevance';
        users[userId].sortModes[sortMode] = (users[userId].sortModes[sortMode] || 0) + 1;
        
        return users;
      }, {} as any)
      && Object.values(metrics.reduce((users, metric) => {
        const userId = metric.user_id;
        if (!userId) return users;
        
        if (!users[userId]) {
          users[userId] = {
            userId,
            requestCount: 0,
            totalResponseTime: 0,
            sortModes: {}
          };
        }
        
        users[userId].requestCount++;
        users[userId].totalResponseTime += metric.processing_time || 0;
        
        const sortMode = metric.sort_mode || 'relevance';
        users[userId].sortModes[sortMode] = (users[userId].sortModes[sortMode] || 0) + 1;
        
        return users;
      }, {} as any))
      .map((user: any) => ({
        userId: user.userId,
        requestCount: user.requestCount,
        averageResponseTime: Math.round(user.totalResponseTime / user.requestCount),
        preferredSortMode: Object.entries(user.sortModes).sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0] || 'relevance'
      }))
      .sort((a: any, b: any) => b.requestCount - a.requestCount)
      .slice(0, 10),
    usageByTimeOfDay: Array.from({ length: 24 }, (_, i) => i).reduce((usage, hour) => {
      usage[`${String(hour).padStart(2, '0')}:00`] = Math.floor(20 + Math.random() * 80);
      return usage;
    }, {} as Record<string, number>),
    deviceTypeDistribution: {
      'mobile': 65,
      'desktop': 28,
      'tablet': 7
    }
  };

  const alerts = generatePerformanceAlerts(metrics);
  const recommendations = generateRecommendations(metrics, cacheAnalysis, performance);

  const processingTime = Date.now() - startTime;

  // Build response
  const response: AnalyticsDashboardResponse = {
    timeRange,
    generatedAt: new Date().toISOString(),
    summary,
    performance,
    cacheAnalysis,
    userPatterns,
    personalizationEffectiveness,
    alerts,
    recommendations
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Processing-Time': `${processingTime}ms`,
      'X-Analytics-Version': '1.0',
      'X-Data-Freshness': timeRange,
      'X-Metrics-Count': metrics.length.toString(),
      
      // Rate Limiting Headers
      'X-RateLimit-Limit': '20',
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
      
      // Cache Control for analytics data
      'Cache-Control': 'private, max-age=300', // 5 minutes cache
      
      // Security Headers
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
};

// Export handler with error handling
export default withErrorHandling(analyticsDashboardHandler);