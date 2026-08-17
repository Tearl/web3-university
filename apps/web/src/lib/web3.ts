import { LOCAL_CHAIN_ID, SEPOLIA_CHAIN_ID, localContracts } from "@web3-university/shared";
import { defineChain, getAddress } from "viem";
import { sepolia } from "viem/chains";
import { createConfig, http, injected } from "wagmi";

const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? LOCAL_CHAIN_ID);
if (configuredChainId !== LOCAL_CHAIN_ID && configuredChainId !== SEPOLIA_CHAIN_ID) {
  throw new Error(`Unsupported NEXT_PUBLIC_CHAIN_ID: ${configuredChainId}`);
}

export const appChainId = configuredChainId;
export const isLocalChain = appChainId === LOCAL_CHAIN_ID;
export const networkLabel = isLocalChain ? "Anvil · 31337" : "Sepolia · 11155111";

const configuredRpcUrl = process.env.NEXT_PUBLIC_RPC_URL?.trim();
if (!isLocalChain && !configuredRpcUrl) {
  throw new Error("NEXT_PUBLIC_RPC_URL is required for Sepolia");
}

const localAnvil = defineChain({
  id: LOCAL_CHAIN_ID,
  name: "Anvil Local",
  nativeCurrency: { name: "Anvil Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [configuredRpcUrl || "http://127.0.0.1:8545"] },
  },
  testnet: true,
});

export const appChain = isLocalChain
  ? localAnvil
  : { ...sepolia, rpcUrls: { ...sepolia.rpcUrls, default: { http: [configuredRpcUrl!] } } };

function configuredAddress(name: string, value: string | undefined, localValue: `0x${string}`) {
  const candidate = value?.trim() || (isLocalChain ? localValue : "");
  if (!candidate) throw new Error(`${name} is required for Sepolia`);
  return getAddress(candidate);
}

export const contracts = {
  ydToken: configuredAddress("NEXT_PUBLIC_YD_TOKEN_ADDRESS", process.env.NEXT_PUBLIC_YD_TOKEN_ADDRESS, localContracts.ydToken),
  courseMarket: configuredAddress("NEXT_PUBLIC_COURSE_MARKET_ADDRESS", process.env.NEXT_PUBLIC_COURSE_MARKET_ADDRESS, localContracts.courseMarket),
  certificate: configuredAddress("NEXT_PUBLIC_CERTIFICATE_ADDRESS", process.env.NEXT_PUBLIC_CERTIFICATE_ADDRESS, localContracts.certificate),
  completionOracle: configuredAddress("NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS", process.env.NEXT_PUBLIC_COMPLETION_ORACLE_ADDRESS, localContracts.completionOracle),
} as const;

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected()],
  transports: {
    [LOCAL_CHAIN_ID]: http(isLocalChain ? appChain.rpcUrls.default.http[0] : "http://127.0.0.1:8545"),
    [SEPOLIA_CHAIN_ID]: http(!isLocalChain ? appChain.rpcUrls.default.http[0] : sepolia.rpcUrls.default.http[0]),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
