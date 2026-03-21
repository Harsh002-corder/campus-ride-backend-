import { connectDb } from "../src/config/db.js";
import { assertRequiredEnvVars, getMissingRequiredEnvVars } from "../src/config/env.js";
import { createApp } from "../src/app.js";

const app = createApp();
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

export default app;
