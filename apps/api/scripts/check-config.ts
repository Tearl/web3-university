import { config, configurationStatus } from "../src/config.js";
import { privateKeyToAccount } from "viem/accounts";

interface Check {
  name: string;
  ready: boolean;
  required: boolean;
}

const checks: Check[] = [
  { name: "DATABASE_URL", ready: configurationStatus.database, required: true },
  { name: "NEXT_PUBLIC_PRIVY_APP_ID", ready: config.NEXT_PUBLIC_PRIVY_APP_ID.length > 0, required: true },
  { name: "PRIVY_APP_ID", ready: config.PRIVY_APP_ID.length > 0, required: true },
  { name: "PRIVY_APP_SECRET", ready: config.PRIVY_APP_SECRET.length > 0, required: true },
  { name: "Privy 前后端 App ID 一致", ready: configurationStatus.privyAppIdsMatch, required: true },
  { name: "API/Web chainId 与合约地址一致", ready: configurationStatus.chainAndAddressesMatch, required: true },
  { name: "PRIVY_VERIFICATION_KEY", ready: config.PRIVY_VERIFICATION_KEY.length > 0, required: false },
  { name: "RPC_URL", ready: config.RPC_URL.length > 0, required: true },
  { name: "COURSE_MARKET_ADDRESS", ready: config.COURSE_MARKET_ADDRESS.length > 0, required: true },
  {
    name: "VIDEO_SIGNING_SECRET 非默认值",
    ready: config.VIDEO_SIGNING_SECRET !== "local-video-signing-secret",
    required: config.NODE_ENV === "production",
  },
  {
    name: "Fallback Oracle 私钥与 signer 地址成对配置",
    ready:
      (config.FALLBACK_ORACLE_PRIVATE_KEY.length === 0 && config.FALLBACK_ORACLE_SIGNER_ADDRESS.length === 0) ||
      (config.FALLBACK_ORACLE_PRIVATE_KEY.length > 0 &&
        config.FALLBACK_ORACLE_SIGNER_ADDRESS.length > 0 &&
        privateKeyToAccount(config.FALLBACK_ORACLE_PRIVATE_KEY as `0x${string}`).address === config.FALLBACK_ORACLE_SIGNER_ADDRESS),
    required: true,
  },
];

for (const check of checks) {
  const state = check.ready ? "READY" : check.required ? "MISSING" : "OPTIONAL";
  console.log(`[${state.padEnd(8)}] ${check.name}`);
}

const missing = checks.filter((check) => check.required && !check.ready);
if (missing.length > 0) {
  console.error(`\n还有 ${missing.length} 项必填配置未就绪。请填写仓库根目录 .env 后重试。`);
  process.exitCode = 1;
} else {
  console.log("\n必填配置已就绪。");
}
