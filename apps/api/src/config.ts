import "./load-env.js";
import { z } from "zod";
import { getAddress } from "viem";

const address = z.string().transform((value, context) => {
  try {
    return getAddress(value);
  } catch {
    context.addIssue({ code: "custom", message: "Invalid EVM address" });
    return z.NEVER;
  }
});

const optionalAddress = z.union([address, z.literal("")]);
const optionalPrivateKey = z.union([
  z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  z.literal(""),
]);
const localAddresses = {
  ydToken: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  courseMarket: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  certificate: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  completionOracle: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
} as const;

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("0.0.0.0"),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CHAIN_ID: z.coerce.number().int().positive().default(31337),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().int().positive().default(31337),
  PRIVY_APP_ID: z.string().default(""),
  PRIVY_APP_SECRET: z.string().default(""),
  PRIVY_VERIFICATION_KEY: z.string().default(""),
  NEXT_PUBLIC_PRIVY_APP_ID: z.string().default(""),
  DATABASE_URL: z.string().default(""),
  ORACLE_API_KEY: z.string().min(8).default("change-me"),
  RPC_URL: z.url().default("http://127.0.0.1:8545"),
  NEXT_PUBLIC_RPC_URL: z.url().default("http://127.0.0.1:8545"),
  SUBGRAPH_URL: z.union([z.url(), z.literal("")]).default(""),
  COURSE_MARKET_START_BLOCK: z.coerce.number().int().nonnegative().default(0),
  COURSE_CERTIFICATE_START_BLOCK: z.coerce.number().int().nonnegative().default(0),
  COURSE_SCAN_LIMIT: z.coerce.number().int().positive().max(1000).default(100),
  COMMENT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().max(60).default(5),
  PROGRESS_INITIAL_ALLOWANCE_SECONDS: z.coerce.number().int().positive().max(300).default(30),
  PROGRESS_UPDATE_GRACE_SECONDS: z.coerce.number().int().nonnegative().max(60).default(10),
  PROGRESS_MAX_DELTA_SECONDS: z.coerce.number().int().positive().max(600).default(60),
  PUBLIC_API_URL: z.url().default("http://localhost:4000"),
  CERTIFICATE_IMAGE_URL: z.url().default("http://localhost:3000/certificate-w3.svg"),
  ORACLE_NONCE_TTL_SECONDS: z.coerce.number().int().positive().max(600).default(120),
  ORACLE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().max(60).default(10),
  FALLBACK_ORACLE_PRIVATE_KEY: optionalPrivateKey.default(""),
  FALLBACK_ORACLE_SIGNER_ADDRESS: optionalAddress.default(""),
  FALLBACK_ATTESTATION_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  LOCAL_ORACLE_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).default("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"),
  YD_TOKEN_ADDRESS: address.default(localAddresses.ydToken),
  COURSE_CERTIFICATE_ADDRESS: address.default(localAddresses.certificate),
  COMPLETION_ORACLE_ADDRESS: address.default(localAddresses.completionOracle),
  COURSE_MARKET_ADDRESS: address.default(localAddresses.courseMarket),
  NEXT_PUBLIC_YD_TOKEN_ADDRESS: optionalAddress.default(""),
  NEXT_PUBLIC_COURSE_MARKET_ADDRESS: optionalAddress.default(""),
  NEXT_PUBLIC_CERTIFICATE_ADDRESS: optionalAddress.default(""),
  NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS: optionalAddress.default(""),
  DEV_TEACHER_KEY: z.string().min(8).default("local-teacher-key"),
  VIDEO_BASE_URL: z.url().default("http://localhost:4000/media"),
  VIDEO_SIGNING_SECRET: z.string().min(16).default("local-video-signing-secret"),
  VIDEO_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),
});

export const config = schema.parse(process.env);

if (config.CHAIN_ID !== 31337 && config.CHAIN_ID !== 11155111) {
  throw new Error(`Unsupported CHAIN_ID: ${config.CHAIN_ID}`);
}
if (config.CHAIN_ID !== config.NEXT_PUBLIC_CHAIN_ID) {
  throw new Error(`CHAIN_ID (${config.CHAIN_ID}) must match NEXT_PUBLIC_CHAIN_ID (${config.NEXT_PUBLIC_CHAIN_ID})`);
}

const webAddresses = {
  ydToken: config.NEXT_PUBLIC_YD_TOKEN_ADDRESS || (config.CHAIN_ID === 31337 ? localAddresses.ydToken : ""),
  courseMarket: config.NEXT_PUBLIC_COURSE_MARKET_ADDRESS || (config.CHAIN_ID === 31337 ? localAddresses.courseMarket : ""),
  certificate: config.NEXT_PUBLIC_CERTIFICATE_ADDRESS || (config.CHAIN_ID === 31337 ? localAddresses.certificate : ""),
  completionOracle: config.NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS || (config.CHAIN_ID === 31337 ? localAddresses.completionOracle : ""),
};
const apiAddresses = {
  ydToken: config.YD_TOKEN_ADDRESS,
  courseMarket: config.COURSE_MARKET_ADDRESS,
  certificate: config.COURSE_CERTIFICATE_ADDRESS,
  completionOracle: config.COMPLETION_ORACLE_ADDRESS,
};

for (const [name, apiAddress] of Object.entries(apiAddresses)) {
  const webAddress = webAddresses[name as keyof typeof webAddresses];
  if (!webAddress) throw new Error(`NEXT_PUBLIC_${name.toUpperCase()}_ADDRESS is required for Sepolia`);
  if (getAddress(webAddress) !== apiAddress) {
    throw new Error(`API/Web ${name} address mismatch: ${apiAddress} != ${webAddress}`);
  }
}

export const configurationStatus = {
  database: config.DATABASE_URL.length > 0,
  privy: config.PRIVY_APP_ID.length > 0 && config.PRIVY_APP_SECRET.length > 0,
  privyAppIdsMatch:
    config.PRIVY_APP_ID.length > 0 &&
    config.NEXT_PUBLIC_PRIVY_APP_ID.length > 0 &&
    config.PRIVY_APP_ID === config.NEXT_PUBLIC_PRIVY_APP_ID,
  chainAndAddressesMatch: true,
  fallbackOracleConfigured:
    config.FALLBACK_ORACLE_PRIVATE_KEY.length > 0 &&
    config.FALLBACK_ORACLE_SIGNER_ADDRESS.length > 0,
  subgraph: config.SUBGRAPH_URL.length > 0,
} as const;
