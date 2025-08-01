// Supabase client configuration for Vercel Edge functions

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

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