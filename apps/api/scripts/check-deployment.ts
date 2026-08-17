import { createPublicClient, getAddress, http, keccak256, parseAbi, toBytes } from "viem";
import { config } from "../src/config.js";

const client = createPublicClient({ transport: http(config.RPC_URL) });
const addresses = {
  ydToken: config.YD_TOKEN_ADDRESS,
  courseMarket: config.COURSE_MARKET_ADDRESS,
  certificate: config.COURSE_CERTIFICATE_ADDRESS,
  completionOracle: config.COMPLETION_ORACLE_ADDRESS,
};

const accessAbi = parseAbi(["function hasRole(bytes32 role, address account) view returns (bool)"]);
const ydAbi = parseAbi(["function totalSupply() view returns (uint256)"]);
const marketAbi = parseAbi([
  "function ydToken() view returns (address)",
  "function treasury() view returns (address)",
]);
const oracleAbi = parseAbi([
  "function courseMarket() view returns (address)",
  "function certificate() view returns (address)",
  "function creForwarder() view returns (address)",
  "function fallbackOracleSigner() view returns (address)",
]);

function requireEqual(name: string, actual: string | number | bigint, expected: string | number | bigint) {
  if (String(actual).toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`${name} mismatch: ${actual} != ${expected}`);
  }
}

const actualChainId = await client.getChainId();
requireEqual("chainId", actualChainId, config.CHAIN_ID);
const webRpcClient = createPublicClient({ transport: http(config.NEXT_PUBLIC_RPC_URL) });
const webRpcChainId = await webRpcClient.getChainId();
requireEqual("NEXT_PUBLIC_RPC_URL chainId", webRpcChainId, config.CHAIN_ID);

for (const [name, address] of Object.entries(addresses)) {
  const bytecode = await client.getBytecode({ address });
  if (!bytecode || bytecode === "0x") throw new Error(`${name} has no bytecode at ${address}`);
}

const [totalSupply, marketYd, marketTreasury, oracleMarket, oracleCertificate] = await Promise.all([
  client.readContract({ address: addresses.ydToken, abi: ydAbi, functionName: "totalSupply" }),
  client.readContract({ address: addresses.courseMarket, abi: marketAbi, functionName: "ydToken" }),
  client.readContract({ address: addresses.courseMarket, abi: marketAbi, functionName: "treasury" }),
  client.readContract({ address: addresses.completionOracle, abi: oracleAbi, functionName: "courseMarket" }),
  client.readContract({ address: addresses.completionOracle, abi: oracleAbi, functionName: "certificate" }),
]);

requireEqual("YD totalSupply", totalSupply, 1_000_000n * 10n ** 18n);
requireEqual("CourseMarket.ydToken", marketYd, addresses.ydToken);
requireEqual("CompletionOracle.courseMarket", oracleMarket, addresses.courseMarket);
requireEqual("CompletionOracle.certificate", oracleCertificate, addresses.certificate);

if (process.env.TREASURY_ADDRESS) {
  requireEqual("CourseMarket.treasury", marketTreasury, getAddress(process.env.TREASURY_ADDRESS));
}

const minterRole = keccak256(toBytes("MINTER_ROLE"));
const oracleRole = keccak256(toBytes("ORACLE_ROLE"));
const teacherRole = keccak256(toBytes("TEACHER_ROLE"));
const certificateMinter = await client.readContract({
  address: addresses.certificate, abi: accessAbi, functionName: "hasRole",
  args: [minterRole, addresses.completionOracle],
});
if (!certificateMinter) throw new Error("CompletionOracle is missing CourseCertificate MINTER_ROLE");

if (process.env.CRE_FORWARDER_ADDRESS) {
  const configuredForwarder = getAddress(process.env.CRE_FORWARDER_ADDRESS);
  const actualForwarder = await client.readContract({
    address: addresses.completionOracle, abi: oracleAbi, functionName: "creForwarder",
  });
  requireEqual("CompletionOracle.creForwarder", actualForwarder, configuredForwarder);
} else if (process.env.ORACLE_OPERATOR_ADDRESS) {
  const operator = getAddress(process.env.ORACLE_OPERATOR_ADDRESS);
  const hasRole = await client.readContract({
    address: addresses.completionOracle, abi: accessAbi, functionName: "hasRole", args: [oracleRole, operator],
  });
  if (!hasRole) throw new Error(`${operator} is missing ORACLE_ROLE`);
}

if (process.env.FALLBACK_ORACLE_SIGNER_ADDRESS) {
  const configuredSigner = getAddress(process.env.FALLBACK_ORACLE_SIGNER_ADDRESS);
  const actualSigner = await client.readContract({
    address: addresses.completionOracle, abi: oracleAbi, functionName: "fallbackOracleSigner",
  });
  requireEqual("CompletionOracle.fallbackOracleSigner", actualSigner, configuredSigner);
}

if (process.env.TEACHER_ADDRESS) {
  const teacher = getAddress(process.env.TEACHER_ADDRESS);
  const hasRole = await client.readContract({
    address: addresses.courseMarket, abi: accessAbi, functionName: "hasRole", args: [teacherRole, teacher],
  });
  if (!hasRole) throw new Error(`${teacher} is missing TEACHER_ROLE`);
}

console.log(JSON.stringify({
  status: "ready",
  chainId: actualChainId,
  addresses,
  totalSupply: totalSupply.toString(),
  treasury: marketTreasury,
}, null, 2));
