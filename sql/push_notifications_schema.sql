-- Push Notifications Database Schema for Supabase
-- Tables required for FCM push notification system with n8n integration

-- User devices table for FCM token management
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL, -- Unique device identifier from app
    device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('android', 'ios', 'web')),
    fcm_token TEXT NOT NULL, -- Firebase Cloud Messaging token
    is_active BOOLEAN DEFAULT true,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_agent TEXT, -- Browser/app user agent string
    app_version VARCHAR(50), -- Application version
    os_version VARCHAR(50), -- Operating system version
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, device_id),
    UNIQUE(fcm_token) -- Each FCM token should be unique
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_active ON user_devices(is_active, last_seen);
CREATE INDEX IF NOT EXISTS idx_user_devices_fcm_token ON user_devices(fcm_token);

-- Notification logs table for delivery tracking and analytics
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('news_alert', 'portfolio_update', 'market_alert', 'general')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    delivered_successfully BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT, -- FCM error message if delivery failed
    fcm_message_id VARCHAR(255), -- FCM message ID for successful deliveries
    retry_count INTEGER DEFAULT 0,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE, -- When successfully delivered
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Optional payload data
    notification_data JSONB, -- Custom notification data
    image_url TEXT, -- Notification image URL
    action_url TEXT, -- Deep link action URL
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('high', 'normal')),
    
    -- n8n integration fields
    n8n_workflow_id VARCHAR(255), -- n8n workflow that triggered this notification
    n8n_execution_id VARCHAR(255), -- n8n execution ID
    source VARCHAR(50) DEFAULT 'api' CHECK (source IN ('api', 'n8n', 'scheduled', 'manual'))
);

-- Indexes for notification logs
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_device_id ON notification_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_delivered ON notification_logs(delivered_successfully);
CREATE INDEX IF NOT EXISTS idx_notification_logs_attempted_at ON notification_logs(attempted_at);
CREATE INDEX IF NOT EXISTS idx_notification_logs_n8n_workflow ON notification_logs(n8n_workflow_id);

-- Notification templates table for reusable notification content
CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL UNIQUE,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('news_alert', 'portfolio_update', 'market_alert', 'general')),
    title_template TEXT NOT NULL, -- Can include variables like {{user_name}}, {{symbol}}
    body_template TEXT NOT NULL,
    default_priority VARCHAR(10) DEFAULT 'normal' CHECK (default_priority IN ('high', 'normal')),
    default_image_url TEXT,
    action_url_template TEXT, -- Can include variables
    variables JSONB, -- Array of available template variables
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for templates
CREATE INDEX IF NOT EXISTS idx_notification_templates_type ON notification_templates(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_templates_active ON notification_templates(is_active);

-- User notification preferences table
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('news_alert', 'portfolio_update', 'market_alert', 'general')),
    enabled BOOLEAN DEFAULT true,
    preferred_time_start TIME DEFAULT '09:00:00', -- User's preferred notification time window
    preferred_time_end TIME DEFAULT '21:00:00',
    timezone VARCHAR(50) DEFAULT 'UTC',
    frequency VARCHAR(20) DEFAULT 'immediate' CHECK (frequency IN ('immediate', 'hourly', 'daily', 'weekly')),
    max_per_day INTEGER DEFAULT 10, -- Maximum notifications per day for this type
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, notification_type)
);

-- Indexes for preferences
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_user_id ON user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_preferences_enabled ON user_notification_preferences(enabled);

-- Scheduled notifications table for future delivery
CREATE TABLE IF NOT EXISTS scheduled_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('news_alert', 'portfolio_update', 'market_alert', 'general')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    
    -- Notification content
    notification_data JSONB,
    image_url TEXT,
    action_url TEXT,
    priority VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('high', 'normal')),
    
    -- Target devices
    target_device_type VARCHAR(20) CHECK (target_device_type IN ('all', 'android', 'ios', 'web')),
    target_device_ids JSONB, -- Array of specific device IDs
    
    -- n8n integration
    n8n_workflow_id VARCHAR(255),
    n8n_execution_id VARCHAR(255),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for scheduled notifications
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_user_id ON scheduled_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_scheduled_for ON scheduled_notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_status ON scheduled_notifications(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_pending ON scheduled_notifications(status, scheduled_for) WHERE status = 'pending';

-- Row Level Security (RLS) policies

-- Enable RLS on all tables
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;

-- User devices policies
CREATE POLICY "Users can view their own devices" ON user_devices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own devices" ON user_devices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices" ON user_devices
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices" ON user_devices
    FOR DELETE USING (auth.uid() = user_id);

-- Service role can access all user devices (for n8n integration)
CREATE POLICY "Service role can access all user devices" ON user_devices
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Notification logs policies
CREATE POLICY "Users can view their own notification logs" ON notification_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can access all notification logs
CREATE POLICY "Service role can access all notification logs" ON notification_logs
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Notification templates policies (read-only for users)
CREATE POLICY "Users can view active templates" ON notification_templates
    FOR SELECT USING (is_active = true);

-- Service role can manage templates
CREATE POLICY "Service role can manage templates" ON notification_templates
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- User preferences policies
CREATE POLICY "Users can manage their own preferences" ON user_notification_preferences
    FOR ALL USING (auth.uid() = user_id);

-- Service role can access all preferences
CREATE POLICY "Service role can access all preferences" ON user_notification_preferences
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Scheduled notifications policies
CREATE POLICY "Users can view their own scheduled notifications" ON scheduled_notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all scheduled notifications
CREATE POLICY "Service role can manage all scheduled notifications" ON scheduled_notifications
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Functions and triggers for maintenance

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_user_devices_updated_at BEFORE UPDATE ON user_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_templates_updated_at BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_notification_preferences_updated_at BEFORE UPDATE ON user_notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_notifications_updated_at BEFORE UPDATE ON scheduled_notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old inactive devices (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_inactive_devices()
RETURNS void AS $$
BEGIN
    DELETE FROM user_devices
    WHERE is_active = false
    AND last_seen < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old notification logs (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_notification_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM notification_logs
    WHERE attempted_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Views for analytics

-- Notification delivery statistics view
CREATE OR REPLACE VIEW notification_delivery_stats AS
SELECT
    notification_type,
    DATE_TRUNC('day', attempted_at) as date,
    COUNT(*) as total_sent,
    COUNT(*) FILTER (WHERE delivered_successfully = true) as successful,
    COUNT(*) FILTER (WHERE delivered_successfully = false) as failed,
    ROUND(
        (COUNT(*) FILTER (WHERE delivered_successfully = true)::DECIMAL / COUNT(*)) * 100,
        2
    ) as success_rate,
    AVG(EXTRACT(EPOCH FROM (delivered_at - attempted_at))) as avg_delivery_time_seconds
FROM notification_logs
WHERE attempted_at >= NOW() - INTERVAL '30 days'
GROUP BY notification_type, DATE_TRUNC('day', attempted_at)
ORDER BY date DESC, notification_type;

-- User device statistics view
CREATE OR REPLACE VIEW user_device_stats AS
SELECT
    device_type,
    COUNT(*) as total_devices,
    COUNT(*) FILTER (WHERE is_active = true) as active_devices,
    COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '7 days') as recently_active,
    COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '1 day') as daily_active
FROM user_devices
GROUP BY device_type
ORDER BY total_devices DESC;