import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, getAddress, http, keccak256, parseAbi, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
if (!existsSync(envPath)) throw new Error("Missing root .env");
process.loadEnvFile(envPath);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (required("CHAIN_ID") !== "11155111" || required("NEXT_PUBLIC_CHAIN_ID") !== "11155111") {
  throw new Error("CHAIN_ID and NEXT_PUBLIC_CHAIN_ID must both equal 11155111");
}

const rpcUrl = required("SEPOLIA_RPC_URL");
const apiUrl = new URL(required("CRE_API_BASE_URL"));
if (apiUrl.protocol !== "https:") throw new Error("CRE_API_BASE_URL must use HTTPS");
if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(apiUrl.hostname) || apiUrl.hostname.endsWith(".local")) {
  throw new Error("CRE_API_BASE_URL must be publicly reachable, not localhost");
}

const oracleApiKey = required("ORACLE_API_KEY");
if (oracleApiKey === "change-me" || oracleApiKey.length < 16) {
  throw new Error("ORACLE_API_KEY must be a non-default secret with at least 16 characters");
}

const forwarder = getAddress(required("CRE_FORWARDER_ADDRESS"));
const workflowOwner = getAddress(required("CRE_WORKFLOW_OWNER_ADDRESS"));
const market = getAddress(required("COURSE_MARKET_ADDRESS"));
const certificate = getAddress(required("COURSE_CERTIFICATE_ADDRESS"));
const oracleValue = process.env.CRE_COMPLETION_ORACLE_ADDRESS?.trim();
const oracle = oracleValue ? getAddress(oracleValue) : null;
const fallbackSignerValue = process.env.FALLBACK_ORACLE_SIGNER_ADDRESS?.trim();
const fallbackKeyValue = process.env.FALLBACK_ORACLE_PRIVATE_KEY?.trim();
if (Boolean(fallbackSignerValue) !== Boolean(fallbackKeyValue)) {
  throw new Error("FALLBACK_ORACLE_SIGNER_ADDRESS and FALLBACK_ORACLE_PRIVATE_KEY must be configured together");
}
const fallbackSigner = fallbackSignerValue ? getAddress(fallbackSignerValue) : null;
if (fallbackSigner && !/^0x[a-fA-F0-9]{64}$/.test(fallbackKeyValue!)) {
  throw new Error("FALLBACK_ORACLE_PRIVATE_KEY must be a 32-byte hex private key");
}
if (fallbackSigner && privateKeyToAccount(fallbackKeyValue as `0x${string}`).address !== fallbackSigner) {
  throw new Error("FALLBACK_ORACLE_PRIVATE_KEY does not match FALLBACK_ORACLE_SIGNER_ADDRESS");
}
const client = createPublicClient({ transport: http(rpcUrl) });

let chainId: number;
let codes: readonly [`0x${string}` | undefined, `0x${string}` | undefined, `0x${string}` | undefined];
try {
  [chainId, codes] = await Promise.all([
    client.getChainId(),
    Promise.all([
      client.getBytecode({ address: forwarder }),
      client.getBytecode({ address: market }),
      client.getBytecode({ address: certificate }),
    ]),
  ]);
} catch {
  throw new Error("CRE Sepolia RPC preflight failed; endpoint redacted");
}
if (chainId !== 11155111) throw new Error(`Expected Sepolia chainId 11155111, received ${chainId}`);
for (const [name, code] of [["CRE_FORWARDER_ADDRESS", codes[0]], ["COURSE_MARKET_ADDRESS", codes[1]], ["COURSE_CERTIFICATE_ADDRESS", codes[2]]] as const) {
  if (!code || code === "0x") throw new Error(`${name} has no Sepolia bytecode`);
}

try {
  const response = await fetch(new URL("/health", apiUrl), { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error();
} catch {
  throw new Error("CRE public API health check failed; URL and credentials redacted");
}

if (oracle) {
  const oracleAbi = parseAbi([
    "function courseMarket() view returns (address)",
    "function certificate() view returns (address)",
    "function creForwarder() view returns (address)",
    "function fallbackOracleSigner() view returns (address)",
  ]);
  const accessAbi = parseAbi(["function hasRole(bytes32 role, address account) view returns (bool)"]);
  const [code, oracleMarket, oracleCertificate, oracleForwarder, oracleFallbackSigner, isMinter] = await Promise.all([
    client.getBytecode({ address: oracle }),
    client.readContract({ address: oracle, abi: oracleAbi, functionName: "courseMarket" }),
    client.readContract({ address: oracle, abi: oracleAbi, functionName: "certificate" }),
    client.readContract({ address: oracle, abi: oracleAbi, functionName: "creForwarder" }),
    client.readContract({ address: oracle, abi: oracleAbi, functionName: "fallbackOracleSigner" }),
    client.readContract({
      address: certificate,
      abi: accessAbi,
      functionName: "hasRole",
      args: [keccak256(toBytes("MINTER_ROLE")), oracle],
    }),
  ]);
  if (!code || code === "0x") throw new Error("CRE_COMPLETION_ORACLE_ADDRESS has no Sepolia bytecode");
  if (
    oracleMarket !== market ||
    oracleCertificate !== certificate ||
    oracleForwarder !== forwarder ||
    (fallbackSigner !== null && oracleFallbackSigner !== fallbackSigner) ||
    !isMinter
  ) {
    throw new Error("CRE CompletionOracle dependencies or MINTER_ROLE do not match configuration");
  }
}

console.log(JSON.stringify({
  status: oracle ? "ready-for-workflow" : "ready-to-deploy-oracle",
  chainId,
  apiOrigin: apiUrl.origin,
  contracts: { market, certificate, forwarder, completionOracle: oracle },
  workflowOwner,
  fallbackOracle: fallbackSigner ? { signer: fallbackSigner } : null,
}, null, 2));
