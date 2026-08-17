import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, formatEther, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
if (!existsSync(envPath)) throw new Error("Missing root .env");
process.loadEnvFile(envPath);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function privateKey(name: string) {
  const value = required(name);
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) throw new Error(`${name} must be a 32-byte hex private key`);
  return value as `0x${string}`;
}

if (required("CHAIN_ID") !== "11155111" || required("NEXT_PUBLIC_CHAIN_ID") !== "11155111") {
  throw new Error("CHAIN_ID and NEXT_PUBLIC_CHAIN_ID must both equal 11155111");
}

const rpcUrl = required("SEPOLIA_RPC_URL");
if (new URL(rpcUrl).protocol !== "https:") throw new Error("SEPOLIA_RPC_URL must use HTTPS");

const deployer = privateKeyToAccount(privateKey("DEPLOYER_PRIVATE_KEY"));
const teacher = privateKeyToAccount(privateKey("TEACHER_PRIVATE_KEY"));
const treasury = privateKeyToAccount(privateKey("TREASURY_PRIVATE_KEY"));
const treasuryAddress = getAddress(required("TREASURY_ADDRESS"));
const teacherAddress = getAddress(required("TEACHER_ADDRESS"));
const oracleOperatorAddress = getAddress(required("ORACLE_OPERATOR_ADDRESS"));
const studentAddress = getAddress(required("STUDENT_ADDRESS"));
const studentYdTarget = BigInt(process.env.STUDENT_YD_TARGET?.trim() || "100000000000000000000");

if (teacher.address !== teacherAddress) throw new Error("TEACHER_PRIVATE_KEY does not match TEACHER_ADDRESS");
if (treasury.address !== treasuryAddress) throw new Error("TREASURY_PRIVATE_KEY does not match TREASURY_ADDRESS");
if (studentYdTarget <= 0n) throw new Error("STUDENT_YD_TARGET must be positive");

const client = createPublicClient({ transport: http(rpcUrl) });
let chainId: number;
let balances: readonly [bigint, bigint, bigint, bigint];
try {
  [chainId, balances] = await Promise.all([
    client.getChainId(),
    Promise.all([
      client.getBalance({ address: deployer.address }),
      client.getBalance({ address: teacherAddress }),
      client.getBalance({ address: treasuryAddress }),
      client.getBalance({ address: studentAddress }),
    ]),
  ]);
} catch {
  throw new Error("Sepolia RPC preflight failed; endpoint redacted");
}

if (chainId !== 11155111) throw new Error(`Expected Sepolia chainId 11155111, received ${chainId}`);
if (balances[0] === 0n) throw new Error("Deployer has no Sepolia ETH");
if (balances[1] === 0n) throw new Error("Teacher has no Sepolia ETH");
if (balances[2] === 0n) throw new Error("Treasury has no Sepolia ETH");

console.log(JSON.stringify({
  status: "ready",
  chainId,
  roles: {
    deployer: { address: deployer.address, eth: formatEther(balances[0]) },
    treasury: { address: treasuryAddress, eth: formatEther(balances[2]) },
    teacher: { address: teacherAddress, eth: formatEther(balances[1]) },
    oracleOperator: { address: oracleOperatorAddress },
    student: { address: studentAddress, eth: formatEther(balances[3]), ydTarget: studentYdTarget.toString() },
  },
}, null, 2));
