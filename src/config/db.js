import mongoose from "mongoose";
import { env } from "./env.js";
import "../models/index.js";

mongoose.set("bufferCommands", false);

const globalForMongoose = globalThis;

if (!globalForMongoose.__campusRideMongoose) {
  globalForMongoose.__campusRideMongoose = {
    conn: null,
    promise: null,
    eventsBound: false,
  };
}

const mongoCache = globalForMongoose.__campusRideMongoose;

function bindConnectionEvents() {
  if (mongoCache.eventsBound) {
    return;
  }
  mongoCache.eventsBound = true;

  mongoose.connection.on("connected", () => {
    console.log(`[DB] Connected to MongoDB (${mongoose.connection.name})`);
  });

  mongoose.connection.on("error", (error) => {
    console.error("[DB] MongoDB connection error:", error.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[DB] MongoDB disconnected.");
  });
}

export async function connectDb() {
  if (!env.mongodbUri) {
    throw new Error("Missing MongoDB URI. Set MONGO_URI in environment variables.");
  }

  if (mongoCache.conn) {
    return mongoCache.conn;
  }

  if (!mongoCache.promise) {
    mongoCache.promise = mongoose.connect(env.mongodbUri, {
      bufferCommands: false,
      dbName: env.mongodbDbName,
      autoIndex: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 20,
      minPoolSize: 1,
    }).then((mongooseInstance) => mongooseInstance.connection)
      .catch((error) => {
        console.error("[DB] Initial connection failed:", error.message);
        throw error;
      });
  }

  try {
    mongoCache.conn = await mongoCache.promise;
    return mongoCache.conn;
  } catch (error) {
    mongoCache.promise = null;
    throw error;
  }
}

export function getDb() {
  if (!mongoose.connection?.db) {
    throw new Error("Database not connected. Call connectDb first.");
  }
  return mongoose.connection.db;
}

export async function closeDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  mongoCache.conn = null;
  mongoCache.promise = null;
}

bindConnectionEvents();