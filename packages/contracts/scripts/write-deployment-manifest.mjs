import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const [broadcastInput, outputInput] = process.argv.slice(2);
if (!broadcastInput || !outputInput) {
  throw new Error("Usage: node scripts/write-deployment-manifest.mjs <run-latest.json> <manifest.json>");
}

const root = resolve(import.meta.dirname, "..");
const broadcastPath = resolve(process.cwd(), broadcastInput);
const outputPath = resolve(process.cwd(), outputInput);
const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));
const contractNames = ["YDToken", "CourseMarket", "CourseCertificate", "CompletionOracle"];
const chainId = Number.parseInt(broadcast.transactions?.[0]?.transaction?.chainId ?? "0x0", 16);
if (chainId !== 11155111) throw new Error(`Expected Sepolia broadcast, received chainId ${chainId}`);

function abiSha256(path) {
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  return `0x${createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex")}`;
}

function receiptFor(index) {
  const receipt = broadcast.receipts?.[index];
  return receipt ? {
    transactionHash: receipt.transactionHash,
    blockNumber: Number.parseInt(receipt.blockNumber, 16),
    status: Number.parseInt(receipt.status, 16),
  } : null;
}

const deployments = Object.fromEntries(contractNames.map((contractName) => {
  const index = broadcast.transactions.findIndex((transaction) =>
    transaction.transactionType === "CREATE" && transaction.contractName === contractName);
  if (index < 0) return [contractName, null];
  const transaction = broadcast.transactions[index];
  return [contractName, {
    address: transaction.contractAddress,
    ...receiptFor(index),
    abiSha256: abiSha256(resolve(root, `out/${contractName}.sol/${contractName}.json`)),
  }];
}));

const roleTransactions = broadcast.transactions.flatMap((transaction, index) =>
  transaction.function === "grantRole(bytes32,address)"
    ? [{ contract: transaction.contractName, address: transaction.contractAddress,
        role: transaction.arguments?.[0], grantee: transaction.arguments?.[1], ...receiptFor(index) }]
    : []);

let gitCommit = "unknown";
try {
  gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch { /* a source archive may not include .git */ }

const manifest = {
  schemaVersion: 1,
  network: "sepolia",
  chainId: 11155111,
  generatedAt: new Date().toISOString(),
  gitCommit,
  sourceBroadcast: relative(root, broadcastPath),
  deployments,
  roleTransactions,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Deployment manifest written to ${outputPath}`);
