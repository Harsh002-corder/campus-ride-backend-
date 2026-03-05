import http from "http";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";
import { initSocket } from "./services/socket.js";
import { startScheduledRideProcessor } from "./services/scheduledRideService.js";

async function bootstrap() {
  await connectDb();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(
    server,
    env.clientOrigins,
    env.nodeEnv,
    env.allowLanOrigins,
    env.wildcardClientOriginPatterns
  );
  startScheduledRideProcessor();

  server.listen(env.port, () => {
    console.log(`Campus Rider backend listening on port ${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});