// Firebase Admin SDK initialization for Vercel Edge Functions
// Optimized for Edge Runtime with minimal memory footprint

import type { FirebaseConfig } from '@/types/push';

// Firebase Admin SDK app instance (singleton)
let firebaseApp: any = null;

/**
 * Initialize Firebase Admin SDK for Edge Runtime
 * Uses environment variables for configuration
 */
export function initializeFirebaseAdmin(): any {
  // Return existing instance if already initialized
  if (firebaseApp) {
    return firebaseApp;
  }

  // Get configuration from environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    throw new Error('Missing Firebase configuration in environment variables');
  }

  try {
    // Import Firebase Admin SDK dynamically for Edge Runtime
    const admin = require('firebase-admin');

    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey,
          clientEmail,
        }),
        projectId,
      });
    } else {
      firebaseApp = admin.app(); // Use existing app
    }

    return firebaseApp;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    throw new Error('Firebase Admin SDK initialization failed');
  }
}

/**
 * Get Firebase Messaging instance
 */
export function getFirebaseMessaging(): any {
  const app = initializeFirebaseAdmin();
  const admin = require('firebase-admin');
  return admin.messaging(app);
}

/**
 * Send FCM notification using Firebase Admin SDK
 * Alternative to direct FCM API calls with better error handling
 */
export async function sendFirebaseNotification(
  tokens: string | string[],
  notification: {
    title: string;
    body: string;
    imageUrl?: string;
  },
  data?: Record<string, string>,
  options?: {
    android?: any;
    apns?: any;
    webpush?: any;
    priority?: 'high' | 'normal';
  }
): Promise<{
  success: boolean;
  successCount: number;
  failureCount: number;
  responses: any[];
  errors: string[];
}> {
  try {
    const messaging = getFirebaseMessaging();

    // Build message payload
    const message: any = {
      notification: {
        title: notification.title,
        body: notification.body,
        ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
      },
      ...(data && { data }),
      ...(options?.android && { android: options.android }),
      ...(options?.apns && { apns: options.apns }),
      ...(options?.webpush && { webpush: options.webpush }),
    };

    let response: any;
    const errors: string[] = [];

    if (Array.isArray(tokens)) {
      // Send to multiple tokens
      response = await messaging.sendEachForMulticast({
        ...message,
        tokens,
      });

      // Extract errors from failed responses
      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          errors.push(`Token ${tokens[idx]}: ${resp.error?.message || 'Unknown error'}`);
        }
      });
    } else {
      // Send to single token
      try {
        const messageId = await messaging.send({
          ...message,
          token: tokens,
        });
        response = {
          successCount: 1,
          failureCount: 0,
          responses: [{ success: true, messageId }],
        };
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Unknown error');
        response = {
          successCount: 0,
          failureCount: 1,
          responses: [{ success: false, error }],
        };
      }
    }

    return {
      success: response.successCount > 0,
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
      errors,
    };
  } catch (error) {
    console.error('Firebase notification sending failed:', error);
    return {
      success: false,
      successCount: 0,
      failureCount: Array.isArray(tokens) ? tokens.length : 1,
      responses: [],
      errors: [error instanceof Error ? error.message : 'Unknown Firebase error'],
    };
  }
}

/**
 * Validate FCM token format
 */
export function validateFCMToken(token: string): boolean {
  // FCM tokens are typically 152-163 characters long and contain alphanumeric characters plus specific symbols
  const fcmTokenRegex = /^[A-Za-z0-9_-]{140,170}$/;
  return fcmTokenRegex.test(token);
}

/**
 * Get FCM configuration for direct API calls
 */
export function getFCMConfig(): {
  projectId: string;
  serverKey: string;
} {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serverKey = process.env.FCM_SERVER_KEY;

  if (!projectId || !serverKey) {
    throw new Error('Missing FCM configuration in environment variables');
  }

  return { projectId, serverKey };
}

/**
 * Clean up Firebase app instance (for testing or reinitialization)
 */
export function cleanupFirebase(): void {
  if (firebaseApp) {
    try {
      firebaseApp.delete();
      firebaseApp = null;
    } catch (error) {
      console.error('Failed to cleanup Firebase app:', error);
    }
  }
}

/**
 * Health check for Firebase Admin SDK
 */
export async function checkFirebaseHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  details: string;
}> {
  try {
    const app = initializeFirebaseAdmin();
    const messaging = getFirebaseMessaging();

    // Simple health check - just verify the SDK is initialized
    if (app && messaging) {
      return {
        status: 'healthy',
        details: 'Firebase Admin SDK initialized successfully',
      };
    } else {
      return {
        status: 'unhealthy',
        details: 'Firebase Admin SDK not properly initialized',
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      details: error instanceof Error ? error.message : 'Unknown Firebase error',
    };
  }
}