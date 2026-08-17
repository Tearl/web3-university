"use client";

import { courseMarketAbi, ydTokenAbi } from "@web3-university/shared";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, type Hash } from "viem";
import {
  useAccount,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { appChainId, contracts, networkLabel } from "../lib/web3";

type CourseTuple = readonly [bigint, `0x${string}`, bigint, string, number];
type Action = "approve" | "buy";

function isUserRejected(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { name?: string; code?: number; cause?: unknown };
    if (candidate.name === "UserRejectedRequestError" || candidate.code === 4001) return true;
    current = candidate.cause;
  }
  return false;
}

function readableError(error: unknown, action: Action): string {
  if (isUserRejected(error)) return "你已取消钱包签名，没有发送交易。";
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("CourseAlreadyPurchased")) return "该地址已购买这门课程。";
  if (message.includes("CourseNotActive")) return "课程当前不可购买。";
  if (message.includes("ERC20InsufficientBalance")) return "YD 余额不足。";
  if (message.includes("ERC20InsufficientAllowance")) return "YD 授权额度不足。";
  return `${action === "approve" ? "授权" : "购买"}失败，请检查钱包和 RPC。`;
}

export function CoursePurchase({ courseId, onPurchased }: { courseId: bigint; onPurchased?: () => void }) {
  const { address, chainId, isConnected } = useAccount();
  const correctNetwork = chainId === appChainId;
  const [action, setAction] = useState<Action>();
  const [hash, setHash] = useState<Hash>();
  const [message, setMessage] = useState<string>();

  const course = useReadContract({ abi: courseMarketAbi, address: contracts.courseMarket, functionName: "courses", args: [courseId], chainId: appChainId });
  const courseData = course.data as CourseTuple | undefined;
  const price = courseData?.[2] ?? 0n;
  const active = courseData?.[0] !== 0n && courseData?.[4] === 1;

  const balance = useReadContract({ abi: ydTokenAbi, address: contracts.ydToken, functionName: "balanceOf", args: address ? [address] : undefined, chainId: appChainId, query: { enabled: Boolean(address && correctNetwork) } });
  const allowance = useReadContract({ abi: ydTokenAbi, address: contracts.ydToken, functionName: "allowance", args: address ? [address, contracts.courseMarket] : undefined, chainId: appChainId, query: { enabled: Boolean(address && correctNetwork) } });
  const purchased = useReadContract({ abi: courseMarketAbi, address: contracts.courseMarket, functionName: "hasPurchased", args: address ? [address, courseId] : undefined, chainId: appChainId, query: { enabled: Boolean(address && correctNetwork) } });

  const balanceValue = typeof balance.data === "bigint" ? balance.data : 0n;
  const allowanceValue = typeof allowance.data === "bigint" ? allowance.data : 0n;
  const hasPurchased = purchased.data === true;
  const canPrepare = Boolean(address && correctNetwork && active && price > 0n && balanceValue >= price && !hasPurchased);

  const approveSimulation = useSimulateContract({
    abi: ydTokenAbi,
    address: contracts.ydToken,
    functionName: "approve",
    args: [contracts.courseMarket, price],
    account: address,
    chainId: appChainId,
    query: { enabled: canPrepare && allowanceValue < price },
  });
  const buySimulation = useSimulateContract({
    abi: courseMarketAbi,
    address: contracts.courseMarket,
    functionName: "buy",
    args: [courseId],
    account: address,
    chainId: appChainId,
    query: { enabled: canPrepare && allowanceValue >= price },
  });
  const writer = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash, chainId: appChainId, query: { enabled: Boolean(hash) } });

  useEffect(() => {
    if (!receipt.isSuccess) return;
    if (receipt.data.status !== "success") {
      setMessage("交易已上链，但执行结果为失败。");
      setHash(undefined);
      setAction(undefined);
      return;
    }
    setMessage(action === "approve" ? "YD 授权已确认，现在可以购买。" : "购买交易已确认，课程资格已上链。");
    void Promise.all([balance.refetch(), allowance.refetch(), purchased.refetch(), course.refetch()]);
    if (action === "buy") onPurchased?.();
    setHash(undefined);
    setAction(undefined);
  }, [receipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!receipt.error) return;
    setMessage(readableError(receipt.error, action ?? "buy"));
    setHash(undefined);
    setAction(undefined);
  }, [receipt.error, action]);

  const state = useMemo(() => {
    if (!isConnected) return { label: "请先使用页头连接钱包", disabled: true };
    if (!correctNetwork) return { label: `请切换到 ${networkLabel}`, disabled: true };
    if (course.isPending || balance.isPending || allowance.isPending || purchased.isPending) return { label: "正在读取链上状态", disabled: true };
    if (!active) return { label: "课程当前不可购买", disabled: true };
    if (hasPurchased) return { label: "已购买 · 可开始学习", disabled: true };
    if (balanceValue < price) return { label: `YD 余额不足（需 ${formatUnits(price, 18)} YD）`, disabled: true };
    if (writer.isPending) return { label: "请在钱包中确认", disabled: true };
    if (hash && receipt.isPending) return { label: action === "approve" ? "YD 授权确认中" : "购买交易确认中", disabled: true };
    if (allowanceValue < price) return { label: `授权 ${formatUnits(price, 18)} YD`, disabled: !approveSimulation.data };
    return { label: `购买课程 · ${formatUnits(price, 18)} YD`, disabled: !buySimulation.data };
  }, [action, active, allowanceValue, approveSimulation.data, balance.isPending, balanceValue, buySimulation.data, correctNetwork, course.isPending, hasPurchased, hash, isConnected, allowance.isPending, price, purchased.isPending, receipt.isPending, writer.isPending]);

  async function submit() {
    const nextAction: Action = allowanceValue < price ? "approve" : "buy";
    const simulation = nextAction === "approve" ? approveSimulation.data : buySimulation.data;
    if (!simulation) return;
    setAction(nextAction);
    setMessage(undefined);
    try {
      const transactionHash = await writer.writeContractAsync(simulation.request);
      setHash(transactionHash);
    } catch (error) {
      setMessage(readableError(error, nextAction));
      setAction(undefined);
    }
  }

  return (
    <div className="purchase-action">
      <small>链上课程价格</small>
      <div className="purchase-price">{price > 0n ? `${formatUnits(price, 18)} YD` : "—"}<span>≈ 测试链资产</span></div>
      <button className="button primary block" disabled={state.disabled} onClick={submit}>{state.label}</button>
      {hash && <p className="transaction-hash">交易：<code>{hash.slice(0, 10)}…{hash.slice(-8)}</code></p>}
      {message && <p className={message.includes("失败") || message.includes("不足") ? "purchase-message error" : "purchase-message"}>{message}</p>}
      {(approveSimulation.error || buySimulation.error) && canPrepare && <p className="purchase-message error">交易模拟未通过，请刷新链上状态后重试。</p>}
    </div>
  );
}
