import { createHmac } from "node:crypto";
import { config } from "./config.js";

export function createSignedVideoUrl(videoKey: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + config.VIDEO_URL_TTL_SECONDS;
  const signature = createHmac("sha256", config.VIDEO_SIGNING_SECRET)
    .update(`${videoKey}:${expiresAt}`)
    .digest("hex");
  const baseUrl = config.VIDEO_BASE_URL.replace(/\/$/, "");

  return {
    url: `${baseUrl}/${encodeURIComponent(videoKey)}?expires=${expiresAt}&signature=${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
