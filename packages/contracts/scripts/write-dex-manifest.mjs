import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const [deployInput, liquidityInput, outputInput] = process.argv.slice(2);
if (!deployInput || !liquidityInput || !outputInput) {
  throw new Error(
    "Usage: node scripts/write-dex-manifest.mjs <deploy-run.json> <liquidity-run.json> <manifest.json>",
  );
}

const root = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(root, "../..");
process.loadEnvFile(resolve(workspaceRoot, ".env"));
const deployPath = resolve(process.cwd(), deployInput);
const liquidityPath = resolve(process.cwd(), liquidityInput);
const outputPath = resolve(process.cwd(), outputInput);
const deploy = JSON.parse(readFileSync(deployPath, "utf8"));
const liquidity = JSON.parse(readFileSync(liquidityPath, "utf8"));

function chainIdOf(broadcast) {
  return Number.parseInt(broadcast.transactions?.[0]?.transaction?.chainId ?? "0x0", 16);
}
if (chainIdOf(deploy) !== 11155111 || chainIdOf(liquidity) !== 11155111) {
  throw new Error("Both DEX broadcasts must be from Sepolia (11155111)");
}

const constants = {
  factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
  positionManager: "0x1238536071E1c677A632429e3655c799b22cDA52",
  quoterV2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  swapRouter02: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
};
const poolCreatedTopic = "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118";
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function addressFromTopic(topic) {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function deployedAddress(name, configuredName) {
  const transaction = deploy.transactions.find((item) =>
    item.transactionType === "CREATE" && item.contractName === name);
  return transaction?.contractAddress ?? process.env[configuredName] ?? null;
}

function artifactHash(contractName) {
  const artifact = JSON.parse(
    readFileSync(resolve(root, `out/${contractName}.sol/${contractName}.json`), "utf8"),
  );
  return `0x${createHash("sha256").update(JSON.stringify(artifact.abi)).digest("hex")}`;
}

const allLiquidityLogs = liquidity.receipts.flatMap((receipt) => receipt.logs ?? []);
const pools = allLiquidityLogs
  .filter((log) => log.address.toLowerCase() === constants.factory.toLowerCase()
    && log.topics?.[0] === poolCreatedTopic)
  .map((log) => ({
    token0: addressFromTopic(log.topics[1]),
    token1: addressFromTopic(log.topics[2]),
    fee: Number(BigInt(log.topics[3])),
    tickSpacing: Number(BigInt(`0x${log.data.slice(2, 66)}`)),
    address: `0x${log.data.slice(2 + 64 + 24, 2 + 128)}`,
    transactionHash: log.transactionHash,
    blockNumber: Number.parseInt(log.blockNumber, 16),
  }));

const positions = allLiquidityLogs
  .filter((log) => log.address.toLowerCase() === constants.positionManager.toLowerCase()
    && log.topics?.[0] === transferTopic
    && BigInt(log.topics?.[1] ?? "0x1") === 0n)
  .map((log) => ({
    tokenId: BigInt(log.topics[3]).toString(),
    owner: addressFromTopic(log.topics[2]),
    transactionHash: log.transactionHash,
    blockNumber: Number.parseInt(log.blockNumber, 16),
  }));

let gitCommit = "unknown";
try {
  gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
} catch { /* source archives may not contain .git */ }

const mockUsdc = deployedAddress("MockUSDC", "MOCK_USDC_ADDRESS");
const gateway = deployedAddress("TestnetSwapGateway", "SWAP_GATEWAY_ADDRESS");
if (!mockUsdc || !gateway) throw new Error("MockUSDC or TestnetSwapGateway address was not found");

const manifest = {
  schemaVersion: 1,
  integration: "uniswap-v3",
  network: "sepolia",
  chainId: 11155111,
  generatedAt: new Date().toISOString(),
  gitCommit,
  sourceBroadcasts: [relative(root, deployPath), relative(root, liquidityPath)],
  ownedContracts: {
    MockUSDC: { address: mockUsdc, abiSha256: artifactHash("MockUSDC") },
    TestnetSwapGateway: { address: gateway, abiSha256: artifactHash("TestnetSwapGateway") },
  },
  tokens: { yd: process.env.YD_TOKEN_ADDRESS, weth: constants.weth, mockUsdc },
  uniswap: { ...constants, fee: 3000, tickLower: -887220, tickUpper: 887220 },
  configuredLiquidity: {
    weth: process.env.DEX_WETH_LIQUIDITY_WEI ?? "10000000000000000",
    wethPoolYD: process.env.DEX_WETH_YD_LIQUIDITY_WEI ?? "100000000000000000000",
    mockUsdc: process.env.DEX_MOCK_USDC_LIQUIDITY_UNITS ?? "100000000",
    mockUsdcPoolYD: process.env.DEX_MOCK_USDC_YD_LIQUIDITY_WEI ?? "100000000000000000000",
  },
  pools,
  positions,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`DEX deployment manifest written to ${outputPath}`);
