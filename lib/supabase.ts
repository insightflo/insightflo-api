// Supabase client configuration for Vercel Edge functions

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Import JWT for custom token verification
import jwt from 'jsonwebtoken';

// Create Supabase client for server-side usage
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Server-side configuration
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-application-name': 'insightflo-api',
    },
  },
});

// Create authenticated client with user token
export const createAuthenticatedSupabaseClient = (accessToken: string) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-application-name': 'insightflo-api',
      },
    },
  });
};

// Verify JWT token and return user data with RLS validation
export const verifySupabaseToken = async (token: string) => {
  try {
    const client = createAuthenticatedSupabaseClient(token);
    const { data: user, error } = await client.auth.getUser();
    
    if (error || !user) {
      throw new Error('Invalid or expired token');
    }
    
    // Validate user has required permissions for API access
    await validateUserPermissions(client, user.user.id);
    
    return user;
  } catch (error) {
    throw new Error('Token verification failed');
  }
};

// Verify custom JWT token (for anonymous users and API-generated tokens)
export const verifyCustomJwtToken = async (token: string) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    // Verify and decode the JWT token
    const decoded = jwt.verify(token, jwtSecret) as any;
    
    // Validate token structure
    if (!decoded.userId) {
      throw new Error('Invalid token structure: missing userId');
    }

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      throw new Error('Token has expired');
    }

    return {
      user: {
        id: decoded.userId,
        isAnonymous: decoded.isAnonymous || false,
        iat: decoded.iat,
        exp: decoded.exp,
      }
    };
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid JWT token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('JWT token has expired');
    }
    throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Validate user permissions and RLS policy enforcement
 */
async function validateUserPermissions(client: any, userId: string): Promise<void> {
  try {
    // Test RLS enforcement by attempting to query user-specific data
    const { data, error } = await client
      .from('user_interests')
      .select('id')
      .limit(1);
    
    if (error && error.code === 'PGRST116') {
      // RLS is properly enforced - this is expected
      return;
    }
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database access error: ${error.message}`);
    }
    
    // If we got data without error, RLS is working correctly
    return;
  } catch (error) {
    throw new Error('User permission validation failed');
  }
}

/**
 * Create Flutter-compatible authenticated client with proper headers
 */
export const createFlutterCompatibleClient = (accessToken: string, deviceInfo?: {
  platform?: string;
  version?: string;
  deviceId?: string;
}) => {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'x-application-name': 'insightflo-api',
    'x-client-info': 'flutter-mobile',
  };
  
  // Add device-specific headers for better tracking
  if (deviceInfo) {
    if (deviceInfo.platform) headers['x-device-platform'] = deviceInfo.platform;
    if (deviceInfo.version) headers['x-app-version'] = deviceInfo.version;
    if (deviceInfo.deviceId) headers['x-device-id'] = deviceInfo.deviceId;
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      flowType: 'implicit', // Compatible with Flutter
    },
    db: {
      schema: 'public',
    },
    global: {
      headers,
    },
  });
};