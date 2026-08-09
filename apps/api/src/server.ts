import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
