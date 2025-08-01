// Type definitions for news API

export interface PersonalizedNewsResponse {
  articles: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  personalization: {
    userId: string;
    relevanceScores: Record<string, number>;
    appliedFilters: string[];
    processingTime: number;
  };
}

export interface PersonalizedNewsQuery {
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'latest';
  includeBookmarks?: boolean;
  minSentiment?: number;
  maxAge?: number;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
}

// Re-export from database utils
export type {
  DatabaseNewsArticle,
  UserInterest,
  UserPortfolio,
  UserNewsHistory
} from '../utils/database';