import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rootEnvFiles = ["../../../.env.local", "../../../.env"];

for (const relativePath of rootEnvFiles) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
