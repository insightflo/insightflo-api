// API-First 인증: 익명 사용자 생성 엔드포인트
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import jwt from 'jsonwebtoken';

interface AnonymousResponse {
  success: true;
  user: {
    id: string;
    isAnonymous: true;
  };
  token: string;
  expiresIn: number;
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  timestamp: string;
}

async function handler(req: NextRequest): Promise<NextResponse<AnonymousResponse | ErrorResponse>> {
  if (req.method !== 'POST') {
    return NextResponse.json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed'
      },
      timestamp: new Date().toISOString(),
    }, { 
      status: 405,
      headers: { 'Allow': 'POST' }
    });
  }

  try {
    console.log('Creating anonymous user...');

    // Supabase를 통해 익명 사용자 생성
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error || !data.user) {
      console.error('Supabase anonymous auth error:', error?.message);
      return NextResponse.json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Failed to create anonymous user: ' + (error?.message || 'Unknown error')
        },
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

    console.log('Anonymous user created:', data.user.id);

    // JWT 토큰 생성 (24시간 유효)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is not set');
      return NextResponse.json({
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Server configuration error'
        },
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }

    const expiresIn = 24 * 60 * 60; // 24 hours in seconds
    
    const token = jwt.sign(
      {
        userId: data.user.id,
        isAnonymous: true,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresIn
      },
      jwtSecret
    );

    const response: AnonymousResponse = {
      success: true,
      user: {
        id: data.user.id,
        isAnonymous: true,
      },
      token,
      expiresIn,
    };

    // 환경별 쿠키 설정
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = [
      `auth-token=${token}`,
      'HttpOnly',
      isProduction ? 'Secure' : '', // 프로덕션에서만 Secure
      'SameSite=Strict',
      `Max-Age=${expiresIn}`,
      'Path=/'
    ].filter(Boolean).join('; ');

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Set-Cookie': cookieOptions,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': 'application/json',
      },
    });

  } catch (error: any) {
    console.error('Anonymous user creation error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create anonymous user: ' + error.message
      },
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export const POST = handler;