import { getAddress, zeroAddress, type Address } from "viem";
import { isLocalChain } from "./web3";

function optionalAddress(value: string | undefined): Address | undefined {
  const candidate = value?.trim();
  return candidate ? getAddress(candidate) : undefined;
}

function officialOrConfigured(value: string | undefined, sepoliaAddress: Address): Address {
  return optionalAddress(value) ?? (isLocalChain ? zeroAddress : sepoliaAddress);
}

export const dexContracts = {
  factory: officialOrConfigured(
    process.env.NEXT_PUBLIC_UNISWAP_V3_FACTORY_ADDRESS,
    "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
  ),
  quoterV2: officialOrConfigured(
    process.env.NEXT_PUBLIC_UNISWAP_QUOTER_V2_ADDRESS,
    "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  ),
  swapRouter02: officialOrConfigured(
    process.env.NEXT_PUBLIC_UNISWAP_SWAP_ROUTER_02_ADDRESS,
    "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  ),
  positionManager: officialOrConfigured(
    process.env.NEXT_PUBLIC_UNISWAP_POSITION_MANAGER_ADDRESS,
    "0x1238536071E1c677A632429e3655c799b22cDA52",
  ),
  weth: officialOrConfigured(
    process.env.NEXT_PUBLIC_WETH_ADDRESS,
    "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  ),
  mockUsdc: optionalAddress(process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS),
  swapGateway: optionalAddress(process.env.NEXT_PUBLIC_SWAP_GATEWAY_ADDRESS),
} as const;

export const dexConfigured = Boolean(
  dexContracts.factory !== zeroAddress
    && dexContracts.quoterV2 !== zeroAddress
    && dexContracts.weth !== zeroAddress
    && dexContracts.mockUsdc
    && dexContracts.swapGateway,
);

export const DEX_POOL_FEE = 3000;

export const erc20DexAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const mockUsdcAbi = [
  ...erc20DexAbi,
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "hasClaimed",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const wethAbi = [
  ...erc20DexAbi,
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

export const uniswapFactoryAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

export const uniswapPoolAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

export const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [{
      name: "params",
      type: "tuple",
      components: [
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "fee", type: "uint24" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const swapGatewayAbi = [
  {
    type: "function",
    name: "exactInputToYD",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;
