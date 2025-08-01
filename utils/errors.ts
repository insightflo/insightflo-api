// Error handling utilities

import { NextRequest, NextResponse } from 'next/server';

export function validateMethod(req: NextRequest, allowedMethods: string[]): void {
  if (!allowedMethods.includes(req.method || '')) {
    throw new Error(`Method ${req.method} not allowed`);
  }
}

export function validateAuthToken(authHeader: string | null): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header. Please provide a valid Bearer token.');
  }
  return authHeader.replace('Bearer ', '');
}

// 선택적 인증 검증 함수 (익명 접근 허용)
export function validateOptionalAuthToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null; // 익명 접근 허용
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid Authorization header format. Please provide a valid Bearer token.');
  }
  
  return authHeader.replace('Bearer ', '');
}

export function validatePagination(searchParams: URLSearchParams): { page: number; limit: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20')));
  return { page, limit };
}

export function createErrorResponse(message: string, statusCode: number = 500): NextResponse {
  return NextResponse.json({
    error: 'ApiError',
    message,
    statusCode,
    timestamp: new Date().toISOString()
  }, { status: statusCode });
}

export function withErrorHandling(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(req);
    } catch (error: any) {
      console.error('API Error:', error.message);
      
      if (error.message.includes('Authorization')) {
        return createErrorResponse(error.message, 401);
      }
      
      if (error.message.includes('Rate limit')) {
        return createErrorResponse(error.message, 429);
      }
      
      return createErrorResponse('An unexpected error occurred', 500);
    }
  };
}

export function checkRateLimit(clientId: string, limit: number, windowMs: number) {
  return {
    allowed: true,
    remaining: limit - 1,
    resetTime: Date.now() + windowMs
  };
}

export function getClientId(req: NextRequest): string {
  return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}