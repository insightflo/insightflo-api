// Debug API to check Supabase table structure
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const results: any = {};
    
    // 1. Check if user_interests table exists
    try {
      const { data: interests, error: interestsError } = await supabase
        .from('user_interests')
        .select('*')
        .limit(1);
      
      results.user_interests = {
        exists: !interestsError,
        error: interestsError?.message || null,
        sampleData: interests || null,
        count: interests?.length || 0
      };
    } catch (err: any) {
      results.user_interests = {
        exists: false,
        error: err.message,
        sampleData: null,
        count: 0
      };
    }
    
    // 2. Check if user_portfolio table exists
    try {
      const { data: portfolio, error: portfolioError } = await supabase
        .from('user_portfolio')
        .select('*')
        .limit(1);
      
      results.user_portfolio = {
        exists: !portfolioError,
        error: portfolioError?.message || null,
        sampleData: portfolio || null,
        count: portfolio?.length || 0
      };
    } catch (err: any) {
      results.user_portfolio = {
        exists: false,
        error: err.message,
        sampleData: null,
        count: 0
      };
    }
    
    // 3. Check news_articles table (known to work)
    try {
      const { data: news, error: newsError } = await supabase
        .from('news_articles')
        .select('id, title')
        .limit(1);
      
      results.news_articles = {
        exists: !newsError,
        error: newsError?.message || null,
        sampleData: news || null,
        count: news?.length || 0
      };
    } catch (err: any) {
      results.news_articles = {
        exists: false,
        error: err.message,
        sampleData: null,
        count: 0
      };
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tables: results
    }, { status: 200 });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}