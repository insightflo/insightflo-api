// Simple in-memory cache utilities

const cache = new Map();

export function getCachedUserInterests(userId: string) {
  return cache.get(`interests_${userId}`);
}

export function cacheUserInterests(userId: string, data: any) {
  cache.set(`interests_${userId}`, data);
}

export function getCachedUserPortfolio(userId: string) {
  return cache.get(`portfolio_${userId}`);
}

export function cacheUserPortfolio(userId: string, data: any) {
  cache.set(`portfolio_${userId}`, data);
}

export function getCachedNewsArticles(filters: any) {
  return cache.get(`articles_${JSON.stringify(filters)}`);
}

export function cacheNewsArticles(filters: any, data: any) {
  cache.set(`articles_${JSON.stringify(filters)}`, data);
}

export function generateUserCacheKey(userId: string): string {
  return `user_${userId}`;
}

export function generateArticlesCacheKey(filters: any): string {
  return `articles_${JSON.stringify(filters)}`;
}

export function getCacheStats() {
  return {
    size: cache.size,
    maxSize: 1000
  };
}