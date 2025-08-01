# Push Notifications Integration Guide

Complete integration guide for InsightFlo push notification system with n8n workflow automation and Firebase Cloud Messaging (FCM).

## Architecture Overview

```mermaid
graph TB
    A[n8n Workflow] -->|Webhook| B[Vercel API /api/push/trigger]
    B --> C[Supabase user_devices]
    B --> D[Firebase FCM]
    D --> E[Android Devices]
    D --> F[iOS Devices] 
    D --> G[Web Browsers]
    B --> H[notification_logs]
    A --> I[Analytics DB]
```

## Features

- ✅ **n8n Workflow Integration**: Webhook-based trigger system
- ✅ **Multi-Platform Support**: Android, iOS, Web push notifications
- ✅ **FCM Token Management**: Automatic device registration and cleanup
- ✅ **Notification Templates**: Reusable content templates with variables
- ✅ **Delivery Tracking**: Complete delivery status and analytics
- ✅ **Rate Limiting**: 50 requests/minute per client
- ✅ **Error Handling**: Comprehensive retry and fallback mechanisms
- ✅ **Vercel Edge Runtime**: <500ms response time with global deployment

## API Endpoint

### POST /api/push/trigger

Send push notifications to user devices via n8n webhook or direct API call.

#### Authentication

**Option 1: n8n Webhook Authentication**
```http
Authorization: Bearer <N8N_WEBHOOK_TOKEN>
X-N8N-Source: n8n
```

**Option 2: User JWT Authentication**
```http
Authorization: Bearer <jwt_token>
```

#### Request Body

```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "notification": {
    "title": "🚨 Breaking: AAPL Alert",
    "body": "Apple stock gained 5.2% in after-hours trading",
    "type": "portfolio_update",
    "data": {
      "symbol": "AAPL",
      "price_change": 5.2,
      "article_id": "123"
    },
    "image_url": "https://example.com/apple-logo.png",
    "action_url": "insightflo://portfolio/AAPL",
    "priority": "high"
  },
  "target": {
    "device_type": "all",
    "device_ids": ["device_123", "device_456"]
  },
  "scheduling": {
    "send_immediately": true,
    "scheduled_time": "2024-01-20T15:30:00Z",
    "timezone": "Asia/Seoul"
  }
}
```

#### Response

```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "notificationType": "portfolio_update",
  "delivery": {
    "totalDevices": 3,
    "successful": 2,
    "failed": 1,
    "results": [
      {
        "deviceId": "device_123",
        "deviceType": "android",
        "success": true,
        "messageId": "fcm_msg_123"
      },
      {
        "deviceId": "device_456", 
        "deviceType": "ios",
        "success": true,
        "messageId": "fcm_msg_456"
      },
      {
        "deviceId": "device_789",
        "deviceType": "web",
        "success": false,
        "error": "Invalid FCM token"
      }
    ]
  },
  "processingTime": 247,
  "timestamp": "2024-01-20T15:30:00.123Z"
}
```

## Environment Variables

Configure these environment variables in Vercel:

```bash
# Firebase Configuration
FIREBASE_PROJECT_ID=your-firebase-project
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FCM_SERVER_KEY=your-fcm-server-key

# n8n Integration
N8N_WEBHOOK_TOKEN=your-secure-webhook-token

# Supabase (existing)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Database Schema

The system requires these Supabase tables:

### user_devices

Stores FCM tokens for each user device:

```sql
CREATE TABLE user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    device_id VARCHAR(255) NOT NULL,
    device_type VARCHAR(20) CHECK (device_type IN ('android', 'ios', 'web')),
    fcm_token TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### notification_logs

Tracks all notification delivery attempts:

```sql
CREATE TABLE notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    device_id VARCHAR(255) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    delivered_successfully BOOLEAN DEFAULT false,
    error_message TEXT,
    fcm_message_id VARCHAR(255),
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    n8n_workflow_id VARCHAR(255),
    n8n_execution_id VARCHAR(255)
);
```

### notification_templates

Reusable notification templates:

```sql
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(100) UNIQUE NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    default_priority VARCHAR(10) DEFAULT 'normal',
    variables JSONB,
    is_active BOOLEAN DEFAULT true
);
```

## n8n Workflow Setup

### 1. Import Workflow

Import the workflow from `docs/n8n-workflow-example.json`:

1. Open n8n
2. Go to Workflows
3. Click "Import from File"
4. Select `n8n-workflow-example.json`

### 2. Configure Credentials

**HTTP Header Authentication:**
```
Credential Name: InsightFlo API Auth
Header Name: Authorization
Header Value: Bearer <N8N_WEBHOOK_TOKEN>
```

**Supabase Connection:**
```
Host: db.your-project.supabase.co
Database: postgres
User: postgres
Password: <supabase-db-password>
Port: 5432
SSL: true
```

### 3. Webhook URL

After activating the workflow, use this webhook URL in your systems:

```
https://your-n8n-instance.com/webhook/insightflo-push-trigger
```

### 4. Example Webhook Payloads

**Breaking News Alert:**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "breaking_news",
  "title": "Market Volatility Detected",
  "summary": "Major indices down 3% in pre-market trading",
  "image_url": "https://example.com/market-chart.png",
  "article_id": "article_123",
  "data": {
    "category": "markets",
    "urgency": "high"
  }
}
```

**Stock Price Alert:**
```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "stock_alert", 
  "symbol": "AAPL",
  "price_change": -4.2,
  "current_price": 185.50,
  "data": {
    "threshold_triggered": "5_percent_drop",
    "market_session": "after_hours"
  }
}
```

## Client Integration

### Android (Flutter)

```dart
// Register FCM token
FirebaseMessaging messaging = FirebaseMessaging.instance;
String? token = await messaging.getToken();

// Send to your API
await apiClient.registerDevice({
  'device_id': deviceId,
  'device_type': 'android',
  'fcm_token': token,
  'user_agent': userAgent,
});

// Handle notification taps
FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
  if (message.data['action_url'] != null) {
    // Navigate to deep link
    Navigator.pushNamed(context, message.data['action_url']);
  }
});
```

### iOS (Flutter)

```dart
// Request permission
NotificationSettings settings = await messaging.requestPermission(
  alert: true,
  badge: true,
  sound: true,
);

// Configure APNS
await messaging.setForegroundNotificationPresentationOptions(
  alert: true,
  badge: true,
  sound: true,
);

// Register device with FCM token
String? token = await messaging.getToken();
await apiClient.registerDevice({
  'device_id': deviceId,
  'device_type': 'ios',
  'fcm_token': token,
});
```

### Web (JavaScript)

```javascript
// Import Firebase SDK
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Request permission and get token
Notification.requestPermission().then((permission) => {
  if (permission === 'granted') {
    return getToken(messaging, { vapidKey: 'your-vapid-key' });
  }
}).then((token) => {
  // Register device
  fetch('/api/devices/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: generateDeviceId(),
      device_type: 'web',
      fcm_token: token,
      user_agent: navigator.userAgent
    })
  });
});

// Handle foreground messages
onMessage(messaging, (payload) => {
  console.log('Message received:', payload);
  
  // Show notification
  new Notification(payload.notification.title, {
    body: payload.notification.body,
    icon: payload.notification.icon,
    image: payload.notification.image,
    tag: payload.data.type,
    data: payload.data
  });
});
```

## Testing

### 1. Direct API Test

```bash
curl -X POST https://insightflo-api.vercel.app/api/push/trigger \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-id",
    "notification": {
      "title": "Test Notification",
      "body": "This is a test message",
      "type": "general",
      "priority": "normal"
    }
  }'
```

### 2. n8n Workflow Test

```bash
curl -X POST https://your-n8n-instance.com/webhook/insightflo-push-trigger \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-id",
    "event_type": "breaking_news",
    "title": "Test Breaking News",
    "summary": "This is a test breaking news alert"
  }'
```

### 3. FCM Token Validation

```bash
# Test FCM token directly
curl -X POST https://fcm.googleapis.com/fcm/send \
  -H "Authorization: key=<FCM_SERVER_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "<fcm_token>",
    "notification": {
      "title": "Direct FCM Test",
      "body": "Testing FCM connectivity"
    }
  }'
```

## Monitoring and Analytics

### Performance Metrics

- **Response Time**: Target <500ms (Edge Runtime)
- **Delivery Rate**: Target >95% successful delivery
- **Token Validity**: Monitor invalid token rates
- **Error Patterns**: Track common failure reasons

### Queries for Analytics

```sql
-- Daily delivery statistics
SELECT 
  DATE(attempted_at) as date,
  notification_type,
  COUNT(*) as total_sent,
  SUM(CASE WHEN delivered_successfully THEN 1 ELSE 0 END) as successful,
  ROUND(AVG(CASE WHEN delivered_successfully THEN 1.0 ELSE 0.0 END) * 100, 2) as success_rate
FROM notification_logs 
WHERE attempted_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(attempted_at), notification_type
ORDER BY date DESC;

-- Device type performance
SELECT 
  d.device_type,
  COUNT(*) as total_devices,
  COUNT(*) FILTER (WHERE d.is_active) as active_devices,
  COUNT(l.id) as notifications_sent,
  AVG(CASE WHEN l.delivered_successfully THEN 1.0 ELSE 0.0 END) as avg_success_rate
FROM user_devices d
LEFT JOIN notification_logs l ON d.device_id = l.device_id
WHERE d.created_at >= NOW() - INTERVAL '30 days'
GROUP BY d.device_type;

-- Common error patterns
SELECT 
  error_message,
  COUNT(*) as error_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM notification_logs 
WHERE delivered_successfully = false 
  AND attempted_at >= NOW() - INTERVAL '7 days'
GROUP BY error_message
ORDER BY error_count DESC
LIMIT 10;
```

## Security Considerations

1. **n8n Webhook Token**: Use strong, randomly generated tokens
2. **FCM Server Key**: Keep server keys secure and rotate regularly
3. **Rate Limiting**: 50 requests/minute prevents abuse
4. **Token Validation**: Validate FCM tokens before sending
5. **User Authorization**: Verify user permissions for targeted notifications
6. **Data Privacy**: Don't log sensitive notification content

## Troubleshooting

### Common Issues

**1. FCM Token Invalid**
```
Error: "Invalid FCM token"
Solution: User needs to re-register device, token may have expired
```

**2. n8n Webhook Authentication Failed**
```
Error: "Unauthorized webhook request"
Solution: Check N8N_WEBHOOK_TOKEN matches in both n8n and Vercel
```

**3. Firebase Admin SDK Initialization Failed**
```
Error: "Missing Firebase configuration"
Solution: Verify all Firebase environment variables are set correctly
```

**4. High Delivery Failure Rate**
```
Symptoms: Success rate < 90%
Investigation: Check notification_logs for error patterns
Common causes: Expired tokens, app uninstalled, network issues
```

### Debug Mode

Enable debug logging by setting:
```bash
NODE_ENV=development
```

This will log detailed information about:
- FCM token validation
- Notification payload building
- Delivery attempt details
- Error stack traces

## Performance Optimization

1. **Token Cleanup**: Regularly remove invalid FCM tokens
2. **Batch Processing**: Send to multiple devices efficiently  
3. **Caching**: Cache user device lookups for frequent users
4. **Monitoring**: Set up alerts for delivery rate drops
5. **Regional Deployment**: Use Vercel Edge regions closest to users

## Future Enhancements

- [ ] Scheduled notification delivery
- [ ] A/B testing for notification content
- [ ] Rich notification templates
- [ ] User preference management
- [ ] Advanced targeting and segmentation
- [ ] Real-time delivery status websockets