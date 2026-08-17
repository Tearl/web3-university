"use client";

import { courseMarketAbi, ydTokenAbi } from "@web3-university/shared";
import { formatUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { appChainId, contracts, networkLabel } from "../lib/web3";

const statusLabels = ["待审核", "Active", "已拒绝", "已下架"] as const;
type CourseTuple = readonly [bigint, `0x${string}`, bigint, string, number];

export function CourseChainState({ courseId }: { courseId: bigint }) {
  const { address, chainId, isConnected } = useAccount();
  const correctNetwork = chainId === appChainId;
  const course = useReadContract({ abi: courseMarketAbi, address: contracts.courseMarket, functionName: "courses", args: [courseId], chainId: appChainId });
  const balance = useReadContract({ abi: ydTokenAbi, address: contracts.ydToken, functionName: "balanceOf", args: address ? [address] : undefined, chainId: appChainId, query: { enabled: Boolean(address && correctNetwork) } });
  const purchased = useReadContract({ abi: courseMarketAbi, address: contracts.courseMarket, functionName: "hasPurchased", args: address ? [address, courseId] : undefined, chainId: appChainId, query: { enabled: Boolean(address && correctNetwork) } });

  const courseData = course.data as CourseTuple | undefined;
  const exists = courseData ? courseData[0] !== 0n : false;
  const status = courseData ? statusLabels[courseData[4]] ?? `未知 (${courseData[4]})` : "读取中";
  const balanceValue = typeof balance.data === "bigint" ? `${formatUnits(balance.data, 18)} YD` : "—";

  return (
    <aside className="chain-info">
      <div className="eyebrow">ON-CHAIN INFO</div>
      <h3>链上课程信息</h3>
      <dl>
        <div><dt>网络</dt><dd><span className="network-dot" />{networkLabel}</dd></div>
        <div><dt>课程 ID</dt><dd>#{courseId.toString()}</dd></div>
        <div><dt>支付代币</dt><dd>YD Token</dd></div>
        <div><dt>课程状态</dt><dd className={exists && courseData?.[4] === 1 ? "active-text" : undefined}>{course.isPending ? "读取中" : exists ? `● ${status}` : "未部署 / 课程不存在"}</dd></div>
        <div><dt>连接钱包</dt><dd>{isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "未连接"}</dd></div>
        <div><dt>YD 余额</dt><dd>{!isConnected ? "连接后查询" : correctNetwork ? balanceValue : "需切换网络"}</dd></div>
        <div><dt>购买资格</dt><dd>{!isConnected ? "连接后查询" : !correctNetwork ? "需切换网络" : purchased.isPending ? "查询中" : purchased.data === true ? "已购买" : "未购买"}</dd></div>
      </dl>
      {course.error ? <p className="chain-error">无法读取配置的链，请检查 RPC、chainId 和部署地址。</p> : <p>课程状态、YD 余额和购买资格均直接来自合约，数据库不能覆盖。</p>}
    </aside>
  );
}
