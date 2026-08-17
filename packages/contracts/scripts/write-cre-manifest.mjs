import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const [broadcastInput, outputInput] = process.argv.slice(2);
if (!broadcastInput || !outputInput) {
  throw new Error("Usage: node scripts/write-cre-manifest.mjs <run-latest.json> <manifest.json>");
}

const root = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(root, "../..");
process.loadEnvFile(resolve(workspaceRoot, ".env"));
const broadcastPath = resolve(process.cwd(), broadcastInput);
const outputPath = resolve(process.cwd(), outputInput);
const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));
const chainId = Number.parseInt(broadcast.transactions?.[0]?.transaction?.chainId ?? "0x0", 16);
if (chainId !== 11155111) throw new Error(`Expected Sepolia broadcast, received chainId ${chainId}`);

const createIndex = broadcast.transactions.findIndex((transaction) =>
  transaction.transactionType === "CREATE" && transaction.contractName === "CompletionOracle");
const configuredAddress = process.env.CRE_COMPLETION_ORACLE_ADDRESS?.trim();
const oracleAddress = createIndex >= 0
  ? broadcast.transactions[createIndex].contractAddress
  : configuredAddress;
if (!oracleAddress) throw new Error("CompletionOracle deployment address was not found");

function receiptFor(index) {
  const receipt = broadcast.receipts?.[index];
  return receipt ? {
    transactionHash: receipt.transactionHash,
    blockNumber: Number.parseInt(receipt.blockNumber, 16),
    status: Number.parseInt(receipt.status, 16),
  } : null;
}

const artifact = JSON.parse(readFileSync(resolve(root, "out/CompletionOracle.sol/CompletionOracle.json"), "utf8"));
let gitCommit = "unknown";
try {
  gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch { /* source archives may not contain .git */ }

const manifest = {
  schemaVersion: 1,
  integration: "chainlink-cre",
  network: "sepolia",
  chainId: 11155111,
  generatedAt: new Date().toISOString(),
  gitCommit,
  sourceBroadcast: relative(root, broadcastPath),
  completionOracle: {
    address: oracleAddress,
    ...(createIndex >= 0 ? receiptFor(createIndex) : { reused: true }),
    abiSha256: `0x${createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex")}`,
  },
  courseMarket: process.env.COURSE_MARKET_ADDRESS,
  certificate: process.env.COURSE_CERTIFICATE_ADDRESS,
  forwarder: process.env.CRE_FORWARDER_ADDRESS,
  fallbackOracleSigner: process.env.FALLBACK_ORACLE_SIGNER_ADDRESS || null,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`CRE deployment manifest written to ${outputPath}`);
