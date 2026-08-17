import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(root, "../..");
process.loadEnvFile(resolve(workspaceRoot, ".env"));

const slug = process.env.SUBGRAPH_SLUG?.trim();
const version = process.argv.slice(2).find((argument) => argument !== "--")?.trim() || "0.1.0";
if (!slug) throw new Error("SUBGRAPH_SLUG is required in .env");
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid semver version label: ${version}`);
}

const sync = spawnSync("pnpm", ["sync"], { cwd: root, stdio: "inherit" });
if (sync.status !== 0) process.exit(sync.status ?? 1);
const deploy = spawnSync(
  "graph",
  ["deploy", slug, "--network", "sepolia", "--version-label", version],
  { cwd: root, stdio: "inherit" },
);
if (deploy.error) throw deploy.error;
process.exit(deploy.status ?? 1);
