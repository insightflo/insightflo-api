// Health check endpoint for API monitoring

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const config = {
  runtime: 'edge',
};

async function handler(req: NextRequest) {
  if (req.method !== 'GET') {
    return NextResponse.json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed'
      },
      timestamp: new Date().toISOString(),
    }, { 
      status: 405,
      headers: { 'Allow': 'GET' }
    });
  }

  const startTime = Date.now();

  try {
    // Test database connection
    const { data, error } = await supabase
      .from('news_articles')
      .select('id')
      .limit(1);

    const dbHealthy = !error;
    const responseTime = Date.now() - startTime;

    const health = {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: {
          status: dbHealthy ? 'healthy' : 'unhealthy',
          responseTime: `${responseTime}ms`,
          error: error?.message || null,
        },
        api: {
          status: 'healthy',
          responseTime: `${responseTime}ms`,
        },
      },
      environment: {
        runtime: 'edge',
        timestamp: new Date().toISOString(),
      },
    };

    const overallHealthy = dbHealthy;
    const statusCode = overallHealthy ? 200 : 503;

    return NextResponse.json(health, {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      success: false,
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      responseTime: `${Date.now() - startTime}ms`,
    }, { status: 503 });
  }
}

export const GET = handler;