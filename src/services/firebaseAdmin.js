import admin from "firebase-admin";
import { env } from "../config/env.js";

let appInstance = null;

function hasFirebaseAdminCredentials() {
  return Boolean(env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey);
}

export function getFirebaseAdminMessaging() {
  if (!hasFirebaseAdminCredentials()) {
    return null;
  }

  if (!appInstance) {
    appInstance = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.firebaseProjectId,
        clientEmail: env.firebaseClientEmail,
        privateKey: env.firebasePrivateKey,
      }),
      ...(env.firebaseStorageBucket ? { storageBucket: env.firebaseStorageBucket } : {}),
    }, "campusride-admin");
  }

  return appInstance.messaging();
}

export function isFirebasePushConfigured() {
  return hasFirebaseAdminCredentials();
}
