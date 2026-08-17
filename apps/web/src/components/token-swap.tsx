"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  formatUnits,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  DEX_POOL_FEE,
  dexConfigured,
  dexContracts,
  erc20DexAbi,
  mockUsdcAbi,
  quoterV2Abi,
  swapGatewayAbi,
  uniswapFactoryAbi,
  uniswapPoolAbi,
  wethAbi,
} from "../lib/dex";
import { appChainId, contracts, networkLabel } from "../lib/web3";

type InputAsset = "mUSDC" | "WETH";
type Action = "faucet" | "wrap" | "approve" | "swap";
type QuoteResult = readonly [bigint, bigint, number, bigint];
type Slot0Result = readonly [bigint, number, number, number, number, number, boolean];

const YD_DECIMALS = 18;

function parseAmount(value: string, decimals: number): bigint {
  if (!/^\d*(\.\d*)?$/.test(value) || !value || value === ".") return 0n;
  try {
    return parseUnits(value, decimals);
  } catch {
    return 0n;
  }
}

function parseSlippageBps(value: string): number | undefined {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0.1 || percent > 5) return undefined;
  return Math.round(percent * 100);
}

function parseDeadlineMinutes(value: string): number | undefined {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30) return undefined;
  return minutes;
}

function quoteAmount(result: unknown): bigint {
  if (Array.isArray(result) && typeof result[0] === "bigint") return result[0];
  if (result && typeof result === "object" && "amountOut" in result) {
    const amountOut = (result as { amountOut?: unknown }).amountOut;
    return typeof amountOut === "bigint" ? amountOut : 0n;
  }
  return 0n;
}

function calculatePriceImpactBps(
  tokenIn: Address,
  inputDecimals: number,
  amountIn: bigint,
  amountOut: bigint,
  sqrtPriceX96: bigint,
): number | undefined {
  if (amountIn === 0n || amountOut === 0n || sqrtPriceX96 === 0n) return undefined;
  const q192 = 1n << 192n;
  const scale = 10n ** 18n;
  const inputScale = 10n ** BigInt(inputDecimals);
  const outputScale = 10n ** BigInt(YD_DECIMALS);
  const square = sqrtPriceX96 * sqrtPriceX96;
  const tokenInIsToken0 = tokenIn.toLowerCase() < contracts.ydToken.toLowerCase();
  const spot = tokenInIsToken0
    ? square * inputScale * scale / (q192 * outputScale)
    : q192 * inputScale * scale / (square * outputScale);
  const execution = amountOut * inputScale * scale / (amountIn * outputScale);
  if (spot === 0n || execution >= spot) return 0;
  return Number((spot - execution) * 10_000n / spot);
}

function isUserRejected(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { name?: string; code?: number; cause?: unknown };
    if (candidate.name === "UserRejectedRequestError" || candidate.code === 4001) return true;
    current = candidate.cause;
  }
  return false;
}

function readableError(error: unknown): string {
  if (isUserRejected(error)) return "你已取消钱包签名，没有发送交易。";
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("AlreadyClaimed")) return "该钱包已经领取过 mUSDC。";
  if (message.includes("SwapDeadlineExpired")) return "报价已经过期，请刷新报价后重试。";
  if (message.includes("Too little received")) return "价格已超出滑点范围，交易已安全回滚。";
  if (message.includes("ERC20InsufficientBalance")) return "输入资产余额不足。";
  return "交易失败，请检查余额、测试网络和 RPC 后重试。";
}

export function TokenSwap() {
  const { address, chainId, isConnected } = useAccount();
  const correctNetwork = chainId === appChainId;
  const mockUsdcAddress = dexContracts.mockUsdc ?? zeroAddress;
  const gatewayAddress = dexContracts.swapGateway ?? zeroAddress;

  const [asset, setAsset] = useState<InputAsset>("mUSDC");
  const [amount, setAmount] = useState("10");
  const [slippage, setSlippage] = useState("0.5");
  const [deadlineMinutes, setDeadlineMinutes] = useState("10");
  const [quoteDeadline, setQuoteDeadline] = useState(() => Math.floor(Date.now() / 1000) + 600);
  const [action, setAction] = useState<Action>();
  const [hash, setHash] = useState<Hash>();
  const [message, setMessage] = useState<string>();

  const inputToken = asset === "mUSDC" ? mockUsdcAddress : dexContracts.weth;
  const inputDecimals = asset === "mUSDC" ? 6 : 18;
  const amountIn = parseAmount(amount, inputDecimals);
  const slippageBps = parseSlippageBps(slippage);
  const deadlineValue = parseDeadlineMinutes(deadlineMinutes);

  useEffect(() => {
    if (!deadlineValue) return;
    setQuoteDeadline(Math.floor(Date.now() / 1000) + deadlineValue * 60);
  }, [asset, amount, slippageBps, deadlineValue]);

  const inputBalance = useReadContract({
    abi: erc20DexAbi,
    address: inputToken,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: appChainId,
    query: { enabled: dexConfigured && Boolean(address && correctNetwork) },
  });
  const ydBalance = useReadContract({
    abi: erc20DexAbi,
    address: contracts.ydToken,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: appChainId,
    query: { enabled: Boolean(address && correctNetwork) },
  });
  const allowance = useReadContract({
    abi: erc20DexAbi,
    address: inputToken,
    functionName: "allowance",
    args: address ? [address, gatewayAddress] : undefined,
    chainId: appChainId,
    query: { enabled: dexConfigured && Boolean(address && correctNetwork) },
  });
  const claimed = useReadContract({
    abi: mockUsdcAbi,
    address: mockUsdcAddress,
    functionName: "hasClaimed",
    args: address ? [address] : undefined,
    chainId: appChainId,
    query: { enabled: dexConfigured && Boolean(address && correctNetwork) },
  });
  const pool = useReadContract({
    abi: uniswapFactoryAbi,
    address: dexContracts.factory,
    functionName: "getPool",
    args: [inputToken, contracts.ydToken, DEX_POOL_FEE],
    chainId: appChainId,
    query: { enabled: dexConfigured },
  });
  const poolAddress = typeof pool.data === "string" ? pool.data : zeroAddress;
  const slot0 = useReadContract({
    abi: uniswapPoolAbi,
    address: poolAddress,
    functionName: "slot0",
    chainId: appChainId,
    query: { enabled: poolAddress !== zeroAddress },
  });

  const quote = useSimulateContract({
    abi: quoterV2Abi,
    address: dexContracts.quoterV2,
    functionName: "quoteExactInputSingle",
    args: [{
      tokenIn: inputToken,
      tokenOut: contracts.ydToken,
      amountIn,
      fee: DEX_POOL_FEE,
      sqrtPriceLimitX96: 0n,
    }],
    account: address,
    chainId: appChainId,
    query: {
      enabled: dexConfigured
        && Boolean(address && correctNetwork && amountIn > 0n && poolAddress !== zeroAddress),
    },
  });
  const amountOut = quoteAmount(quote.data?.result);
  const minimumOut = slippageBps === undefined
    ? 0n
    : amountOut * BigInt(10_000 - slippageBps) / 10_000n;
  const balanceValue = typeof inputBalance.data === "bigint" ? inputBalance.data : 0n;
  const ydBalanceValue = typeof ydBalance.data === "bigint" ? ydBalance.data : 0n;
  const allowanceValue = typeof allowance.data === "bigint" ? allowance.data : 0n;
  const sqrtPrice = Array.isArray(slot0.data) ? (slot0.data as Slot0Result)[0] : 0n;
  const impactBps = calculatePriceImpactBps(
    inputToken,
    inputDecimals,
    amountIn,
    amountOut,
    sqrtPrice,
  );

  const faucetSimulation = useSimulateContract({
    abi: mockUsdcAbi,
    address: mockUsdcAddress,
    functionName: "faucet",
    account: address,
    chainId: appChainId,
    query: { enabled: dexConfigured && Boolean(address && correctNetwork && claimed.data === false) },
  });
  const wrapSimulation = useSimulateContract({
    abi: wethAbi,
    address: dexContracts.weth,
    functionName: "deposit",
    value: amountIn,
    account: address,
    chainId: appChainId,
    query: {
      enabled: dexConfigured && Boolean(
        address && correctNetwork && asset === "WETH" && amountIn > 0n,
      ),
    },
  });
  const approveSimulation = useSimulateContract({
    abi: erc20DexAbi,
    address: inputToken,
    functionName: "approve",
    args: [gatewayAddress, amountIn],
    account: address,
    chainId: appChainId,
    query: {
      enabled: dexConfigured && Boolean(
        address && correctNetwork && amountIn > 0n && balanceValue >= amountIn
          && allowanceValue < amountIn && amountOut > 0n,
      ),
    },
  });
  const swapSimulation = useSimulateContract({
    abi: swapGatewayAbi,
    address: gatewayAddress,
    functionName: "exactInputToYD",
    args: [inputToken, amountIn, minimumOut, BigInt(quoteDeadline)],
    account: address,
    chainId: appChainId,
    query: {
      enabled: dexConfigured && Boolean(
        address && correctNetwork && amountIn > 0n && minimumOut > 0n
          && balanceValue >= amountIn && allowanceValue >= amountIn && deadlineValue,
      ),
    },
  });

  const writer = useWriteContract();
  const receipt = useWaitForTransactionReceipt({
    hash,
    chainId: appChainId,
    query: { enabled: Boolean(hash) },
  });

  useEffect(() => {
    if (!receipt.isSuccess) return;
    if (receipt.data.status !== "success") {
      setMessage("交易已上链，但执行结果为失败。");
    } else {
      const successMessages: Record<Action, string> = {
        faucet: "mUSDC 测试资产已到账。",
        wrap: "ETH 已成功包装为 WETH。",
        approve: `已为本次兑换授权 ${amount} ${asset}。`,
        swap: "兑换已确认，YD 余额已经刷新。",
      };
      setMessage(action ? successMessages[action] : "交易已确认。");
      void Promise.all([
        inputBalance.refetch(),
        ydBalance.refetch(),
        allowance.refetch(),
        claimed.refetch(),
        pool.refetch(),
        slot0.refetch(),
      ]);
      if (action === "swap" && deadlineValue) {
        setQuoteDeadline(Math.floor(Date.now() / 1000) + deadlineValue * 60);
      }
    }
    setHash(undefined);
    setAction(undefined);
  }, [receipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!receipt.error) return;
    setMessage(readableError(receipt.error));
    setHash(undefined);
    setAction(undefined);
  }, [receipt.error]);

  const primaryState = useMemo(() => {
    if (!dexConfigured) return { label: "等待阶段 F 合约地址配置", disabled: true };
    if (!isConnected) return { label: "请先使用页头连接钱包", disabled: true };
    if (!correctNetwork) return { label: `请切换到 ${networkLabel}`, disabled: true };
    if (pool.isPending) return { label: "正在查找 Uniswap V3 池", disabled: true };
    if (poolAddress === zeroAddress) return { label: `${asset}/YD 池尚未创建`, disabled: true };
    if (!amountIn) return { label: "请输入有效数量", disabled: true };
    if (!slippageBps) return { label: "滑点范围应为 0.1%–5%", disabled: true };
    if (!deadlineValue) return { label: "截止时间应为 1–30 分钟", disabled: true };
    if (balanceValue < amountIn) return { label: `${asset} 余额不足`, disabled: true };
    if (quote.isPending) return { label: "正在获取链上报价", disabled: true };
    if (!amountOut || quote.error) return { label: "当前无法获得报价", disabled: true };
    if (writer.isPending) return { label: "请在钱包中确认", disabled: true };
    if (hash && receipt.isPending) return {
      label: action === "approve" ? "授权交易确认中" : "兑换交易确认中",
      disabled: true,
    };
    if (allowanceValue < amountIn) return {
      label: `授权本次 ${amount} ${asset}`,
      disabled: !approveSimulation.data,
    };
    return {
      label: `兑换为约 ${Number(formatUnits(amountOut, YD_DECIMALS)).toFixed(4)} YD`,
      disabled: !swapSimulation.data,
    };
  }, [action, allowanceValue, amount, amountIn, amountOut, approveSimulation.data, asset, balanceValue, correctNetwork, deadlineValue, hash, isConnected, pool.isPending, poolAddress, quote.error, quote.isPending, receipt.isPending, slippageBps, swapSimulation.data, writer.isPending]);

  async function write(nextAction: Action, request: unknown) {
    if (!request) return;
    setAction(nextAction);
    setMessage(undefined);
    try {
      const transactionHash = await writer.writeContractAsync(request as Parameters<typeof writer.writeContractAsync>[0]);
      setHash(transactionHash);
    } catch (error) {
      setMessage(readableError(error));
      setAction(undefined);
    }
  }

  async function submitPrimary() {
    if (allowanceValue < amountIn) {
      await write("approve", approveSimulation.data?.request);
    } else {
      await write("swap", swapSimulation.data?.request);
    }
  }

  return (
    <div className="swap-card">
      <div className="swap-card-title">
        <div><small>EXACT INPUT</small><h2>兑换 YD</h2></div>
        <span className="status-badge active">Sepolia · V3 0.3%</span>
      </div>

      {!dexConfigured && (
        <div className="swap-notice error">
          MockUSDC 与 Swap Gateway 尚未部署或未写入前端环境变量，代码可以预览但交易已禁用。
        </div>
      )}

      <div className="swap-field">
        <label htmlFor="swap-amount">支付</label>
        <div className="swap-input-row">
          <input
            id="swap-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="输入兑换数量"
          />
          <select value={asset} onChange={(event) => setAsset(event.target.value as InputAsset)}>
            <option value="mUSDC">mUSDC</option>
            <option value="WETH">WETH</option>
          </select>
        </div>
        <div className="swap-balance">
          <span>余额：{formatUnits(balanceValue, inputDecimals)} {asset}</span>
          {asset === "mUSDC" ? (
            <button
              type="button"
              disabled={!faucetSimulation.data || Boolean(hash) || claimed.data === true}
              onClick={() => write("faucet", faucetSimulation.data?.request)}
            >
              {claimed.data === true ? "已领取" : "领取 1,000 mUSDC"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!wrapSimulation.data || Boolean(hash)}
              onClick={() => write("wrap", wrapSimulation.data?.request)}
            >包装同等数量 ETH</button>
          )}
        </div>
      </div>

      <div className="swap-direction">↓</div>

      <div className="swap-field output">
        <label>预计收到</label>
        <div className="swap-output-row">
          <strong>{amountOut ? Number(formatUnits(amountOut, YD_DECIMALS)).toFixed(4) : "—"}</strong>
          <span className="token-mark">YD</span>
        </div>
        <div className="swap-balance"><span>YD 余额：{formatUnits(ydBalanceValue, YD_DECIMALS)} YD</span></div>
      </div>

      <div className="swap-settings">
        <label>最大滑点<input value={slippage} onChange={(event) => setSlippage(event.target.value)} inputMode="decimal"/><span>%</span></label>
        <label>截止时间<input value={deadlineMinutes} onChange={(event) => setDeadlineMinutes(event.target.value)} inputMode="numeric"/><span>分钟</span></label>
      </div>

      <dl className="swap-quote-details">
        <div><dt>最小到账</dt><dd>{minimumOut ? `${Number(formatUnits(minimumOut, YD_DECIMALS)).toFixed(4)} YD` : "—"}</dd></div>
        <div><dt>价格影响（含池费）</dt><dd className={impactBps !== undefined && impactBps > 300 ? "danger" : ""}>{impactBps === undefined ? "—" : `${(impactBps / 100).toFixed(2)}%`}</dd></div>
        <div><dt>池地址</dt><dd><code>{poolAddress === zeroAddress ? "尚未创建" : `${poolAddress.slice(0, 8)}…${poolAddress.slice(-6)}`}</code></dd></div>
      </dl>

      {impactBps !== undefined && impactBps > 500 && (
        <div className="swap-notice error">价格影响超过 5%，请减小兑换数量。</div>
      )}

      <button className="button primary block swap-submit" disabled={primaryState.disabled || (impactBps ?? 0) > 500} onClick={submitPrimary}>
        {primaryState.label}
      </button>
      {hash && <p className="transaction-hash">交易：<code>{hash.slice(0, 10)}…{hash.slice(-8)}</code></p>}
      {message && <p className={`swap-message ${message.includes("失败") || message.includes("不足") || message.includes("过期") ? "error" : ""}`}>{message}</p>}
      {quote.error && amountIn > 0n && poolAddress !== zeroAddress && <p className="swap-message error">QuoterV2 报价失败，池流动性可能尚未注入。</p>}
      {amountOut > 0n && <Link className="swap-buy-link" href="/courses/1">YD 到账后，去购买 4 YD 课程 →</Link>}
    </div>
  );
}
