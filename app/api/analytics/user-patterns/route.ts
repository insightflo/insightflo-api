// Vercel Edge function for user API pattern analysis
// Runtime: Edge (512MB memory, 10s max duration)

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient, verifySupabaseToken } from '@/lib/supabase';
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
 * User API Pattern Analysis Endpoint
 * GET /api/analytics/user-patterns
 * 
 * Query Parameters:
 * - timeRange: '1h' | '24h' | '7d' | '30d' (default: '24h')
 * - userId: specific user analysis (optional, admin only)
 * - groupBy: 'user' | 'time' | 'endpoint' | 'device' (default: 'user')
 * - detailed: 'true' | 'false' (default: 'false')
 * 
 * Headers:
 * - Authorization: Bearer <jwt_token> (Required)
 * 
 * Features:
 * - User behavior pattern identification
 * - API usage frequency and timing analysis
 * - Device and location pattern tracking
 * - Preference learning and prediction
 * - Anomaly detection in usage patterns
 * - User segmentation based on behavior
 */

interface UserPatternAnalysis {
  generatedAt: string;
  timeRange: string;
  totalUsers: number;
  totalRequests: number;
  analysisScope: 'individual' | 'aggregate';
  
  userSegmentation: {
    segments: Array<{
      name: string;
      description: string;
      userCount: number;
      percentage: number;
      characteristics: {
        avgRequestsPerDay: number;
        preferredTimeWindow: string;
        mostUsedEndpoint: string;
        avgSessionDuration: number;
        preferredSortMode: string;
        avgArticlesRequested: number;
      };
      engagementScore: number; // 0-100
    }>;
    recommendedActions: Array<{
      segment: string;
      action: string;
      expectedImpact: string;
    }>;
  };
  
  temporalPatterns: {
    hourlyDistribution: Record<string, number>; // "00" to "23"
    dailyDistribution: Record<string, number>; // "monday" to "sunday"
    peakUsageHours: string[];
    lowUsageHours: string[];
    seasonalTrends: {
      detected: boolean;
      pattern: string;
      confidence: number;
    };
  };
  
  geographicDistribution: {
    byRegion: Record<string, {
      userCount: number;
      requestCount: number;
      avgResponseTime: number;
      preferredLanguage?: string;
    }>;
    performanceByRegion: Record<string, {
      avgResponseTime: number;
      cacheHitRate: number;
      errorRate: number;
    }>;
  };
  
  deviceAndPlatform: {
    deviceTypes: Record<string, {
      userCount: number;
      requestCount: number;
      avgSessionLength: number;
      bounceRate: number;
    }>;
    browserDistribution: Record<string, number>;
    mobileVsDesktop: {
      mobile: { users: number; requests: number; avgResponseTime: number };
      desktop: { users: number; requests: number; avgResponseTime: number };
    };
  };
  
  apiUsagePatterns: {
    endpointPopularity: Record<string, {
      requestCount: number;
      uniqueUsers: number;
      avgResponseTime: number;
      errorRate: number;
    }>;
    requestSequences: Array<{
      sequence: string[];
      frequency: number;
      avgTimeBetween: number;
      conversionRate?: number;
    }>;
    parameterUsage: {
      sortModeDistribution: Record<string, number>;
      limitDistribution: Record<string, number>;
      filterUsage: Record<string, number>;
    };
  };
  
  userJourneyAnalysis: {
    commonPaths: Array<{
      path: string[];
      userCount: number;
      avgCompletionTime: number;
      dropoffPoints: string[];
    }>;
    sessionAnalytics: {
      avgSessionDuration: number;
      avgRequestsPerSession: number;
      sessionsByDuration: Record<string, number>; // "<1min", "1-5min", etc.
    };
    retentionMetrics: {
      dailyActiveUsers: number;
      weeklyActiveUsers: number;
      monthlyActiveUsers: number;
      retentionRate: {
        day1: number;
        day7: number;
        day30: number;
      };
    };
  };
  
  personalizationInsights: {
    algorithmPreferences: {
      sortByRelevance: number;
      sortByLatest: number;
      customFilters: number;
    };
    contentPreferences: {
      avgArticlesPerRequest: number;
      categoryPreferences: Record<string, number>;
      sentimentPreferences: Record<string, number>;
      sourcePreferences: Record<string, number>;
    };
    cacheEffectiveness: {
      personalizedCacheHitRate: number;
      timeToPersonalization: number;
      relevanceScoreDistribution: Record<string, number>;
    };
  };
  
  anomalyDetection: {
    detectedAnomalies: Array<{
      type: 'usage_spike' | 'error_burst' | 'unusual_pattern' | 'performance_degradation';
      severity: 'low' | 'medium' | 'high';
      description: string;
      affectedUsers: number;
      timeframe: string;
      possibleCauses: string[];
      recommendedActions: string[];
    }>;
    suspiciousActivity: Array<{
      userId: string;
      activityType: string;
      riskScore: number; // 0-100
      details: string;
    }>;
  };
  
  predictiveInsights: {
    usageForecasting: {
      nextHour: { expectedRequests: number; confidence: number };
      nextDay: { expectedRequests: number; confidence: number };
      nextWeek: { expectedRequests: number; confidence: number };
    };
    userBehaviorPredictions: Array<{
      userId: string;
      predictedNextAction: string;
      confidence: number;
      timeframe: string;
    }>;
    resourcePlanning: {
      predictedPeakLoad: number;
      recommendedScaling: string;
      costOptimizationOpportunities: string[];
    };
  };
  
  recommendations: Array<{
    category: 'user_experience' | 'performance' | 'engagement' | 'infrastructure';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    targetSegment?: string;
    expectedImpact: {
      userSatisfaction: string;
      performance: string;
      engagement: string;
    };
    implementation: {
      effort: 'low' | 'medium' | 'high';
      timeline: string;
      resources: string[];
    };
  }>;
}

// Mock data generators (in production, fetch from analytics logs)
function generateMockUserData(timeRange: string): any[] {
  const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
  const userCount = Math.min(1000, hours * 10);
  
  return Array.from({ length: userCount }, (_, i) => ({
    user_id: `user_${i}`,
    timestamp: new Date(Date.now() - Math.random() * hours * 3600000).toISOString(),
    endpoint: ['/api/news/personalized', '/api/push/trigger'][Math.floor(Math.random() * 2)],
    device_type: ['mobile', 'desktop', 'tablet'][Math.floor(Math.random() * 3)],
    user_agent: 'mock_agent',
    region: ['icn1', 'nrt1', 'sin1', 'hnd1', 'sfo1'][Math.floor(Math.random() * 5)],
    processing_time: 100 + Math.random() * 500,
    sort_mode: ['relevance', 'latest'][Math.floor(Math.random() * 2)],
    articles_count: 10 + Math.floor(Math.random() * 90),
    cache_status: Math.random() > 0.3 ? 'HIT' : 'MISS',
    session_id: `session_${Math.floor(i / 5)}`, // Group users into sessions
    request_sequence: Math.floor(Math.random() * 10) + 1
  }));
}

// Analyze user segmentation
function analyzeUserSegmentation(userData: any[]): UserPatternAnalysis['userSegmentation'] {
  // Group users by behavior patterns
  const userStats = userData.reduce((stats, record: any) => {
    const userId = record.user_id;
    if (!stats[userId]) {
      stats[userId] = {
        requestCount: 0,
        totalProcessingTime: 0,
        sortModes: {},
        deviceTypes: {},
        endpoints: {},
        sessions: new Set(),
        avgArticles: 0,
        cacheHits: 0
      };
    }
    
    const user = stats[userId];
    user.requestCount++;
    user.totalProcessingTime += record.processing_time;
    user.sortModes[record.sort_mode] = (user.sortModes[record.sort_mode] || 0) + 1;
    user.deviceTypes[record.device_type] = (user.deviceTypes[record.device_type] || 0) + 1;
    user.endpoints[record.endpoint] = (user.endpoints[record.endpoint] || 0) + 1;
    user.sessions.add(record.session_id);
    user.avgArticles += record.articles_count;
    if (record.cache_status === 'HIT') user.cacheHits++;
    
    return stats;
  }, {} as Record<string, any>);

  // Define segments based on usage patterns
  const segments = [
    {
      name: 'Power Users',
      description: 'High-frequency users with consistent daily usage',
      filter: (user: any) => user.requestCount > 20 && user.sessions.size > 3,
      characteristics: { color: '#2563eb', priority: 'high' }
    },
    {
      name: 'Regular Users',
      description: 'Moderate usage with regular patterns',
      filter: (user: any) => user.requestCount >= 5 && user.requestCount <= 20,
      characteristics: { color: '#16a34a', priority: 'medium' }
    },
    {
      name: 'Casual Users',
      description: 'Low-frequency users with sporadic usage',
      filter: (user: any) => user.requestCount < 5,
      characteristics: { color: '#ca8a04', priority: 'low' }
    },
    {
      name: 'Mobile-First Users',
      description: 'Primarily access via mobile devices',
      filter: (user: any) => (user.deviceTypes.mobile || 0) > (user.requestCount * 0.7),
      characteristics: { color: '#dc2626', priority: 'medium' }
    }
  ];

  const segmentAnalysis = segments.map(segment => {
    const segmentUsers = Object.entries(userStats).filter(([_, user]: [string, any]) => segment.filter(user));
    const userCount = segmentUsers.length;
    
    if (userCount === 0) {
      return {
        name: segment.name,
        description: segment.description,
        userCount: 0,
        percentage: 0,
        characteristics: {
          avgRequestsPerDay: 0,
          preferredTimeWindow: 'N/A',
          mostUsedEndpoint: 'N/A',
          avgSessionDuration: 0,
          preferredSortMode: 'N/A',
          avgArticlesRequested: 0
        },
        engagementScore: 0
      };
    }

    const avgRequests = segmentUsers.reduce((sum, [_, user]: [string, any]) => sum + user.requestCount, 0) / userCount;
    const avgArticles = segmentUsers.reduce((sum, [_, user]: [string, any]) => sum + user.avgArticles / user.requestCount, 0) / userCount;
    
    // Most common sort mode
    const allSortModes: Record<string, number> = {};
    segmentUsers.forEach(([_, user]: [string, any]) => {
      Object.entries(user.sortModes).forEach(([mode, count]) => {
        allSortModes[mode] = (allSortModes[mode] || 0) + (count as number);
      });
    });
    const preferredSortMode = Object.entries(allSortModes).sort(([,a], [,b]) => b - a)[0]?.[0] || 'relevance';
    
    // Most used endpoint
    const allEndpoints: Record<string, number> = {};
    segmentUsers.forEach(([_, user]: [string, any]) => {
      Object.entries(user.endpoints).forEach(([endpoint, count]) => {
        allEndpoints[endpoint] = (allEndpoints[endpoint] || 0) + (count as number);
      });
    });
    const mostUsedEndpoint = Object.entries(allEndpoints).sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A';

    // Calculate engagement score
    const engagementScore = Math.min(100, Math.round((avgRequests * 5) + (avgArticles * 2)));

    return {
      name: segment.name,
      description: segment.description,
      userCount,
      percentage: Math.round((userCount / Object.keys(userStats).length) * 100),
      characteristics: {
        avgRequestsPerDay: Math.round(avgRequests),
        preferredTimeWindow: '09:00-18:00', // Mock data
        mostUsedEndpoint: mostUsedEndpoint.replace('/api/', ''),
        avgSessionDuration: 12.5, // Mock data in minutes
        preferredSortMode,
        avgArticlesRequested: Math.round(avgArticles)
      },
      engagementScore
    };
  });

  const recommendedActions = [
    { segment: 'Power Users', action: 'Implement advanced features and premium content', expectedImpact: 'Increase retention by 25%' },
    { segment: 'Regular Users', action: 'Send personalized notifications during peak usage', expectedImpact: 'Boost engagement by 15%' },
    { segment: 'Casual Users', action: 'Implement re-engagement campaigns', expectedImpact: 'Convert 10% to regular users' },
    { segment: 'Mobile-First Users', action: 'Optimize mobile experience and push notifications', expectedImpact: 'Improve mobile satisfaction by 30%' }
  ];

  return {
    segments: segmentAnalysis,
    recommendedActions
  };
}

// Analyze temporal patterns
function analyzeTemporalPatterns(userData: any[]): UserPatternAnalysis['temporalPatterns'] {
  const hourlyDistribution: Record<string, number> = {};
  const dailyDistribution: Record<string, number> = {};
  
  // Initialize with zeros
  for (let i = 0; i < 24; i++) {
    hourlyDistribution[String(i).padStart(2, '0')] = 0;
  }
  
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  days.forEach(day => dailyDistribution[day.toLowerCase()] = 0);
  
  userData.forEach(record => {
    const date = new Date(record.timestamp);
    const hour = String(date.getHours()).padStart(2, '0');
    const dayName = days[date.getDay()].toLowerCase();
    
    hourlyDistribution[hour]++;
    dailyDistribution[dayName]++;
  });
  
  // Find peak and low usage hours
  const sortedHours = Object.entries(hourlyDistribution).sort(([,a], [,b]) => b - a);
  const peakUsageHours = sortedHours.slice(0, 3).map(([hour]) => `${hour}:00`);
  const lowUsageHours = sortedHours.slice(-3).map(([hour]) => `${hour}:00`);
  
  return {
    hourlyDistribution,
    dailyDistribution,
    peakUsageHours,
    lowUsageHours,
    seasonalTrends: {
      detected: true,
      pattern: 'Business hours peak with weekend dips',
      confidence: 0.85
    }
  };
}

// Generate comprehensive recommendations
function generateRecommendations(
  segmentation: UserPatternAnalysis['userSegmentation'],
  temporal: UserPatternAnalysis['temporalPatterns'],
  apiUsage: any
): UserPatternAnalysis['recommendations'] {
  const recommendations: UserPatternAnalysis['recommendations'] = [];
  
  // User experience recommendations
  recommendations.push({
    category: 'user_experience',
    priority: 'high',
    title: 'Implement Personalized Content Timing',
    description: `Send notifications during peak usage hours (${temporal.peakUsageHours.join(', ')}) to maximize engagement`,
    expectedImpact: {
      userSatisfaction: '+20%',
      performance: '+10%',
      engagement: '+35%'
    },
    implementation: {
      effort: 'medium',
      timeline: '2-3 weeks',
      resources: ['Backend team', 'Data team']
    }
  });

  // Performance recommendations based on segments
  const powerUsers = segmentation.segments.find(s => s.name === 'Power Users');
  if (powerUsers && powerUsers.userCount > 0) {
    recommendations.push({
      category: 'performance',
      priority: 'high',
      title: 'Optimize for Power Users',
      description: 'Implement dedicated caching and response optimization for high-frequency users',
      targetSegment: 'Power Users',
      expectedImpact: {
        userSatisfaction: '+30%',
        performance: '+40%',
        engagement: '+15%'
      },
      implementation: {
        effort: 'high',
        timeline: '4-6 weeks',
        resources: ['Performance team', 'Infrastructure team']
      }
    });
  }

  // Engagement recommendations
  const casualUsers = segmentation.segments.find(s => s.name === 'Casual Users');
  if (casualUsers && casualUsers.percentage > 40) {
    recommendations.push({
      category: 'engagement',
      priority: 'medium',
      title: 'Re-engagement Campaign for Casual Users',
      description: 'Implement targeted content and feature recommendations to convert casual users to regular users',
      targetSegment: 'Casual Users',
      expectedImpact: {
        userSatisfaction: '+25%',
        performance: '+5%',
        engagement: '+50%'
      },
      implementation: {
        effort: 'medium',
        timeline: '3-4 weeks',
        resources: ['Product team', 'Marketing team']
      }
    });
  }

  // Infrastructure recommendations
  recommendations.push({
    category: 'infrastructure',
    priority: 'medium',
    title: 'Regional Performance Optimization',
    description: 'Deploy additional edge locations in high-usage regions with suboptimal performance',
    expectedImpact: {
      userSatisfaction: '+15%',
      performance: '+25%',
      engagement: '+10%'
    },
    implementation: {
      effort: 'high',
      timeline: '6-8 weeks',
      resources: ['Infrastructure team', 'DevOps team']
    }
  });

  return recommendations;
}

// Main handler
const userPatternsHandler = async (req: NextRequest): Promise<NextResponse> => {
  const startTime = Date.now();
  
  // Validate request method
  validateMethod(req, ['GET']);

  // Apply rate limiting (15 requests per minute for user pattern analysis)
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(clientId, 15, 60000);
  
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
  const targetUserId = searchParams.get('userId');
  const groupBy = searchParams.get('groupBy') || 'user';
  const detailed = searchParams.get('detailed') === 'true';

  // Validate time range
  if (!['1h', '24h', '7d', '30d'].includes(timeRange)) {
    throw new Error('Invalid timeRange parameter. Must be: 1h, 24h, 7d, or 30d');
  }

  // Generate mock user data (in production, fetch from analytics logs)
  const userData = generateMockUserData(timeRange);
  
  // Filter for specific user if requested
  const filteredData = targetUserId ? userData.filter(d => d.user_id === targetUserId) : userData;
  
  // Analyze patterns
  const userSegmentation = analyzeUserSegmentation(filteredData);
  const temporalPatterns = analyzeTemporalPatterns(filteredData);
  
  // Mock additional analyses
  const geographicDistribution = {
    byRegion: {
      'Asia-Pacific': { userCount: 450, requestCount: 2100, avgResponseTime: 245 },
      'North America': { userCount: 320, requestCount: 1580, avgResponseTime: 189 },
      'Europe': { userCount: 230, requestCount: 890, avgResponseTime: 267 }
    },
    performanceByRegion: {
      'icn1': { avgResponseTime: 245, cacheHitRate: 78, errorRate: 1.2 },
      'nrt1': { avgResponseTime: 267, cacheHitRate: 74, errorRate: 0.8 },
      'sfo1': { avgResponseTime: 189, cacheHitRate: 81, errorRate: 0.5 }
    }
  };

  const apiUsagePatterns = {
    endpointPopularity: {
      '/api/news/personalized': { requestCount: 2847, uniqueUsers: 789, avgResponseTime: 267, errorRate: 1.1 },
      '/api/push/trigger': { requestCount: 456, uniqueUsers: 234, avgResponseTime: 156, errorRate: 0.3 }
    },
    requestSequences: [
      { sequence: ['/api/news/personalized', '/api/news/personalized'], frequency: 67, avgTimeBetween: 45000 },
      { sequence: ['/api/news/personalized', '/api/push/trigger'], frequency: 23, avgTimeBetween: 120000 }
    ],
    parameterUsage: {
      sortModeDistribution: { 'relevance': 73, 'latest': 27 },
      limitDistribution: { '20': 45, '50': 35, '100': 20 },
      filterUsage: { 'minSentiment': 12, 'maxAge': 34, 'includeBookmarks': 8 }
    }
  };

  const recommendations = generateRecommendations(userSegmentation, temporalPatterns, apiUsagePatterns);

  const processingTime = Date.now() - startTime;

  // Build comprehensive response
  const response: UserPatternAnalysis = {
    generatedAt: new Date().toISOString(),
    timeRange,
    totalUsers: new Set(filteredData.map(d => d.user_id)).size,
    totalRequests: filteredData.length,
    analysisScope: targetUserId ? 'individual' : 'aggregate',
    
    userSegmentation,
    temporalPatterns,
    geographicDistribution,
    
    deviceAndPlatform: {
      deviceTypes: {
        mobile: { userCount: 345, requestCount: 1634, avgSessionLength: 8.5, bounceRate: 12.3 },
        desktop: { userCount: 278, requestCount: 1456, avgSessionLength: 15.2, bounceRate: 8.7 },
        tablet: { userCount: 89, requestCount: 234, avgSessionLength: 12.1, bounceRate: 15.6 }
      },
      browserDistribution: { 'Chrome': 58, 'Safari': 23, 'Firefox': 12, 'Edge': 7 },
      mobileVsDesktop: {
        mobile: { users: 345, requests: 1634, avgResponseTime: 278 },
        desktop: { users: 278, requests: 1456, avgResponseTime: 234 }
      }
    },
    
    apiUsagePatterns,
    
    userJourneyAnalysis: {
      commonPaths: [
        { path: ['login', 'personalized-news', 'bookmark'], userCount: 234, avgCompletionTime: 180, dropoffPoints: ['personalized-news'] }
      ],
      sessionAnalytics: {
        avgSessionDuration: 12.3,
        avgRequestsPerSession: 4.2,
        sessionsByDuration: { '<1min': 23, '1-5min': 45, '5-15min': 78, '>15min': 34 }
      },
      retentionMetrics: {
        dailyActiveUsers: 456,
        weeklyActiveUsers: 1234,
        monthlyActiveUsers: 3456,
        retentionRate: { day1: 78, day7: 45, day30: 23 }
      }
    },
    
    personalizationInsights: {
      algorithmPreferences: { sortByRelevance: 73, sortByLatest: 27, customFilters: 15 },
      contentPreferences: {
        avgArticlesPerRequest: 24,
        categoryPreferences: { 'technology': 34, 'finance': 28, 'business': 23, 'politics': 15 },
        sentimentPreferences: { 'positive': 45, 'neutral': 38, 'negative': 17 },
        sourcePreferences: { 'reuters': 23, 'bloomberg': 19, 'techcrunch': 15, 'other': 43 }
      },
      cacheEffectiveness: {
        personalizedCacheHitRate: 73,
        timeToPersonalization: 267,
        relevanceScoreDistribution: { 'excellent': 23, 'good': 45, 'fair': 23, 'poor': 9 }
      }
    },
    
    anomalyDetection: {
      detectedAnomalies: [
        {
          type: 'usage_spike',
          severity: 'medium',
          description: 'Unusual 300% increase in requests during 14:00-15:00',
          affectedUsers: 45,
          timeframe: '2024-01-20 14:00-15:00',
          possibleCauses: ['Market news event', 'Social media viral content'],
          recommendedActions: ['Monitor server capacity', 'Check news sources']
        }
      ],
      suspiciousActivity: []
    },
    
    predictiveInsights: {
      usageForecasting: {
        nextHour: { expectedRequests: 234, confidence: 0.87 },
        nextDay: { expectedRequests: 2890, confidence: 0.73 },
        nextWeek: { expectedRequests: 18567, confidence: 0.65 }
      },
      userBehaviorPredictions: [
        { userId: 'user_123', predictedNextAction: 'request_personalized_news', confidence: 0.78, timeframe: 'next_2_hours' }
      ],
      resourcePlanning: {
        predictedPeakLoad: 450,
        recommendedScaling: 'Increase Edge function memory to 1024MB during peak hours',
        costOptimizationOpportunities: ['Implement request batching', 'Optimize cold start times']
      }
    },
    
    recommendations
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Processing-Time': `${processingTime}ms`,
      'X-Total-Users': response.totalUsers.toString(),
      'X-Total-Requests': response.totalRequests.toString(),
      'X-Analysis-Scope': response.analysisScope,
      
      // Rate Limiting Headers
      'X-RateLimit-Limit': '15',
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
      
      // Cache Control
      'Cache-Control': 'private, max-age=600', // 10 minutes cache for user patterns
      
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
export default withErrorHandling(userPatternsHandler);