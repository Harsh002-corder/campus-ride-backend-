import dotenv from "dotenv";
import { parseOriginList } from "../utils/originMatcher.js";

dotenv.config();

const DEFAULT_CLIENT_ORIGINS = "http://localhost:8080,https://campusride-deploy.vercel.app,https://campusride.tech,https://www.campusride.tech";
const DEFAULT_WILDCARD_ORIGIN_PATTERNS = "*.vercel.app,*.campusride.tech";

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "";

export function getMissingRequiredEnvVars() {
  const missing = [];

  if (!mongoUri) {
    missing.push("MONGO_URI");
  }

  if (!process.env.JWT_SECRET) {
    missing.push("JWT_SECRET");
  }

  return missing;
}

export function assertRequiredEnvVars() {
  const missing = getMissingRequiredEnvVars();
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  mongodbUri: mongoUri,
  mongodbDbName: process.env.MONGODB_DB_NAME || "campus_rider",
  mongoReconnectMs: Number(process.env.MONGO_RECONNECT_MS || 5000),
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  clientOrigins: parseOriginList(process.env.CLIENT_ORIGIN || process.env.ALLOWED_ORIGINS || DEFAULT_CLIENT_ORIGINS),
  wildcardClientOriginPatterns: parseOriginList(process.env.ALLOWED_ORIGIN_PATTERNS || DEFAULT_WILDCARD_ORIGIN_PATTERNS),
  allowLanOrigins: process.env.ALLOW_LAN_ORIGINS === "true",
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
};

env.emailUser = process.env.EMAIL_USER || "";
env.emailPass = process.env.EMAIL_PASS || "";
env.emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER || "";
env.otpReturnInResponse = process.env.OTP_RETURN_IN_RESPONSE === "true";
env.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || "";
env.firebaseServerKey = process.env.FIREBASE_SERVER_KEY || "";
env.webPushPublicKey = process.env.WEB_PUSH_PUBLIC_KEY || "";
env.webPushPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY || "";
env.openAiApiKey = process.env.OPENAI_API_KEY || "";

env.clientOrigin = env.clientOrigins[0] || "https://campusride-deploy.vercel.app";