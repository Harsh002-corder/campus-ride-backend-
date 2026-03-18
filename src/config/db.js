import mongoose from "mongoose";
import { env } from "./env.js";
import "../models/index.js";

let connectingPromise = null;
let reconnectTimer = null;

function bindConnectionEvents() {
  mongoose.connection.on("connected", () => {
    console.log(`[DB] Connected to MongoDB (${mongoose.connection.name})`);
  });

  mongoose.connection.on("error", (error) => {
    console.error("[DB] MongoDB connection error:", error.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[DB] MongoDB disconnected. Reconnect loop is active.");
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer || mongoose.connection.readyState === 1) {
    return;
  }

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectDb();
    } catch (error) {
      console.error("[DB] Reconnect attempt failed:", error.message);
      scheduleReconnect();
    }
  }, env.mongoReconnectMs);
}

export async function connectDb() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectingPromise) {
    connectingPromise = mongoose.connect(env.mongodbUri, {
      dbName: env.mongodbDbName,
      autoIndex: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
    }).finally(() => {
      connectingPromise = null;
    });
  }

  await connectingPromise;
  return mongoose.connection;
}

export function getDb() {
  if (!mongoose.connection?.db) {
    throw new Error("Database not connected. Call connectDb first.");
  }
  return mongoose.connection.db;
}

export async function closeDb() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

bindConnectionEvents();