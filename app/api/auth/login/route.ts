// API-First 인증: 로그인 엔드포인트
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { withErrorHandling, validateMethod } from '../../../../utils/errors';
import jwt from 'jsonwebtoken';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  success: true;
  user: {
    id: string;
    email: string;
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

const loginHandler = async (req: NextRequest): Promise<NextResponse<LoginResponse | ErrorResponse>> => {
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
    const body: LoginRequest = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required'
        },
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }

    console.log('Login attempt for:', email);

    // Supabase를 통해 사용자 인증
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password.trim(),
    });

    if (error || !data.user) {
      console.error('Supabase auth error:', error?.message);
      return NextResponse.json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: 'Invalid email or password'
        },
        timestamp: new Date().toISOString(),
      }, { status: 401 });
    }

    console.log('Supabase auth success for user:', data.user.id);

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
        email: data.user.email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + expiresIn
      },
      jwtSecret
    );

    const response: LoginResponse = {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email || email,
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
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Set-Cookie': cookieOptions,
      },
    });

  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Login failed: ' + error.message
      },
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
};

export const POST = withErrorHandling(loginHandler);