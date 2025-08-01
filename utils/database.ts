// Database utility functions for fetching user data and news articles

import type { SupabaseClient } from '@supabase/supabase-js';

export interface UserInterest {
  id: string;
  user_id: string;
  interest_category: string;
  interest_keywords?: string[];
  priority_level?: number;
  created_at: string;
  updated_at?: string;
}

export interface UserPortfolio {
  id: string;
  user_id: string;
  stock_code: string;
  stock_name: string;
  weight?: number;
  purchase_price?: number;
  quantity?: number;
  created_at: string;
  updated_at?: string;
}

export interface UserNewsHistory {
  id: string;
  user_id: string;
  news_article_id: string;
  relevance_score?: number;
  interest_match_keywords?: string[];
  is_read?: boolean;
  is_bookmarked?: boolean;
  is_liked?: boolean;
  read_at?: string;
  recommendation_reason?: string;
  interaction_metadata?: any;
  created_at: string;
  updated_at?: string;
}

// Supabase 실제 스키마에 맞춘 인터페이스
export interface SupabaseNewsArticle {
  id: string;
  title: string;
  summary: string;
  content: string;
  url: string;
  published_at: string;
  category: string;
  tags: any;
  source_domain: any;
  author: any;
  language: string;
  created_at: string;
  updated_at: string;
  summary_quality_score: number;
  is_active: boolean;
  summary_lines: any;
  sentiment: string;
  impact_level: string;
  keywords: any;
  related_stocks: any;
  related_sectors: any;
  ai_provider: string;
  processed_at: string;
}

// Flutter 앱과 호환되는 변환된 인터페이스
export interface DatabaseNewsArticle {
  id: string;
  title: string;
  summary: string;
  content: string;
  url: string;
  source: string;
  published_at: string;
  keywords: string;
  image_url?: string;
  sentiment_score: number;
  sentiment_label: string;
  relevance_score?: number;
}

// Supabase 데이터를 Flutter 호환 형식으로 변환
function transformSupabaseToFlutter(supabaseArticle: SupabaseNewsArticle): DatabaseNewsArticle {
  return {
    id: supabaseArticle.id,
    title: supabaseArticle.title,
    summary: supabaseArticle.summary,
    content: supabaseArticle.content,
    url: supabaseArticle.url,
    source: supabaseArticle.source_domain || supabaseArticle.category || 'Unknown', // source_domain을 source로 매핑
    published_at: supabaseArticle.published_at,
    keywords: Array.isArray(supabaseArticle.keywords) 
      ? supabaseArticle.keywords.join(',') 
      : typeof supabaseArticle.keywords === 'string' 
        ? supabaseArticle.keywords 
        : '', // keywords를 문자열로 변환
    image_url: undefined, // Supabase에 없는 필드
    sentiment_score: mapSentimentToScore(supabaseArticle.sentiment), // sentiment를 점수로 변환
    sentiment_label: supabaseArticle.sentiment || 'neutral',
    relevance_score: undefined
  };
}

// sentiment 문자열을 점수로 변환하는 헬퍼 함수
function mapSentimentToScore(sentiment: string): number {
  switch (sentiment?.toLowerCase()) {
    case 'positive': return 0.7;
    case 'negative': return -0.3;
    case 'neutral': 
    default: return 0.0;
  }
}

export async function fetchUserInterests(
  supabase: SupabaseClient,
  userId: string
): Promise<UserInterest[]> {
  const { data, error } = await supabase
    .from('user_interests')
    .select('*')
    .eq('user_id', userId)
    .order('priority_level', { ascending: false });

  if (error) {
    console.warn('Failed to fetch user interests:', error.message);
    return [];
  }

  return data || [];
}

export async function fetchUserPortfolio(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPortfolio[]> {
  const { data, error } = await supabase
    .from('user_portfolio')
    .select('*')
    .eq('user_id', userId)
    .order('weight', { ascending: false });

  if (error) {
    console.warn('Failed to fetch user portfolio:', error.message);
    return [];
  }

  return data || [];
}

export async function fetchUserNewsHistory(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 1000
): Promise<UserNewsHistory[]> {
  const { data, error } = await supabase
    .from('user_news_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('Failed to fetch user news history:', error.message);
    return [];
  }

  return data || [];
}

export async function fetchNewsArticles(
  supabase: SupabaseClient,
  filters: {
    limit?: number;
    maxAge?: number;
    page?: number;
    minSentiment?: number;
  }
): Promise<DatabaseNewsArticle[]> {
  const limit = filters.limit ?? 20;
  const page = filters.page ?? 1;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('news_articles')
    .select('*')
    .eq('is_active', true) // 활성화된 기사만 조회
    .order('published_at', { ascending: false })
    .range(from, to); // 페이지네이션 적용

  if (filters.maxAge) {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - filters.maxAge);
    query = query.gte('published_at', cutoffDate.toISOString());
  }

  // minSentiment 필터는 변환된 후에 적용해야 하므로 여기서는 제외

  const { data, error } = await query;

  if (error) {
    console.warn('Failed to fetch news articles:', error.message);
    return [];
  }

  // Supabase 데이터를 Flutter 호환 형식으로 변환
  let transformedArticles = (data as SupabaseNewsArticle[] || []).map(transformSupabaseToFlutter);

  // minSentiment 필터를 변환된 데이터에 적용
  if (filters.minSentiment !== undefined) {
    transformedArticles = transformedArticles.filter(
      article => article.sentiment_score >= filters.minSentiment!
    );
  }

  return transformedArticles;
}

export async function fetchUserBookmarks(
  supabase: SupabaseClient,
  userId: string,
  articleIds: string[]
): Promise<Set<string>> {
  if (articleIds.length === 0) {
    return new Set();
  }

  const { data, error } = await supabase
    .from('user_bookmarks')
    .select('article_id')
    .eq('user_id', userId)
    .in('article_id', articleIds);

  if (error) {
    console.warn('Failed to fetch user bookmarks:', error.message);
    return new Set();
  }

  return new Set((data || []).map(bookmark => bookmark.article_id));
}