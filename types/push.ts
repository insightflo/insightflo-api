// TypeScript types for push notification system

/**
 * Push notification request payload
 */
export interface PushNotificationRequest {
  user_id: string;
  notification: {
    title: string;
    body: string;
    type: 'news_alert' | 'portfolio_update' | 'market_alert' | 'general';
    data?: Record<string, any>; // Custom payload data
    image_url?: string;
    action_url?: string; // Deep link URL
    priority?: 'high' | 'normal';
  };
  target?: {
    device_type?: 'all' | 'android' | 'ios' | 'web';
    device_ids?: string[]; // Specific device targeting
  };
  scheduling?: {
    send_immediately?: boolean;
    scheduled_time?: string; // ISO8601 timestamp
    timezone?: string; // User timezone
  };
}

/**
 * Push notification response
 */
export interface PushNotificationResponse {
  success: boolean;
  userId: string;
  notificationType: string;
  delivery: {
    totalDevices: number;
    successful: number;
    failed: number;
    results: NotificationDeliveryResult[];
  };
  processingTime: number;
  timestamp: string;
}

/**
 * Individual notification delivery result
 */
export interface NotificationDeliveryResult {
  deviceId: string;
  deviceType: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * User device information from database
 */
export interface UserDevice {
  id: string;
  device_id: string;
  device_type: 'android' | 'ios' | 'web';
  fcm_token: string;
  is_active: boolean;
  last_seen: string;
  user_agent?: string;
}

/**
 * Notification template for different types
 */
export interface NotificationTemplate {
  type: 'news_alert' | 'portfolio_update' | 'market_alert' | 'general';
  title_template: string;
  body_template: string;
  default_priority: 'high' | 'normal';
  default_image?: string;
  action_url_template?: string;
  variables: string[]; // Available template variables
}

/**
 * Notification log entry for tracking
 */
export interface NotificationLog {
  id?: string;
  user_id: string;
  device_id: string;
  notification_type: string;
  delivered_successfully: boolean;
  error_message?: string;
  fcm_message_id?: string;
  attempted_at: string;
  created_at?: string;
}

/**
 * FCM payload structure for different platforms
 */
export interface FCMPayload {
  to?: string;
  registration_ids?: string[];
  notification?: {
    title: string;
    body: string;
    icon?: string;
    image?: string;
    badge?: string;
    sound?: string;
    click_action?: string;
    tag?: string;
  };
  data?: Record<string, string>;
  priority?: 'high' | 'normal';
  android?: {
    priority: 'high' | 'normal';
    notification: {
      title: string;
      body: string;
      icon?: string;
      sound?: string;
      click_action?: string;
      channel_id?: string;
    };
    data?: Record<string, string>;
  };
  apns?: {
    payload: {
      aps: {
        alert: {
          title: string;
          body: string;
        };
        sound?: string;
        badge?: number;
        'content-available'?: number;
        'apns-priority'?: string;
        'apns-push-type'?: string;
      };
      [key: string]: any;
    };
  };
  webpush?: {
    notification: {
      title: string;
      body: string;
      icon?: string;
      image?: string;
      badge?: string;
      requireInteraction?: boolean;
      tag?: string;
      renotify?: boolean;
      actions?: Array<{
        action: string;
        title: string;
        icon?: string;
      }>;
      data?: Record<string, any>;
    };
  };
}

/**
 * n8n webhook payload for push notifications
 */
export interface N8NWebhookPayload {
  workflow_id: string;
  execution_id: string;
  trigger_type: 'manual' | 'webhook' | 'schedule' | 'event';
  payload: PushNotificationRequest;
  metadata?: {
    source: string;
    timestamp: string;
    retry_count?: number;
  };
}

/**
 * Firebase Admin SDK configuration
 */
export interface FirebaseConfig {
  projectId: string;
  privateKey: string;
  clientEmail: string;
  databaseURL?: string;
}

/**
 * Push notification statistics and analytics
 */
export interface NotificationStats {
  totalSent: number;
  successRate: number;
  failureRate: number;
  averageDeliveryTime: number;
  byDeviceType: Record<string, {
    sent: number;
    successful: number;
    failed: number;
  }>;
  byNotificationType: Record<string, {
    sent: number;
    successful: number;
    failed: number;
  }>;
  commonErrors: Array<{
    error: string;
    count: number;
    percentage: number;
  }>;
  timeRange: {
    start: string;
    end: string;
  };
}

/**
 * Error types specific to push notifications
 */
export class PushNotificationError extends Error {
  constructor(
    message: string,
    public code: string,
    public userId?: string,
    public deviceId?: string
  ) {
    super(message);
    this.name = 'PushNotificationError';
  }
}

export class FCMTokenError extends PushNotificationError {
  constructor(message: string, userId?: string, deviceId?: string) {
    super(message, 'FCM_TOKEN_ERROR', userId, deviceId);
    this.name = 'FCMTokenError';
  }
}

export class N8NWebhookError extends Error {
  constructor(message: string, public webhookId?: string) {
    super(message);
    this.name = 'N8NWebhookError';
  }
}