/** @type {import('next').NextConfig} */
const nextConfig = {
  // API routes configuration
  experimental: {
    // Edge runtime is configured per API route, not globally
  },
  
  // Note: analytics and speedInsights are disabled via environment variables
  
  // Environment configuration
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  },
  
  // Enhanced security headers with environment-specific CORS
  async headers() {
    // Environment-specific CORS domains
    const allowedOrigins = process.env.NODE_ENV === 'production'
      ? [
          'https://insightflo.app',
          'https://app.insightflo.com',
          'capacitor://localhost',
          'ionic://localhost',
          'http://localhost:3000', // Flutter web development
        ]
      : [
          'http://localhost:3000',
          'http://localhost:8080',
          'http://10.0.2.2:3000', // Android emulator
          'capacitor://localhost',
          'ionic://localhost',
          '*', // Allow all in development
        ];

    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: process.env.NODE_ENV === 'production' 
              ? allowedOrigins.join(', ')
              : '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400', // 24 hours preflight cache
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;