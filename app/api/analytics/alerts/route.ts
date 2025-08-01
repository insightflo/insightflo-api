// Vercel Edge function for real-time performance alerts
// Runtime: Edge (256MB memory, 5s max duration)

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient, verifySupabaseToken } from '../../../../lib/supabase';
import { 
  validateMethod, 
  validateAuthToken, 
  withErrorHandling,
  checkRateLimit,
  getClientId,
  RateLimitError
} from '../../../../utils/errors';
import { PerformanceMonitor, type PerformanceAlert } from '../../../../utils/analytics-enhanced';

// Edge runtime configuration
export const config = {
  runtime: 'edge',
  memory: 256,
  maxDuration: 5,
};

/**
 * Real-time Performance Alerts API Endpoint
 * GET /api/analytics/alerts - Get current alerts
 * POST /api/analytics/alerts/configure - Configure alert thresholds
 * 
 * Headers:
 * - Authorization: Bearer <jwt_token> (Required)
 * 
 * Features:
 * - Real-time performance threshold monitoring
 * - Configurable alert thresholds
 * - Alert severity classification
 * - Historical alert tracking
 * - Webhook notifications (future enhancement)
 */

interface AlertConfiguration {
  responseTimeThreshold: number; // milliseconds
  cacheHitRateThreshold: number; // percentage
  errorRateThreshold: number; // percentage
  relevanceScoreThreshold: number; // 0-1
  memoryUsageThreshold: number; // percentage
  alertCooldownPeriod: number; // seconds
  enableWebhookNotifications: boolean;
  webhookUrl?: string;
}

interface AlertsResponse {
  activeAlerts: PerformanceAlert[];
  alertHistory: PerformanceAlert[];
  configuration: AlertConfiguration;
  statistics: {
    totalAlertsToday: number;
    criticalAlertsToday: number;
    mostFrequentAlertType: string;
    averageResolutionTime: number;
  };
  systemHealth: {
    overallStatus: 'healthy' | 'warning' | 'critical';
    components: {
      api: 'healthy' | 'warning' | 'critical';
      cache: 'healthy' | 'warning' | 'critical';
      personalization: 'healthy' | 'warning' | 'critical';
      database: 'healthy' | 'warning' | 'critical';
    };
  };
}

// In-memory alert store (in production, use Redis or database)
const alertStore = new Map<string, PerformanceAlert[]>();
const alertHistory = new Map<string, PerformanceAlert[]>();

// Default alert configuration
const defaultAlertConfig: AlertConfiguration = {
  responseTimeThreshold: 2000,
  cacheHitRateThreshold: 70,
  errorRateThreshold: 5,
  relevanceScoreThreshold: 0.6,
  memoryUsageThreshold: 80,
  alertCooldownPeriod: 300, // 5 minutes
  enableWebhookNotifications: false
};

// Alert configuration store (in production, use database)
const alertConfigs = new Map<string, AlertConfiguration>();

// Get or create alert configuration for user/organization
function getAlertConfiguration(userId: string): AlertConfiguration {
  return alertConfigs.get(userId) || defaultAlertConfig;
}

// Store alert configuration
function setAlertConfiguration(userId: string, config: AlertConfiguration): void {
  alertConfigs.set(userId, config);
}

// Add alert to store with deduplication
function addAlert(userId: string, alert: PerformanceAlert): void {
  const userAlerts = alertStore.get(userId) || [];
  const existingAlert = userAlerts.find(a => 
    a.type === alert.type && 
    a.metric === alert.metric && 
    a.endpoint === alert.endpoint &&
    (alert.timestamp - a.timestamp) < 300000 // 5 minutes cooldown
  );
  
  if (!existingAlert) {
    userAlerts.push(alert);
    alertStore.set(userId, userAlerts);
    
    // Add to history
    const history = alertHistory.get(userId) || [];
    history.push(alert);
    // Keep only last 1000 alerts
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
    alertHistory.set(userId, history);
  }
}

// Get active alerts for user
function getActiveAlerts(userId: string): PerformanceAlert[] {
  const alerts = alertStore.get(userId) || [];
  const cutoffTime = Date.now() - 3600000; // 1 hour
  return alerts.filter(alert => alert.timestamp > cutoffTime);
}

// Get alert history for user
function getAlertHistory(userId: string, hours: number = 24): PerformanceAlert[] {
  const history = alertHistory.get(userId) || [];
  const cutoffTime = Date.now() - (hours * 3600000);
  return history.filter(alert => alert.timestamp > cutoffTime);
}

// Calculate alert statistics
function calculateAlertStatistics(userId: string): AlertsResponse['statistics'] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayAlerts = getAlertHistory(userId, 24).filter(alert => 
    alert.timestamp >= todayStart.getTime()
  );
  
  const criticalAlerts = todayAlerts.filter(alert => alert.severity === 'critical');
  
  // Most frequent alert type
  const alertTypeCounts = todayAlerts.reduce((counts, alert) => {
    counts[alert.type] = (counts[alert.type] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  
  const mostFrequentAlertType = Object.entries(alertTypeCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';
  
  return {
    totalAlertsToday: todayAlerts.length,
    criticalAlertsToday: criticalAlerts.length,
    mostFrequentAlertType,
    averageResolutionTime: 300 // Mock value - would calculate from resolved alerts
  };
}

// Assess system health based on recent alerts
function assessSystemHealth(alerts: PerformanceAlert[]): AlertsResponse['systemHealth'] {
  const recentAlerts = alerts.filter(alert => 
    alert.timestamp > Date.now() - 900000 // 15 minutes
  );
  
  const criticalAlerts = recentAlerts.filter(alert => alert.severity === 'critical');
  const warningAlerts = recentAlerts.filter(alert => alert.severity === 'warning');
  
  // Overall status
  let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (criticalAlerts.length > 0) {
    overallStatus = 'critical';
  } else if (warningAlerts.length > 2) {
    overallStatus = 'warning';
  }
  
  // Component health assessment
  const componentHealth = {
    api: assessComponentHealth(recentAlerts, 'performance'),
    cache: assessComponentHealth(recentAlerts, 'cache'),
    personalization: assessComponentHealth(recentAlerts, 'personalization'),
    database: 'healthy' as 'healthy' | 'warning' | 'critical' // Mock - would assess from DB metrics
  };
  
  return {
    overallStatus,
    components: componentHealth
  };
}

function assessComponentHealth(
  alerts: PerformanceAlert[], 
  component: string
): 'healthy' | 'warning' | 'critical' {
  const componentAlerts = alerts.filter(alert => alert.type === component);
  const criticalAlerts = componentAlerts.filter(alert => alert.severity === 'critical');
  
  if (criticalAlerts.length > 0) return 'critical';
  if (componentAlerts.length > 1) return 'warning';
  return 'healthy';
}

// GET handler - retrieve alerts and system status
const getAlertsHandler = async (req: NextRequest): Promise<NextResponse> => {
  // Extract and validate Authorization token
  const authHeader = req.headers.get('authorization');
  const token = validateAuthToken(authHeader);

  // Verify JWT token and get user
  const user = await verifySupabaseToken(token);
  const userId = user.user?.id;

  if (!userId) {
    throw new Error('Invalid token or user not found');
  }

  // Get query parameters
  const { searchParams } = new URL(req.url);
  const includeHistory = searchParams.get('includeHistory') === 'true';
  const historyHours = parseInt(searchParams.get('historyHours') || '24');

  // Retrieve alerts and configuration
  const activeAlerts = getActiveAlerts(userId);
  const alertHistory = includeHistory ? getAlertHistory(userId, historyHours) : [];
  const configuration = getAlertConfiguration(userId);
  const statistics = calculateAlertStatistics(userId);
  const systemHealth = assessSystemHealth(activeAlerts);

  const response: AlertsResponse = {
    activeAlerts,
    alertHistory,
    configuration,
    statistics,
    systemHealth
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Active-Alerts': activeAlerts.length.toString(),
      'X-System-Health': systemHealth.overallStatus,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    },
  });
};

// POST handler - configure alert thresholds
const configureAlertsHandler = async (req: NextRequest): Promise<NextResponse> => {
  // Extract and validate Authorization token
  const authHeader = req.headers.get('authorization');
  const token = validateAuthToken(authHeader);

  // Verify JWT token and get user
  const user = await verifySupabaseToken(token);
  const userId = user.user?.id;

  if (!userId) {
    throw new Error('Invalid token or user not found');
  }

  // Parse request body
  let newConfig: Partial<AlertConfiguration>;
  try {
    newConfig = await req.json();
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }

  // Validate configuration values
  if (newConfig.responseTimeThreshold !== undefined && 
      (newConfig.responseTimeThreshold < 100 || newConfig.responseTimeThreshold > 30000)) {
    throw new Error('Response time threshold must be between 100ms and 30000ms');
  }

  if (newConfig.cacheHitRateThreshold !== undefined && 
      (newConfig.cacheHitRateThreshold < 0 || newConfig.cacheHitRateThreshold > 100)) {
    throw new Error('Cache hit rate threshold must be between 0% and 100%');
  }

  if (newConfig.errorRateThreshold !== undefined && 
      (newConfig.errorRateThreshold < 0 || newConfig.errorRateThreshold > 100)) {
    throw new Error('Error rate threshold must be between 0% and 100%');
  }

  // Merge with existing configuration
  const currentConfig = getAlertConfiguration(userId);
  const updatedConfig: AlertConfiguration = {
    ...currentConfig,
    ...newConfig
  };

  // Store updated configuration
  setAlertConfiguration(userId, updatedConfig);

  // Update PerformanceMonitor thresholds
  const monitor = PerformanceMonitor.getInstance();
  monitor.setThreshold('responseTime', updatedConfig.responseTimeThreshold);
  monitor.setThreshold('cacheHitRate', updatedConfig.cacheHitRateThreshold);
  monitor.setThreshold('errorRate', updatedConfig.errorRateThreshold);
  monitor.setThreshold('relevanceScore', updatedConfig.relevanceScoreThreshold);

  return NextResponse.json({
    success: true,
    configuration: updatedConfig,
    message: 'Alert configuration updated successfully'
  }, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

// Main handler
const alertsHandler = async (req: NextRequest): Promise<NextResponse> => {
  const startTime = Date.now();
  
  // Validate request method
  validateMethod(req, ['GET', 'POST']);

  // Apply rate limiting (30 requests per minute for alerts)
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(clientId, 30, 60000);
  
  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetTime).toISOString();
    throw new RateLimitError(
      `Rate limit exceeded. Try again after ${resetDate}`
    );
  }

  let response: NextResponse;

  if (req.method === 'GET') {
    response = await getAlertsHandler(req);
  } else {
    response = await configureAlertsHandler(req);
  }

  const processingTime = Date.now() - startTime;

  // Add common headers
  response.headers.set('X-Processing-Time', `${processingTime}ms`);
  response.headers.set('X-RateLimit-Limit', '30');
  response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
  response.headers.set('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());

  // Security headers
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
};

// Initialize alert monitoring
const monitor = PerformanceMonitor.getInstance();
monitor.addAlertCallback((alert: PerformanceAlert) => {
  // Store alert for the user
  addAlert(alert.userId, alert);
  
  // Log critical alerts
  if (alert.severity === 'critical') {
    console.error('CRITICAL ALERT:', {
      type: alert.type,
      metric: alert.metric,
      currentValue: alert.currentValue,
      threshold: alert.threshold,
      userId: alert.userId,
      endpoint: alert.endpoint,
      message: alert.message
    });
  }
  
  // Future: Send webhook notifications, Slack alerts, etc.
});

// Export handler with error handling
export default withErrorHandling(alertsHandler);