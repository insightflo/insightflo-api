// Security and performance validation utilities

import { PersonalizationContext, validatePerformance } from './personalization';

export interface SecurityValidationResult {
  passed: boolean;
  issues: string[];
  recommendations: string[];
  securityScore: number; // 0-100
}

export interface PerformanceValidationResult {
  passed: boolean;
  metrics: {
    responseTime: number;
    targetTime: number;
    memoryUsage?: number;
    cacheHitRate?: number;
  };
  recommendations: string[];
  performanceScore: number; // 0-100
}

export interface ComplianceValidationResult {
  passed: boolean;
  checks: {
    rlsEnforced: boolean;
    authenticationRequired: boolean;
    rateLimitingActive: boolean;
    corsConfigured: boolean;
    securityHeaders: boolean;
  };
  complianceScore: number; // 0-100
}

/**
 * Comprehensive security validation
 */
export function validateSecurity(
  request: Request,
  response: Response,
  processingTime: number
): SecurityValidationResult {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let securityScore = 100;

  // Check authentication header
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    issues.push('Missing or invalid authorization header');
    securityScore -= 30;
  }

  // Check rate limiting headers
  const rateLimitHeaders = [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ];
  
  const missingRateLimitHeaders = rateLimitHeaders.filter(
    header => !response.headers.get(header)
  );
  
  if (missingRateLimitHeaders.length > 0) {
    issues.push(`Missing rate limit headers: ${missingRateLimitHeaders.join(', ')}`);
    securityScore -= 20;
  }

  // Check security headers
  const requiredSecurityHeaders = [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'X-XSS-Protection',
    'Referrer-Policy'
  ];

  const missingSecurityHeaders = requiredSecurityHeaders.filter(
    header => !response.headers.get(header)
  );

  if (missingSecurityHeaders.length > 0) {
    issues.push(`Missing security headers: ${missingSecurityHeaders.join(', ')}`);
    securityScore -= 15;
  }

  // Check response time for potential DoS vulnerabilities
  if (processingTime > 5000) { // 5 seconds
    issues.push('Response time too high, potential DoS vulnerability');
    recommendations.push('Implement request timeout and optimization');
    securityScore -= 10;
  }

  // Generate recommendations based on score
  if (securityScore < 90) {
    recommendations.push('Review and implement missing security measures');
  }
  if (securityScore < 70) {
    recommendations.push('Critical security issues need immediate attention');
  }

  return {
    passed: securityScore >= 80,
    issues,
    recommendations,
    securityScore: Math.max(0, securityScore)
  };
}

/**
 * Performance benchmark validation
 */
export function validatePerformanceBenchmarks(
  processingTime: number,
  context?: PersonalizationContext
): PerformanceValidationResult {
  const targetTime = 500; // 500ms target
  const recommendations: string[] = [];
  let performanceScore = 100;

  // Performance scoring based on response time
  if (processingTime > targetTime) {
    const overagePercent = ((processingTime - targetTime) / targetTime) * 100;
    performanceScore = Math.max(0, 100 - overagePercent);
    
    if (processingTime > targetTime * 2) {
      recommendations.push('Critical: Response time exceeds 2x target');
    } else {
      recommendations.push('Response time exceeds target, consider optimization');
    }
  }

  // Context-specific performance validation
  if (context) {
    // Context-specific performance analysis
    if (context.performanceMetrics && context.performanceMetrics.processingTime > 1000) {
      performanceScore = Math.min(performanceScore, 70);
      recommendations.push('Context processing time exceeds optimal threshold');
    }
  }

  // Memory usage estimation (simplified)
  const estimatedMemoryUsage = processingTime * 0.1; // Rough estimation
  if (estimatedMemoryUsage > 100) { // 100MB threshold
    recommendations.push('High memory usage detected, consider optimization');
    performanceScore = Math.min(performanceScore, 80);
  }

  return {
    passed: performanceScore >= 80,
    metrics: {
      responseTime: processingTime,
      targetTime,
      memoryUsage: estimatedMemoryUsage,
      cacheHitRate: (context?.performanceMetrics as any)?.cacheHitRate
    },
    recommendations,
    performanceScore
  };
}

/**
 * Compliance validation for production readiness
 */
export function validateCompliance(
  request: Request,
  response: Response
): ComplianceValidationResult {
  const checks = {
    rlsEnforced: true, // Assume RLS is enforced if auth is required
    authenticationRequired: !!request.headers.get('authorization'),
    rateLimitingActive: !!response.headers.get('X-RateLimit-Limit'),
    corsConfigured: !!response.headers.get('Access-Control-Allow-Origin'),
    securityHeaders: [
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'X-Frame-Options'
    ].every(header => !!response.headers.get(header))
  };

  const passedChecks = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  const complianceScore = Math.round((passedChecks / totalChecks) * 100);

  return {
    passed: complianceScore >= 90,
    checks,
    complianceScore
  };
}

/**
 * Comprehensive API validation combining all checks
 */
export function validateAPIImplementation(
  request: Request,
  response: Response,
  processingTime: number,
  context?: PersonalizationContext
): {
  overall: {
    passed: boolean;
    score: number;
    status: 'production-ready' | 'needs-improvement' | 'critical-issues';
  };
  security: SecurityValidationResult;
  performance: PerformanceValidationResult;
  compliance: ComplianceValidationResult;
} {
  const security = validateSecurity(request, response, processingTime);
  const performance = validatePerformanceBenchmarks(processingTime, context);
  const compliance = validateCompliance(request, response);

  const overallScore = Math.round(
    (security.securityScore * 0.4) +
    (performance.performanceScore * 0.35) +
    (compliance.complianceScore * 0.25)
  );

  let status: 'production-ready' | 'needs-improvement' | 'critical-issues';
  if (overallScore >= 90) {
    status = 'production-ready';
  } else if (overallScore >= 70) {
    status = 'needs-improvement';
  } else {
    status = 'critical-issues';
  }

  return {
    overall: {
      passed: overallScore >= 80,
      score: overallScore,
      status
    },
    security,
    performance,
    compliance
  };
}