// Enhanced Vercel Analytics integration with comprehensive tracking
// Includes Web Vitals, Speed Insights, and custom metrics

// Import Vercel Analytics - conditionally enabled based on environment
let track: ((event: string, properties?: Record<string, any>) => Promise<void>) | null = null;

// Only import and initialize in production or when explicitly enabled
if (process.env.NODE_ENV === 'production' && !process.env.DISABLE_VERCEL_ANALYTICS) {
  try {
    const analytics = require('@vercel/analytics/server');
    track = analytics.track;
  } catch (error: any) {
    console.warn('Vercel Analytics not available:', error?.message || error);
  }
}

/**
 * Enhanced performance metrics with Web Vitals integration
 */
export interface EnhancedPerformanceMetrics {
  // Basic metrics
  endpoint: string;
  method: string;
  statusCode: number;
  processingTime: number;
  cacheStatus: 'HIT' | 'MISS';
  userAgent?: string;
  region?: string;
  
  // User context
  userId: string;
  sessionId?: string;
  
  // Request specifics
  articlesCount: number;
  sortMode: string;
  timestamp: number;
  
  // Personalization metrics
  relevanceScore?: number;
  algorithmWeights?: {
    keywordMatch: number;
    symbolMatch: number;
    sentimentWeight: number;
    timeDecay: number;
  };
  
  // Performance breakdown
  databaseTime?: number;
  cacheTime?: number;
  totalProcessingTime?: number;
  
  // Web Vitals (when available)
  webVitals?: {
    LCP?: number; // Largest Contentful Paint
    FID?: number; // First Input Delay
    CLS?: number; // Cumulative Layout Shift
    FCP?: number; // First Contentful Paint
    TTFB?: number; // Time to First Byte
  };
  
  // User behavior
  isReturnUser?: boolean;
  previousRequestTime?: number;
  requestFrequency?: 'high' | 'medium' | 'low';
  
  // Error context
  errorDetails?: {
    type: string;
    message: string;
    stack?: string;
  };
}

/**
 * Personalization algorithm effectiveness metrics
 */
export interface PersonalizationMetrics {
  userId: string;
  sessionId?: string;
  timestamp: number;
  
  // Algorithm performance
  relevanceScore: number;
  userSatisfactionIndicators: {
    clickThroughRate?: number;
    timeSpent?: number;
    articlesConsumed?: number;
    bookmarkRate?: number;
  };
  
  // Algorithm components effectiveness
  componentScores: {
    keywordMatchScore: number;
    symbolMatchScore: number;
    sentimentScore: number;
    timeDecayScore: number;
    portfolioRelevanceScore: number;
  };
  
  // Content diversity metrics
  diversityMetrics: {
    categorySpread: number; // 0-1, higher = more diverse
    sourceSpread: number;
    sentimentSpread: number;
    timeSpread: number; // temporal diversity
  };
  
  // Cache effectiveness for personalization
  cacheEffectiveness: {
    userProfileCacheHit: boolean;
    portfolioCacheHit: boolean;
    newsCacheHit: boolean;
    totalCacheHitRate: number;
  };
}

/**
 * User behavior pattern metrics
 */
export interface UserBehaviorMetrics {
  userId: string;
  sessionId?: string;
  timestamp: number;
  
  // Usage patterns
  accessPattern: {
    timeOfDay: number; // 0-23
    dayOfWeek: number; // 0-6
    requestFrequency: number; // requests per day
    sessionDuration?: number;
  };
  
  // Preference indicators
  preferences: {
    preferredSortMode: string;
    averageArticlesRequested: number;
    categoryPreferences: Record<string, number>;
    sourcePreferences: Record<string, number>;
  };
  
  // Device and context
  context: {
    deviceType: 'mobile' | 'desktop' | 'tablet';
    connectionType?: 'slow-2g' | '2g' | '3g' | '4g' | '5g';
    region: string;
    timezone: string;
  };
  
  // Engagement metrics
  engagement: {
    averageResponseTime: number;
    errorEncountered: boolean;
    cacheHitRate: number;
    satisfactionScore?: number; // 0-1
  };
}

/**
 * Cache optimization metrics
 */
export interface CacheOptimizationMetrics {
  timestamp: number;
  cacheType: 'user_profile' | 'portfolio' | 'news' | 'personalization_context';
  
  // Cache performance
  hitRate: number;
  missRate: number;
  evictionRate: number;
  
  // Efficiency metrics
  cacheSize: number;
  maxCacheSize: number;
  utilizationRate: number;
  
  // Performance impact
  avgHitResponseTime: number;
  avgMissResponseTime: number;
  cacheEfficiencyScore: number; // 0-100
  
  // Optimization opportunities
  optimizationScore: number; // 0-100
  recommendedActions: string[];
}

/**
 * Real-time performance monitoring with thresholds
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private thresholds: Record<string, number>;
  private alertCallbacks: Array<(alert: PerformanceAlert) => void>;
  
  private constructor() {
    this.thresholds = {
      responseTime: 2000,
      cacheHitRate: 70,
      errorRate: 5,
      relevanceScore: 0.6,
      memoryUsage: 80
    };
    this.alertCallbacks = [];
  }
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }
  
  setThreshold(metric: string, value: number): void {
    this.thresholds[metric] = value;
  }
  
  addAlertCallback(callback: (alert: PerformanceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }
  
  checkThresholds(metrics: EnhancedPerformanceMetrics): PerformanceAlert[] {
    const alerts: PerformanceAlert[] = [];
    
    // Response time check
    if (metrics.processingTime > this.thresholds.responseTime) {
      alerts.push({
        type: 'performance',
        severity: 'critical',
        metric: 'responseTime',
        currentValue: metrics.processingTime,
        threshold: this.thresholds.responseTime,
        message: `Response time ${metrics.processingTime}ms exceeds threshold`,
        timestamp: Date.now(),
        userId: metrics.userId,
        endpoint: metrics.endpoint
      });
    }
    
    // Relevance score check
    if (metrics.relevanceScore && metrics.relevanceScore < this.thresholds.relevanceScore) {
      alerts.push({
        type: 'personalization',
        severity: 'warning',
        metric: 'relevanceScore',
        currentValue: metrics.relevanceScore,
        threshold: this.thresholds.relevanceScore,
        message: `Relevance score ${metrics.relevanceScore} below threshold`,
        timestamp: Date.now(),
        userId: metrics.userId,
        endpoint: metrics.endpoint
      });
    }
    
    // Trigger alert callbacks
    alerts.forEach(alert => {
      this.alertCallbacks.forEach(callback => callback(alert));
    });
    
    return alerts;
  }
}

export interface PerformanceAlert {
  type: 'performance' | 'cache' | 'personalization' | 'error';
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  currentValue: number;
  threshold: number;
  message: string;
  timestamp: number;
  userId: string;
  endpoint: string;
}

/**
 * Enhanced analytics tracking with Vercel Analytics integration
 */
export async function trackEnhancedMetrics(metrics: EnhancedPerformanceMetrics): Promise<void> {
  try {
    // Check performance thresholds
    const monitor = PerformanceMonitor.getInstance();
    const alerts = monitor.checkThresholds(metrics);
    
    // Track with Vercel Analytics (only in production)
    if (track && process.env.NODE_ENV === 'production') {
      // Core performance metrics
      await track('api_performance', {
        endpoint: metrics.endpoint,
        processing_time: metrics.processingTime,
        cache_status: metrics.cacheStatus,
        status_code: metrics.statusCode,
        region: metrics.region || 'unknown',
        user_id: metrics.userId,
        articles_count: metrics.articlesCount
      });
      
      // Personalization effectiveness
      if (metrics.relevanceScore !== undefined) {
        await track('personalization_effectiveness', {
          relevance_score: metrics.relevanceScore,
          user_id: metrics.userId,
          sort_mode: metrics.sortMode,
          cache_status: metrics.cacheStatus
        });
      }
      
      // Performance alerts
      for (const alert of alerts) {
        await track('performance_alert', {
          alert_type: alert.type,
          severity: alert.severity,
          metric: alert.metric,
          current_value: alert.currentValue,
          threshold: alert.threshold,
          user_id: alert.userId,
          endpoint: alert.endpoint
        });
      }
      
      // Web Vitals tracking
      if (metrics.webVitals) {
        await track('web_vitals', {
          lcp: metrics.webVitals.LCP,
          fid: metrics.webVitals.FID,
          cls: metrics.webVitals.CLS,
          fcp: metrics.webVitals.FCP,
          ttfb: metrics.webVitals.TTFB,
          endpoint: metrics.endpoint
        });
      }
    }
    
    // Structured logging for Vercel's log aggregation
    console.log(JSON.stringify({
      type: 'analytics:enhanced_performance',
      data: metrics,
      alerts: alerts.length > 0 ? alerts : undefined,
      timestamp: Date.now()
    }));
    
  } catch (error) {
    console.error('Failed to track enhanced metrics:', error);
  }
}

/**
 * Track personalization algorithm effectiveness
 */
export async function trackPersonalizationMetrics(metrics: PersonalizationMetrics): Promise<void> {
  try {
    if (track && process.env.NODE_ENV === 'production') {
      // Algorithm effectiveness
      await track('personalization_algorithm', {
        relevance_score: metrics.relevanceScore,
        keyword_score: metrics.componentScores.keywordMatchScore,
        symbol_score: metrics.componentScores.symbolMatchScore,
        sentiment_score: metrics.componentScores.sentimentScore,
        time_decay_score: metrics.componentScores.timeDecayScore,
        user_id: metrics.userId,
        cache_hit_rate: metrics.cacheEffectiveness.totalCacheHitRate
      });
      
      // Content diversity
      await track('content_diversity', {
        category_spread: metrics.diversityMetrics.categorySpread,
        source_spread: metrics.diversityMetrics.sourceSpread,
        sentiment_spread: metrics.diversityMetrics.sentimentSpread,
        time_spread: metrics.diversityMetrics.timeSpread,
        user_id: metrics.userId
      });
    }
    
    console.log(JSON.stringify({
      type: 'analytics:personalization',
      data: metrics,
      timestamp: Date.now()
    }));
    
  } catch (error) {
    console.error('Failed to track personalization metrics:', error);
  }
}

/**
 * Track user behavior patterns
 */
export async function trackUserBehavior(metrics: UserBehaviorMetrics): Promise<void> {
  try {
    if (track && process.env.NODE_ENV === 'production') {
      // Usage patterns
      await track('user_behavior', {
        time_of_day: metrics.accessPattern.timeOfDay,
        day_of_week: metrics.accessPattern.dayOfWeek,
        request_frequency: metrics.accessPattern.requestFrequency,
        preferred_sort: metrics.preferences.preferredSortMode,
        device_type: metrics.context.deviceType,
        region: metrics.context.region,
        user_id: metrics.userId,
        cache_hit_rate: metrics.engagement.cacheHitRate
      });
    }
    
    console.log(JSON.stringify({
      type: 'analytics:user_behavior',
      data: metrics,
      timestamp: Date.now()
    }));
    
  } catch (error) {
    console.error('Failed to track user behavior:', error);
  }
}

/**
 * Track cache optimization metrics
 */
export async function trackCacheOptimization(metrics: CacheOptimizationMetrics): Promise<void> {
  try {
    if (track && process.env.NODE_ENV === 'production') {
      await track('cache_optimization', {
        cache_type: metrics.cacheType,
        hit_rate: metrics.hitRate,
        efficiency_score: metrics.cacheEfficiencyScore,
        utilization_rate: metrics.utilizationRate,
        optimization_score: metrics.optimizationScore
      });
    }
    
    console.log(JSON.stringify({
      type: 'analytics:cache_optimization',
      data: metrics,
      timestamp: Date.now()
    }));
    
  } catch (error) {
    console.error('Failed to track cache optimization metrics:', error);
  }
}

/**
 * Generate comprehensive analytics report
 */
export function generateAnalyticsReport(
  performanceMetrics: EnhancedPerformanceMetrics[],
  personalizationMetrics: PersonalizationMetrics[],
  userBehaviorMetrics: UserBehaviorMetrics[],
  cacheMetrics: CacheOptimizationMetrics[]
): AnalyticsReport {
  return {
    generatedAt: new Date().toISOString(),
    timeRange: '24h', // configurable
    summary: {
      totalRequests: performanceMetrics.length,
      uniqueUsers: new Set(performanceMetrics.map(m => m.userId)).size,
      averageResponseTime: performanceMetrics.reduce((sum, m) => sum + m.processingTime, 0) / performanceMetrics.length || 0,
      cacheHitRate: performanceMetrics.filter(m => m.cacheStatus === 'HIT').length / performanceMetrics.length * 100 || 0,
      averageRelevanceScore: personalizationMetrics.reduce((sum, m) => sum + m.relevanceScore, 0) / personalizationMetrics.length || 0
    },
    performance: {
      p50ResponseTime: calculatePercentile(performanceMetrics.map(m => m.processingTime), 0.5),
      p95ResponseTime: calculatePercentile(performanceMetrics.map(m => m.processingTime), 0.95),
      p99ResponseTime: calculatePercentile(performanceMetrics.map(m => m.processingTime), 0.99),
      errorRate: performanceMetrics.filter(m => m.statusCode >= 400).length / performanceMetrics.length * 100 || 0
    },
    personalization: {
      algorithmEffectiveness: calculateAlgorithmEffectiveness(personalizationMetrics),
      contentDiversity: calculateContentDiversity(personalizationMetrics),
      userSatisfaction: calculateUserSatisfaction(personalizationMetrics)
    },
    cache: {
      overallEfficiency: cacheMetrics.reduce((sum, m) => sum + m.cacheEfficiencyScore, 0) / cacheMetrics.length || 0,
      optimizationOpportunities: extractOptimizationOpportunities(cacheMetrics)
    },
    recommendations: generateRecommendations(performanceMetrics, personalizationMetrics, cacheMetrics)
  };
}

interface AnalyticsReport {
  generatedAt: string;
  timeRange: string;
  summary: {
    totalRequests: number;
    uniqueUsers: number;
    averageResponseTime: number;
    cacheHitRate: number;
    averageRelevanceScore: number;
  };
  performance: {
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    errorRate: number;
  };
  personalization: {
    algorithmEffectiveness: number;
    contentDiversity: number;
    userSatisfaction: number;
  };
  cache: {
    overallEfficiency: number;
    optimizationOpportunities: string[];
  };
  recommendations: Array<{
    category: string;
    priority: 'high' | 'medium' | 'low';
    description: string;
    expectedImpact: string;
  }>;
}

// Helper functions
function calculatePercentile(values: number[], percentile: number): number {
  const sorted = values.sort((a, b) => a - b);
  const index = Math.floor(sorted.length * percentile);
  return sorted[index] || 0;
}

function calculateAlgorithmEffectiveness(metrics: PersonalizationMetrics[]): number {
  if (metrics.length === 0) return 0;
  return metrics.reduce((sum, m) => sum + m.relevanceScore, 0) / metrics.length;
}

function calculateContentDiversity(metrics: PersonalizationMetrics[]): number {
  if (metrics.length === 0) return 0;
  return metrics.reduce((sum, m) => 
    sum + (m.diversityMetrics.categorySpread + m.diversityMetrics.sourceSpread) / 2, 0
  ) / metrics.length;
}

function calculateUserSatisfaction(metrics: PersonalizationMetrics[]): number {
  if (metrics.length === 0) return 0;
  const satisfactionScores = metrics
    .map(m => m.userSatisfactionIndicators.clickThroughRate || 0)
    .filter(score => score > 0);
  return satisfactionScores.reduce((sum, score) => sum + score, 0) / satisfactionScores.length || 0;
}

function extractOptimizationOpportunities(metrics: CacheOptimizationMetrics[]): string[] {
  const opportunities = new Set<string>();
  metrics.forEach(metric => {
    metric.recommendedActions.forEach(action => opportunities.add(action));
  });
  return Array.from(opportunities);
}

function generateRecommendations(
  performanceMetrics: EnhancedPerformanceMetrics[],
  personalizationMetrics: PersonalizationMetrics[],
  cacheMetrics: CacheOptimizationMetrics[]
): AnalyticsReport['recommendations'] {
  const recommendations: AnalyticsReport['recommendations'] = [];
  
  // Performance recommendations
  const avgResponseTime = performanceMetrics.reduce((sum, m) => sum + m.processingTime, 0) / performanceMetrics.length;
  if (avgResponseTime > 1000) {
    recommendations.push({
      category: 'performance',
      priority: 'high',
      description: 'Average response time exceeds 1 second. Consider optimizing database queries and implementing more aggressive caching.',
      expectedImpact: 'Reduce average response time by 30-50%'
    });
  }
  
  // Personalization recommendations
  const avgRelevance = personalizationMetrics.reduce((sum, m) => sum + m.relevanceScore, 0) / personalizationMetrics.length;
  if (avgRelevance < 0.7) {
    recommendations.push({
      category: 'personalization',
      priority: 'medium',
      description: 'Personalization relevance score is below optimal. Consider fine-tuning algorithm weights or implementing machine learning enhancements.',
      expectedImpact: 'Improve user engagement by 15-25%'
    });
  }
  
  // Cache recommendations
  const avgCacheEfficiency = cacheMetrics.reduce((sum, m) => sum + m.cacheEfficiencyScore, 0) / cacheMetrics.length;
  if (avgCacheEfficiency < 70) {
    recommendations.push({
      category: 'cache',
      priority: 'medium',
      description: 'Cache efficiency is below optimal. Consider increasing TTL for stable content and implementing smarter eviction policies.',
      expectedImpact: 'Improve cache hit rate by 20-30%'
    });
  }
  
  return recommendations;
}