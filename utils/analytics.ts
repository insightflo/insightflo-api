// Analytics utilities

export interface PerformanceMetrics {
  endpoint: string;
  method: string;
  statusCode: number;
  processingTime: number;
  cacheStatus: 'HIT' | 'MISS';
  userAgent?: string;
  region?: string;
  articlesCount: number;
  userId: string;
  sortMode: string;
  timestamp: number;
}

export function trackPerformanceMetrics(metrics: PerformanceMetrics): void {
  // Vercel Analytics disabled - using console logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('Performance metrics:', metrics);
  }
}

export function checkPerformanceAlerts(metrics: PerformanceMetrics) {
  return {
    alerts: [],
    severity: 'info' as 'info' | 'warning' | 'error'
  };
}

export function createPerformanceHeaders(metrics: PerformanceMetrics): Record<string, string> {
  return {
    'X-Processing-Time': `${metrics.processingTime}ms`
  };
}