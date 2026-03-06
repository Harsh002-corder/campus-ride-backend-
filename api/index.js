import { connectDb } from "../src/config/db.js";
import { createApp } from "../src/app.js";

const app = createApp();
let dbConnectPromise;

async function ensureDbConnected() {
  if (!dbConnectPromise) {
    dbConnectPromise = connectDb().catch((error) => {
      dbConnectPromise = null;
      throw error;
    });
  }

  await dbConnectPromise;
}

export default async function handler(req, res) {
  await ensureDbConnected();
  return app(req, res);
}
