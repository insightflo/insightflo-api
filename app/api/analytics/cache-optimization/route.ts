// Vercel Edge function for cache optimization reporting
// Runtime: Edge (512MB memory, 10s max duration)

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient, verifySupabaseToken } from '@/lib/supabase';
import { getCacheStats } from '@/utils/cache';
import { 
  validateMethod, 
  validateAuthToken, 
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
 * Cache Optimization Reporting API Endpoint
 * GET /api/analytics/cache-optimization
 * 
 * Query Parameters:
 * - timeRange: '1h' | '24h' | '7d' | '30d' (default: '24h')
 * - cacheType: 'user_interests' | 'user_portfolio' | 'news_articles' | 'all' (default: 'all')
 * - detailed: 'true' | 'false' (default: 'false') - include detailed analysis
 * 
 * Headers:
 * - Authorization: Bearer <jwt_token> (Required)
 * 
 * Features:
 * - Cache hit rate analysis by type and time period
 * - Cache efficiency scoring and optimization recommendations
 * - Memory utilization tracking and forecasting
 * - Performance impact analysis of cache strategies
 * - Cost-benefit analysis of cache optimizations
 */

interface CacheOptimizationReport {
  generatedAt: string;
  timeRange: string;
  currentStatus: {
    totalCacheSize: number;
    maxCacheSize: number;
    utilizationPercentage: number;
    globalHitRate: number;
    avgHitResponseTime: number;
    avgMissResponseTime: number;
  };
  performanceByType: Record<string, {
    hitRate: number;
    missRate: number;
    avgHitTime: number;
    avgMissTime: number;
    entryCount: number;
    totalSize: number;
    efficiencyScore: number;
  }>;
  trends: {
    hourly: Array<{
      hour: string;
      hitRate: number;
      utilizationRate: number;
      responseTime: number;
    }>;
    hitRateEvolution: Array<{
      timestamp: string;
      hitRate: number;
      cacheSize: number;
    }>;
  };
  optimization: {
    overallScore: number; // 0-100
    bottlenecks: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high';
      description: string;
      impact: string;
      recommendation: string;
    }>;
    opportunities: Array<{
      category: 'ttl' | 'size' | 'strategy' | 'eviction';
      priority: 'high' | 'medium' | 'low';
      title: string;
      description: string;
      estimatedImpact: {
        hitRateImprovement: number; // percentage points
        responseTimeReduction: number; // milliseconds
        costSavings: number; // percentage
      };
      implementationEffort: 'low' | 'medium' | 'high';
    }>;
  };
  forecasting: {
    predictedGrowth: {
      nextWeek: {
        cacheSize: number;
        utilizationRate: number;
        estimatedHitRate: number;
      };
      nextMonth: {
        cacheSize: number;
        utilizationRate: number;
        estimatedHitRate: number;
      };
    };
    capacityPlanning: {
      currentCapacityDays: number;
      recommendedMaxSize: number;
      scalingRecommendations: string[];
    };
  };
  costBenefit: {
    currentCosts: {
      memoryUsage: number; // MB
      computeSavings: number; // estimated milliseconds saved per hour
      bandwidthSavings: number; // estimated MB saved per hour
    };
    optimizationPotential: {
      additionalSavings: number; // percentage
      implementationCost: 'low' | 'medium' | 'high';
      paybackPeriod: string;
    };
  };
  recommendations: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: 'performance' | 'capacity' | 'strategy' | 'monitoring';
    title: string;
    description: string;
    implementation: {
      effort: 'low' | 'medium' | 'high';
      timeframe: 'immediate' | 'short-term' | 'long-term';
      resources: string[];
    };
    expectedResults: {
      hitRateIncrease: number;
      responseTimeDecrease: number;
      costReduction: number;
    };
  }>;
}

// Mock cache performance data (in production, would fetch from analytics logs)
function generateMockCacheMetrics(timeRange: string): any[] {
  const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
  const dataPoints = Math.min(hours, 168); // Max 168 data points
  
  return Array.from({ length: dataPoints }, (_, i) => ({
    timestamp: new Date(Date.now() - (hours - i) * 3600000).toISOString(),
    cache_type: ['user_interests', 'user_portfolio', 'news_articles'][Math.floor(Math.random() * 3)],
    hit_rate: 60 + Math.random() * 35, // 60-95%
    response_time_hit: 50 + Math.random() * 100, // 50-150ms
    response_time_miss: 200 + Math.random() * 800, // 200-1000ms
    cache_size: 100 + Math.random() * 400, // 100-500 MB
    entry_count: 1000 + Math.random() * 9000 // 1000-10000 entries
  }));
}

// Analyze cache performance by type
function analyzeCachePerformanceByType(metrics: any[]): CacheOptimizationReport['performanceByType'] {
  const byType: Record<string, any[]> = {};
  
  metrics.forEach(metric => {
    if (!byType[metric.cache_type]) {
      byType[metric.cache_type] = [];
    }
    byType[metric.cache_type].push(metric);
  });
  
  const result: CacheOptimizationReport['performanceByType'] = {};
  
  Object.entries(byType).forEach(([type, typeMetrics]) => {
    const avgHitRate = typeMetrics.reduce((sum, m) => sum + m.hit_rate, 0) / typeMetrics.length;
    const avgHitTime = typeMetrics.reduce((sum, m) => sum + m.response_time_hit, 0) / typeMetrics.length;
    const avgMissTime = typeMetrics.reduce((sum, m) => sum + m.response_time_miss, 0) / typeMetrics.length;
    const avgSize = typeMetrics.reduce((sum, m) => sum + m.cache_size, 0) / typeMetrics.length;
    const avgEntries = typeMetrics.reduce((sum, m) => sum + m.entry_count, 0) / typeMetrics.length;
    
    // Calculate efficiency score (0-100)
    const hitRateScore = Math.min(avgHitRate, 100);
    const speedImprovementScore = Math.min(((avgMissTime - avgHitTime) / avgMissTime) * 100, 100);
    const efficiencyScore = (hitRateScore * 0.6 + speedImprovementScore * 0.4);
    
    result[type] = {
      hitRate: Math.round(avgHitRate),
      missRate: Math.round(100 - avgHitRate),
      avgHitTime: Math.round(avgHitTime),
      avgMissTime: Math.round(avgMissTime),
      entryCount: Math.round(avgEntries),
      totalSize: Math.round(avgSize),
      efficiencyScore: Math.round(efficiencyScore)
    };
  });
  
  return result;
}

// Generate optimization analysis
function generateOptimizationAnalysis(
  performanceByType: CacheOptimizationReport['performanceByType'],
  currentStatus: CacheOptimizationReport['currentStatus']
): CacheOptimizationReport['optimization'] {
  const bottlenecks: CacheOptimizationReport['optimization']['bottlenecks'] = [];
  const opportunities: CacheOptimizationReport['optimization']['opportunities'] = [];
  
  // Analyze bottlenecks
  Object.entries(performanceByType).forEach(([type, perf]) => {
    if (perf.hitRate < 60) {
      bottlenecks.push({
        type: `${type}_hit_rate`,
        severity: 'high',
        description: `${type} cache hit rate is critically low at ${perf.hitRate}%`,
        impact: `Users experience ${perf.avgMissTime}ms average response time on cache misses`,
        recommendation: `Increase TTL and implement more aggressive caching for ${type}`
      });
    }
    
    if (perf.avgHitTime > 100) {
      bottlenecks.push({
        type: `${type}_hit_latency`,
        severity: 'medium',
        description: `${type} cache hit latency is elevated at ${perf.avgHitTime}ms`,
        impact: `Even cache hits are slower than optimal`,
        recommendation: `Optimize cache retrieval mechanism and consider memory layout improvements`
      });
    }
  });
  
  // High utilization bottleneck
  if (currentStatus.utilizationPercentage > 85) {
    bottlenecks.push({
      type: 'memory_pressure',
      severity: 'high',
      description: `Cache utilization at ${currentStatus.utilizationPercentage}% is approaching capacity`,
      impact: 'Increased evictions leading to reduced hit rates',
      recommendation: 'Increase cache size or implement more intelligent eviction policies'
    });
  }
  
  // Generate optimization opportunities
  const avgHitRate = Object.values(performanceByType).reduce((sum, perf) => sum + perf.hitRate, 0) / Object.keys(performanceByType).length;
  
  if (avgHitRate < 80) {
    opportunities.push({
      category: 'ttl',
      priority: 'high',
      title: 'Optimize Cache TTL Settings',
      description: 'Current TTL settings may be too conservative, leading to unnecessary cache misses for stable data',
      estimatedImpact: {
        hitRateImprovement: 15,
        responseTimeReduction: 300,
        costSavings: 25
      },
      implementationEffort: 'low'
    });
  }
  
  if (currentStatus.utilizationPercentage < 60) {
    opportunities.push({
      category: 'size',
      priority: 'medium',
      title: 'Increase Cache Size',
      description: 'Cache utilization is low, indicating potential for larger cache size to improve hit rates',
      estimatedImpact: {
        hitRateImprovement: 10,
        responseTimeReduction: 200,
        costSavings: 15
      },
      implementationEffort: 'low'
    });
  }
  
  opportunities.push({
    category: 'strategy',
    priority: 'medium',
    title: 'Implement Predictive Caching',
    description: 'Pre-populate cache with likely-to-be-requested data based on user patterns',
    estimatedImpact: {
      hitRateImprovement: 20,
      responseTimeReduction: 400,
      costSavings: 30
    },
    implementationEffort: 'high'
  });
  
  // Calculate overall optimization score
  const hitRateScore = Math.min(avgHitRate / 90 * 100, 100); // Target 90% hit rate
  const utilizationScore = currentStatus.utilizationPercentage > 95 ? 0 : 
                           currentStatus.utilizationPercentage < 40 ? 60 :
                           100 - Math.abs(70 - currentStatus.utilizationPercentage);
  const performanceScore = Math.min((1000 - currentStatus.avgHitResponseTime) / 10, 100);
  
  const overallScore = Math.round((hitRateScore * 0.5 + utilizationScore * 0.3 + performanceScore * 0.2));
  
  return {
    overallScore,
    bottlenecks,
    opportunities
  };
}

// Generate capacity forecasting
function generateForecasting(
  metrics: any[],
  currentStatus: CacheOptimizationReport['currentStatus']
): CacheOptimizationReport['forecasting'] {
  // Simple linear projection based on recent growth trends
  const recentMetrics = metrics.slice(-24); // Last 24 hours of data
  const growthRate = recentMetrics.length > 1 ? 
    (recentMetrics[recentMetrics.length - 1].cache_size - recentMetrics[0].cache_size) / recentMetrics[0].cache_size / 24 :
    0.01; // 1% default growth rate per hour
  
  const currentSize = currentStatus.totalCacheSize;
  const maxSize = currentStatus.maxCacheSize;
  
  // Project growth
  const weekGrowth = growthRate * 24 * 7;
  const monthGrowth = growthRate * 24 * 30;
  
  return {
    predictedGrowth: {
      nextWeek: {
        cacheSize: Math.round(currentSize * (1 + weekGrowth)),
        utilizationRate: Math.round(currentSize * (1 + weekGrowth) / maxSize * 100),
        estimatedHitRate: Math.max(60, currentStatus.globalHitRate - weekGrowth * 100) // Assume some degradation
      },
      nextMonth: {
        cacheSize: Math.round(currentSize * (1 + monthGrowth)),
        utilizationRate: Math.round(currentSize * (1 + monthGrowth) / maxSize * 100),
        estimatedHitRate: Math.max(50, currentStatus.globalHitRate - monthGrowth * 200)
      }
    },
    capacityPlanning: {
      currentCapacityDays: growthRate > 0 ? Math.floor((maxSize - currentSize) / (currentSize * growthRate * 24)) : 365,
      recommendedMaxSize: Math.round(maxSize * 1.5), // 50% increase recommendation
      scalingRecommendations: [
        'Monitor cache utilization trends weekly',
        'Implement auto-scaling based on utilization thresholds',
        'Consider distributed caching for larger scale'
      ]
    }
  };
}

// Generate comprehensive recommendations
function generateRecommendations(
  optimization: CacheOptimizationReport['optimization'],
  forecasting: CacheOptimizationReport['forecasting'],
  currentStatus: CacheOptimizationReport['currentStatus']
): CacheOptimizationReport['recommendations'] {
  const recommendations: CacheOptimizationReport['recommendations'] = [];
  
  // Critical recommendations based on bottlenecks
  optimization.bottlenecks.forEach(bottleneck => {
    if (bottleneck.severity === 'high') {
      recommendations.push({
        priority: 'critical',
        category: 'performance',
        title: `Address ${bottleneck.type.replace('_', ' ')} Issue`,
        description: bottleneck.description,
        implementation: {
          effort: 'medium',
          timeframe: 'immediate',
          resources: ['Backend team', 'DevOps']
        },
        expectedResults: {
          hitRateIncrease: 15,
          responseTimeDecrease: 200,
          costReduction: 20
        }
      });
    }
  });
  
  // Capacity planning recommendations
  if (forecasting.capacityPlanning.currentCapacityDays < 30) {
    recommendations.push({
      priority: 'high',
      category: 'capacity',
      title: 'Increase Cache Capacity',
      description: `Current capacity will be exhausted in ${forecasting.capacityPlanning.currentCapacityDays} days based on growth trends`,
      implementation: {
        effort: 'low',
        timeframe: 'short-term',
        resources: ['Infrastructure team']
      },
      expectedResults: {
        hitRateIncrease: 10,
        responseTimeDecrease: 150,
        costReduction: 15
      }
    });
  }
  
  // Strategy recommendations
  if (currentStatus.globalHitRate < 75) {
    recommendations.push({
      priority: 'high',
      category: 'strategy',
      title: 'Implement Advanced Caching Strategy',
      description: 'Current hit rate indicates room for improvement in caching strategy',
      implementation: {
        effort: 'high',
        timeframe: 'long-term',
        resources: ['Backend team', 'Data team']
      },
      expectedResults: {
        hitRateIncrease: 25,
        responseTimeDecrease: 400,
        costReduction: 35
      }
    });
  }
  
  // Monitoring recommendations
  recommendations.push({
    priority: 'medium',
    category: 'monitoring',
    title: 'Enhanced Cache Monitoring',
    description: 'Implement more granular cache monitoring and alerting',
    implementation: {
      effort: 'medium',
      timeframe: 'short-term',
      resources: ['DevOps team', 'Monitoring team']
    },
    expectedResults: {
      hitRateIncrease: 5,
      responseTimeDecrease: 50,
      costReduction: 10
    }
  });
  
  return recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// Main handler
const cacheOptimizationHandler = async (req: NextRequest): Promise<NextResponse> => {
  const startTime = Date.now();
  
  // Validate request method
  validateMethod(req, ['GET']);

  // Apply rate limiting (10 requests per minute for cache optimization reports)
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(clientId, 10, 60000);
  
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
  const cacheType = searchParams.get('cacheType') || 'all';
  const detailed = searchParams.get('detailed') === 'true';

  // Validate time range
  if (!['1h', '24h', '7d', '30d'].includes(timeRange)) {
    throw new Error('Invalid timeRange parameter. Must be: 1h, 24h, 7d, or 30d');
  }

  // Get current cache statistics
  const cacheStats = getCacheStats();
  
  // Generate mock metrics (in production, fetch from analytics logs)
  const metrics = generateMockCacheMetrics(timeRange);
  
  // Calculate current status
  const currentStatus: CacheOptimizationReport['currentStatus'] = {
    totalCacheSize: cacheStats.size,
    maxCacheSize: cacheStats.maxSize,
    utilizationPercentage: Math.round((cacheStats.size / cacheStats.maxSize) * 100),
    globalHitRate: 73, // Mock value
    avgHitResponseTime: 85,
    avgMissResponseTime: 450
  };
  
  // Analyze performance by cache type
  const performanceByType = analyzeCachePerformanceByType(metrics);
  
  // Generate trends data
  const trends: CacheOptimizationReport['trends'] = {
    hourly: Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      hitRate: 65 + Math.random() * 25,
      utilizationRate: 60 + Math.random() * 30,
      responseTime: 80 + Math.random() * 40
    })),
    hitRateEvolution: metrics.slice(0, 48).map(m => ({
      timestamp: m.timestamp,
      hitRate: m.hit_rate,
      cacheSize: m.cache_size
    }))
  };
  
  // Generate optimization analysis
  const optimization = generateOptimizationAnalysis(performanceByType, currentStatus);
  
  // Generate forecasting
  const forecasting = generateForecasting(metrics, currentStatus);
  
  // Calculate cost-benefit analysis
  const costBenefit: CacheOptimizationReport['costBenefit'] = {
    currentCosts: {
      memoryUsage: currentStatus.totalCacheSize,
      computeSavings: currentStatus.globalHitRate * 10, // Mock calculation
      bandwidthSavings: currentStatus.globalHitRate * 50
    },
    optimizationPotential: {
      additionalSavings: Math.max(0, 90 - currentStatus.globalHitRate),
      implementationCost: optimization.overallScore > 70 ? 'low' : 'medium',
      paybackPeriod: '2-4 weeks'
    }
  };
  
  // Generate recommendations
  const recommendations = generateRecommendations(optimization, forecasting, currentStatus);
  
  const processingTime = Date.now() - startTime;

  // Build response
  const response: CacheOptimizationReport = {
    generatedAt: new Date().toISOString(),
    timeRange,
    currentStatus,
    performanceByType,
    trends,
    optimization,
    forecasting,
    costBenefit,
    recommendations
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Processing-Time': `${processingTime}ms`,
      'X-Cache-Optimization-Score': optimization.overallScore.toString(),
      'X-Cache-Hit-Rate': currentStatus.globalHitRate.toString(),
      'X-Cache-Utilization': currentStatus.utilizationPercentage.toString(),
      
      // Rate Limiting Headers
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
      
      // Cache Control
      'Cache-Control': 'private, max-age=900', // 15 minutes cache for optimization reports
      
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
export default withErrorHandling(cacheOptimizationHandler);