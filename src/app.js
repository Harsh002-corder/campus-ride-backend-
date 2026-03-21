import "express-async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "path";
import routes from "./routes/index.js";
import { env } from "./config/env.js";
import { dbRateLimit } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { isAllowedOrigin } from "./utils/originMatcher.js";

function createCorsBlockedError(origin) {
  const error = new Error(`CORS blocked for origin: ${origin}`);
  error.statusCode = 403;
  return error;
}

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[REQ] ${req.method} ${req.originalUrl}`);
    res.on("finish", () => {
      const elapsedMs = Date.now() - start;
      console.log(`[RES] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs}ms)`);
    });
    next();
  });

  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin({
        origin,
        exactOrigins: env.clientOrigins,
        wildcardHostPatterns: env.wildcardClientOriginPatterns,
        nodeEnv: env.nodeEnv,
        allowLanOrigins: env.allowLanOrigins,
      })) {
        return callback(null, true);
      }
      return callback(createCorsBlockedError(origin));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: "8mb" }));
  app.use(dbRateLimit);

  if (!process.env.VERCEL) {
    app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));
  }

  app.get("/api", (_req, res) => {
    res.json({
      ok: true,
      service: "campus-rider-backend",
      mode: process.env.VERCEL ? "serverless" : "node",
    });
  });

  app.use("/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}