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
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  app.use("/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}