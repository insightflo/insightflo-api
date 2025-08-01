// API-First 인증: 회원가입 엔드포인트
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { withErrorHandling, createErrorResponse, validateMethod } from '@/utils/errors';
import jwt from 'jsonwebtoken';

export const config = {
  runtime: 'nodejs',
};

interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

interface RegisterResponse {
  success: true;
  user: {
    id: string;
    email: string;
  };
  token: string;
  expiresIn: number;
  message: string;
}

const registerHandler = async (req: NextRequest): Promise<NextResponse> => {
  validateMethod(req, ['POST']);

  try {
    const body: RegisterRequest = await req.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return createErrorResponse('Email and password are required', 400);
    }

    if (password.length < 6) {
      return createErrorResponse('Password must be at least 6 characters long', 400);
    }

    console.log('Registration attempt for:', email);

    // Supabase를 통해 사용자 생성
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: password.trim(),
      options: {
        data: {
          name: name || email.split('@')[0], // 이름이 없으면 이메일 앞부분 사용
        }
      }
    });

    if (error) {
      console.error('Supabase registration error:', error.message);
      
      if (error.message.includes('already registered')) {
        return createErrorResponse('User already exists with this email', 409);
      }
      
      return createErrorResponse('Registration failed: ' + error.message, 400);
    }

    if (!data.user) {
      return createErrorResponse('Registration failed: No user created', 500);
    }

    console.log('Supabase registration success for user:', data.user.id);

    // JWT 토큰 생성 (24시간 유효)
    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
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

    const response: RegisterResponse = {
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email || email,
      },
      token,
      expiresIn,
      message: data.user.email_confirmed_at 
        ? 'Registration successful' 
        : 'Registration successful. Please check your email to confirm your account.',
    };

    return NextResponse.json(response, {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Set-Cookie': `auth-token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${expiresIn}; Path=/`,
      },
    });

  } catch (error: any) {
    console.error('Registration error:', error);
    return createErrorResponse('Registration failed: ' + error.message, 500);
  }
};

export default withErrorHandling(registerHandler);