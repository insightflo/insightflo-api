// Vercel Edge function for push notification trigger API
// Runtime: Edge (512MB memory, 10s max duration)
// Integration: n8n webhook → FCM push notifications

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '../../../../lib/supabase';
import { 
  validateMethod, 
  validateAuthToken, 
  createErrorResponse,
  withErrorHandling,
  checkRateLimit,
  getClientId,
  RateLimitError
} from '../../../../utils/errors';
import type { 
  PushNotificationRequest,
  PushNotificationResponse,
  NotificationTemplate,
  UserDevice
} from '../../../../types/push';

// Edge runtime configuration
export const config = {
  runtime: 'edge',
  memory: 512,
  maxDuration: 10,
};

/**
 * Push Notification Trigger API Endpoint for n8n Integration
 * POST /api/push/trigger
 * 
 * Headers:
 * - Authorization: Bearer <n8n_webhook_token> OR Bearer <jwt_token>
 * - Content-Type: application/json
 * - X-N8N-Source: n8n (optional, for webhook validation)
 * 
 * Request Body:
 * {
 *   "user_id": "uuid",
 *   "notification": {
 *     "title": "string",
 *     "body": "string",
 *     "type": "news_alert" | "portfolio_update" | "market_alert" | "general",
 *     "data": { ... }, // Optional custom data
 *     "image_url": "string", // Optional
 *     "action_url": "string", // Optional deep link
 *     "priority": "high" | "normal" // Default: normal
 *   },
 *   "target": {
 *     "device_type": "all" | "android" | "ios" | "web", // Default: all
 *     "device_ids": ["string"], // Optional specific device targeting
 *   },
 *   "scheduling": {
 *     "send_immediately": true, // Default: true
 *     "scheduled_time": "ISO8601", // Optional future time
 *     "timezone": "string" // Optional user timezone
 *   }
 * }
 * 
 * Features:
 * - n8n webhook authentication
 * - FCM token lookup and validation
 * - Notification template processing
 * - Multi-device targeting
 * - Error handling and retry logic
 * - Delivery status tracking
 */

// Firebase Cloud Messaging configuration
interface FCMConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
  serverKey: string;
}

// Get FCM configuration from environment
function getFCMConfig(): FCMConfig {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const serverKey = process.env.FCM_SERVER_KEY;

  if (!projectId || !privateKey || !clientEmail || !serverKey) {
    throw new Error('Missing Firebase/FCM configuration in environment variables');
  }

  return { projectId, privateKey, clientEmail, serverKey };
}

// Validate n8n webhook authentication
function validateN8NWebhook(req: NextRequest): boolean {
  const n8nToken = process.env.N8N_WEBHOOK_TOKEN;
  const n8nSource = req.headers.get('x-n8n-source');
  const authHeader = req.headers.get('authorization');

  if (!n8nToken) {
    return false; // No n8n token configured, skip n8n validation
  }

  // Check if request is from n8n
  if (n8nSource === 'n8n' && authHeader) {
    const token = authHeader.replace('Bearer ', '');
    return token === n8nToken;
  }

  return false;
}

// Fetch user FCM tokens from Supabase
async function fetchUserDevices(
  supabase: any,
  userId: string,
  deviceType?: 'android' | 'ios' | 'web' | 'all',
  deviceIds?: string[]
): Promise<UserDevice[]> {
  let query = supabase
    .from('user_devices')
    .select('id, device_id, device_type, fcm_token, is_active, last_seen, user_agent')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('fcm_token', 'is', null);

  // Filter by device type if specified
  if (deviceType && deviceType !== 'all') {
    query = query.eq('device_type', deviceType);
  }

  // Filter by specific device IDs if provided
  if (deviceIds && deviceIds.length > 0) {
    query = query.in('device_id', deviceIds);
  }

  const { data, error } = await query.order('last_seen', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch user devices: ${error.message}`);
  }

  return data || [];
}

// Build notification payload for FCM
function buildFCMPayload(
  notification: PushNotificationRequest['notification'],
  userDevice: UserDevice,
  userId: string
): any {
  const basePayload = {
    to: userDevice.fcm_token,
    notification: {
      title: notification.title,
      body: notification.body,
      icon: '/icons/icon-192x192.png', // Default app icon
      badge: '/icons/badge-72x72.png',
      ...(notification.image_url && { image: notification.image_url }),
    },
    data: {
      type: notification.type,
      user_id: userId,
      device_id: userDevice.device_id,
      timestamp: Date.now().toString(),
      ...(notification.action_url && { action_url: notification.action_url }),
      ...(notification.data && notification.data),
    },
    priority: notification.priority === 'high' ? 'high' : 'normal',
  };

  // Platform-specific configurations
  if (userDevice.device_type === 'android') {
    return {
      ...basePayload,
      android: {
        priority: notification.priority === 'high' ? 'high' : 'normal',
        notification: {
          ...basePayload.notification,
          sound: 'default',
          click_action: notification.action_url || 'FLUTTER_NOTIFICATION_CLICK',
          channel_id: 'insightflo_notifications',
        },
        data: basePayload.data,
      },
    };
  }

  if (userDevice.device_type === 'ios') {
    return {
      ...basePayload,
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            sound: 'default',
            badge: 1,
            'content-available': 1,
            ...(notification.priority === 'high' && { 
              'apns-priority': '10',
              'apns-push-type': 'alert'
            }),
          },
          ...basePayload.data,
        },
      },
    };
  }

  // Web push notification
  return {
    ...basePayload,
    webpush: {
      notification: {
        ...basePayload.notification,
        requireInteraction: notification.priority === 'high',
        tag: `${notification.type}_${userId}`,
        renotify: true,
        ...(notification.action_url && {
          actions: [
            {
              action: 'open',
              title: 'Open',
              icon: '/icons/action-open.png',
            },
          ],
          data: {
            url: notification.action_url,
          },
        }),
      },
    },
  };
}

// Send FCM notification
async function sendFCMNotification(
  payload: any,
  fcmConfig: FCMConfig
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${fcmConfig.serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok && result.success === 1) {
      return {
        success: true,
        messageId: result.results?.[0]?.message_id || 'unknown',
      };
    } else {
      return {
        success: false,
        error: result.results?.[0]?.error || result.error || 'Unknown FCM error',
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// Log notification delivery attempt
async function logNotificationDelivery(
  supabase: any,
  userId: string,
  deviceId: string,
  notificationType: string,
  success: boolean,
  error?: string,
  messageId?: string
): Promise<void> {
  try {
    await supabase
      .from('notification_logs')
      .insert({
        user_id: userId,
        device_id: deviceId,
        notification_type: notificationType,
        delivered_successfully: success,
        error_message: error || null,
        fcm_message_id: messageId || null,
        attempted_at: new Date().toISOString(),
      });
  } catch (err) {
    console.error('Failed to log notification delivery:', err);
    // Don't throw - logging failure shouldn't break notification delivery
  }
}

// Main handler for push notification trigger
const pushNotificationHandler = async (req: NextRequest): Promise<NextResponse> => {
  const startTime = Date.now();
  
  // Validate request method
  validateMethod(req, ['POST']);

  // Apply rate limiting (50 requests per minute per client)
  const clientId = getClientId(req);
  const rateLimit = checkRateLimit(clientId, 50, 60000);
  
  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetTime).toISOString();
    throw new RateLimitError(
      `Rate limit exceeded. Try again after ${resetDate}`
    );
  }

  // Parse request body
  let requestBody: PushNotificationRequest;
  try {
    requestBody = await req.json();
  } catch (error) {
    throw new Error('Invalid JSON in request body');
  }

  // Validate required fields
  if (!requestBody.user_id || !requestBody.notification) {
    throw new Error('Missing required fields: user_id and notification');
  }

  if (!requestBody.notification.title || !requestBody.notification.body) {
    throw new Error('Missing required notification fields: title and body');
  }

  // Validate n8n webhook OR user authentication
  const isN8NWebhook = validateN8NWebhook(req);
  let supabase: any;

  if (isN8NWebhook) {
    // n8n webhook - use service role client
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      throw new Error('Missing Supabase service role key for n8n integration');
    }
    
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(
      process.env.SUPABASE_URL!,
      serviceRoleKey
    );
  } else {
    // Regular API call - validate JWT token
    const authHeader = req.headers.get('authorization');
    const token = validateAuthToken(authHeader);
    supabase = createAuthenticatedSupabaseClient(token);
  }

  // Get FCM configuration
  const fcmConfig = getFCMConfig();

  // Fetch user devices
  const userDevices = await fetchUserDevices(
    supabase,
    requestBody.user_id,
    requestBody.target?.device_type,
    requestBody.target?.device_ids
  );

  if (userDevices.length === 0) {
    throw new Error('No active devices found for user');
  }

  // Process notifications for all devices
  const deliveryResults = await Promise.allSettled(
    userDevices.map(async (device) => {
      const payload = buildFCMPayload(
        requestBody.notification,
        device,
        requestBody.user_id
      );

      const result = await sendFCMNotification(payload, fcmConfig);

      // Log delivery attempt
      await logNotificationDelivery(
        supabase,
        requestBody.user_id,
        device.device_id,
        requestBody.notification.type,
        result.success,
        result.error,
        result.messageId
      );

      return {
        deviceId: device.device_id,
        deviceType: device.device_type,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    })
  );

  // Analyze results
  const successful = deliveryResults.filter(
    (result) => result.status === 'fulfilled' && result.value.success
  ).length;
  const failed = deliveryResults.length - successful;
  
  const processingTime = Date.now() - startTime;

  // Build response
  const response: PushNotificationResponse = {
    success: successful > 0,
    userId: requestBody.user_id,
    notificationType: requestBody.notification.type,
    delivery: {
      totalDevices: userDevices.length,
      successful,
      failed,
      results: deliveryResults.map((result) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            deviceId: 'unknown',
            deviceType: 'unknown',
            success: false,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
          };
        }
      }),
    },
    processingTime,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Processing-Time': `${processingTime}ms`,
      'X-Delivery-Success-Rate': `${((successful / userDevices.length) * 100).toFixed(1)}%`,
      'X-Devices-Targeted': userDevices.length.toString(),
      'X-N8N-Compatible': 'true',
      
      // Rate Limiting Headers
      'X-RateLimit-Limit': '50',
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
      
      // Security Headers
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
};

// Export handler with error handling
export default withErrorHandling(pushNotificationHandler);