import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const task = process.argv[2];
const tasks = {
  deploy: "DeploySepolia",
  "deploy-cre": "DeployCREOracleSepolia",
  "configure-cre": "ConfigureCREOracleSepolia",
  seed: "SeedSepolia",
  fund: "FundSepoliaStudent",
  "deploy-dex": "DeployDexSepolia",
  "seed-dex": "SeedDexLiquiditySepolia",
};
const contract = tasks[task];
if (!contract) throw new Error(`Unknown Sepolia task: ${task ?? "missing"}`);

const contractsRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(contractsRoot, "../..");
const envPath = resolve(workspaceRoot, ".env");
if (!existsSync(envPath)) throw new Error(`Missing ${envPath}; copy .env.example and configure Sepolia first`);
process.loadEnvFile(envPath);

if (!process.env.SEPOLIA_RPC_URL) throw new Error("SEPOLIA_RPC_URL is required");
if (process.env.CHAIN_ID !== "11155111" || process.env.NEXT_PUBLIC_CHAIN_ID !== "11155111") {
  throw new Error("CHAIN_ID and NEXT_PUBLIC_CHAIN_ID must both equal 11155111");
}

const result = spawnSync("forge", [
  "script",
  `script/${contract}.s.sol:${contract}`,
  "--rpc-url",
  process.env.SEPOLIA_RPC_URL,
  "--broadcast",
  "-vvv",
], { cwd: contractsRoot, env: process.env, stdio: "inherit" });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
