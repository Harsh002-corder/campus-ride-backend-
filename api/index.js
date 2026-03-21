import express from "express";
import { User } from "../src/models/User.js";
import { connectDb } from "../src/config/db.js";
import { assertRequiredEnvVars, getMissingRequiredEnvVars } from "../src/config/env.js";
import { createApp } from "../src/app.js";

const baseApp = createApp();
const app = express();
let runtimeReadyPromise;

async function ensureRuntimeReady() {
  if (!runtimeReadyPromise) {
    runtimeReadyPromise = (async () => {
      assertRequiredEnvVars();
      await connectDb();
      console.log("[BOOT] Runtime dependencies are ready");
    })().catch((error) => {
      runtimeReadyPromise = null;
      throw error;
    });
  }

  await runtimeReadyPromise;
}

app.use((req, res, next) => {
  ensureRuntimeReady()
    .then(() => next())
    .catch((error) => {
      const missing = getMissingRequiredEnvVars();
      console.error("[BOOT] Failed to prepare runtime", error);
      res.status(500).json({
        error: "Backend boot failed",
        message: error?.message || "Unexpected startup error",
        ...(missing.length > 0 ? { missingEnv: missing } : {}),
      });
    });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "OK" });
});

app.get("/api/test", async (_req, res) => {
  try {
    const data = await User.findOne().select("_id name email role").lean();
    res.json({ ok: true, data: data || null });
  } catch (error) {
    console.error("[API] /api/test query failed", error);
    res.status(500).json({ error: error?.message || "Test query failed" });
  }
});

app.use(baseApp);

export default app;
