"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { apiUrl, courseAccent, formatDuration, type IndexSyncStatus } from "../lib/course-data";
import { appChainId, networkLabel } from "../lib/web3";
import { Icon } from "./icons";

interface LearningCourse {
  courseId: string;
  title: string;
  watchedSeconds: number;
  durationSec: number;
  progress: number;
  evidence: { evidenceHash: string; issuedAt: string } | null;
  certificate: { tokenId: string; tokenUri: string } | null;
}

interface IndexedPurchase {
  id: string;
  courseId: string;
  title: string;
  priceYD: string;
  purchasedAt: string;
  transactionHash: `0x${string}`;
}

interface IndexedCertificate {
  tokenId: string;
  courseId: string;
  title: string;
  tokenUri: string;
  issuedAt: string;
  transactionHash: `0x${string}`;
}

interface LearningResponse {
  courses: LearningCourse[];
  purchases: IndexedPurchase[];
  certificates: IndexedCertificate[];
  source: "subgraph" | "rpc";
  degraded: boolean;
  index: IndexSyncStatus | null;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function transactionUrl(hash: string) {
  if (/^0x0+$/.test(hash)) return undefined;
  return appChainId === 11155111 ? `https://sepolia.etherscan.io/tx/${hash}` : undefined;
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getTime() === 0
    ? "RPC 当前状态"
    : date.toLocaleDateString("zh-CN");
}

export function LearningDashboard() {
  const { authenticated, getAccessToken } = usePrivy();
  const { address } = useAccount();
  const [data, setData] = useState<LearningResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authenticated || !address) {
      setData(null);
      return;
    }
    void getAccessToken().then(async (token) => {
      if (!token) throw new Error("missing_token");
      const response = await fetch(`${apiUrl}/learning`, {
        headers: { authorization: `Bearer ${token}`, "x-wallet-address": address },
      });
      if (!response.ok) throw new Error("learning_unavailable");
      setData(await response.json() as LearningResponse);
      setMessage("");
    }).catch(() => {
      setMessage("暂时无法读取学习或链上索引记录，请确认 API、Subgraph 和 RPC 已就绪。");
    });
  }, [authenticated, address, getAccessToken]);

  if (!authenticated) return <div className="data-state">登录后显示真实购买、学习进度与链上证书。</div>;
  if (!address) return <div className="data-state">连接购买课程时使用的钱包后显示学习记录。</div>;

  const courses = data?.courses ?? [];
  const purchases = data?.purchases ?? [];
  const indexedCertificates = data?.certificates ?? [];
  const legacyCertificates = courses.flatMap((course) => course.certificate ? [{
    tokenId: course.certificate.tokenId,
    courseId: course.courseId,
    title: course.title,
    tokenUri: course.certificate.tokenUri,
    issuedAt: "",
    transactionHash: "" as `0x${string}`,
  }] : []);
  const certificates = indexedCertificates.length > 0 ? indexedCertificates : legacyCertificates;
  const watched = courses.reduce((total, course) => total + course.watchedSeconds, 0);

  return (
    <div className="profile-layout">
      <div className="profile-main">
        {message ? <p className="profile-auth-message">{message}</p> : null}
        {data?.degraded ? (
          <div className="source-notice">Subgraph 暂不可用，购买与证书记录当前由 Sepolia RPC 日志降级提供。</div>
        ) : data?.index && !data.index.caughtUp ? (
          <div className="source-notice partial-notice">交易已确认，Subgraph 仍在索引，落后 {data.index.lagBlocks ?? "未知"} 个区块。</div>
        ) : data?.index?.hasIndexingErrors ? (
          <div className="source-notice error-state">Subgraph 报告索引错误，已保留链上交易作为最终事实。</div>
        ) : data ? (
          <div className="source-notice index-ready">Subgraph 已同步至链头附近 · 区块 {data.index?.indexedBlock ?? "—"}</div>
        ) : null}

        <section className="purchase-history-section">
          <div className="block-title"><div><div className="eyebrow">ON-CHAIN PURCHASES</div><h2>购买记录</h2></div><span>{purchases.length} 笔链上购买</span></div>
          {purchases.length === 0 ? <div className="data-state">尚未索引到该钱包的课程购买记录。</div> : (
            <div className="profile-purchase-list">
              {purchases.map((purchase) => {
                const explorer = transactionUrl(purchase.transactionHash);
                return <article key={purchase.id}>
                  <div><span className="tag subtle">课程 #{purchase.courseId}</span><h3>{purchase.title}</h3><small>{displayDate(purchase.purchasedAt)}</small></div>
                  <div><strong>{formatUnits(BigInt(purchase.priceYD), 18)} YD</strong>{explorer ? <a href={explorer} target="_blank" rel="noreferrer">{shortHash(purchase.transactionHash)} ↗</a> : <code>等待 Subgraph 交易哈希</code>}</div>
                </article>;
              })}
            </div>
          )}
        </section>

        <section>
          <div className="block-title"><div><div className="eyebrow">MY LEARNING</div><h2>继续学习</h2></div><span>{courses.length} 门有记录</span></div>
          <div className="learning-list">{courses.length === 0 ? <div className="data-state">还没有学习记录。购买课程后，在课程详情页开始学习。</div> : courses.map((course) => <article key={course.courseId}><div className={`learning-cover ${courseAccent(course.courseId)}`}>COURSE #{course.courseId}</div><div className="learning-info"><span className="tag subtle">{course.evidence ? "Evidence 已生成" : "学习中"}</span><h3>{course.title}</h3><div className="progress-label"><span>{formatDuration(course.watchedSeconds)} / {formatDuration(course.durationSec)}</span><b>{course.progress}%</b></div><div className="progress-track"><span style={{ width: `${course.progress}%` }}/></div><Link className="text-link" href={`/courses/${course.courseId}`}>继续学习 <Icon name="arrow"/></Link></div></article>)}</div>
        </section>

        <section className="certificate-section">
          <div className="block-title"><div><div className="eyebrow">ACHIEVEMENTS</div><h2>链上证书</h2></div><span>{certificates.length} 枚证书</span></div>
          {certificates.length === 0 ? <div className="data-state certificate-empty">完成一门课程并通过 Oracle 后，证书会显示在这里。</div> : <div className="certificate-list">{certificates.map((certificate) => <div className="owned-cert" key={`${certificate.courseId}-${certificate.tokenId}`}><div className="cert-art"><div className="cert-seal"><Icon name="award"/></div><span>W3 UNIVERSITY</span><strong>{certificate.title}</strong><small>SOULBOUND · #{certificate.tokenId}</small></div><div className="cert-copy"><span className="status-badge active">已验证</span><h3>{certificate.title}</h3><p>由 CompletionOracle 使用唯一 evidence 验证并铸造。</p><dl><div><dt>Token ID</dt><dd>#{certificate.tokenId}</dd></div><div><dt>课程 ID</dt><dd>#{certificate.courseId}</dd></div><div><dt>网络</dt><dd>{networkLabel}</dd></div></dl><a className="button ghost" href={certificate.tokenUri} target="_blank" rel="noreferrer">查看 Metadata <Icon name="arrow"/></a></div></div>)}</div>}
        </section>
      </div>

      <aside className="profile-side">
        <div className="side-card"><div className="eyebrow">YOUR STATS</div><h3>学习概览</h3><div className="side-stat"><span><Icon name="wallet"/></span><b>{purchases.length}<small>链上购买记录</small></b></div><div className="side-stat"><span><Icon name="book"/></span><b>{courses.length}<small>有学习记录的课程</small></b></div><div className="side-stat"><span><Icon name="clock"/></span><b>{formatDuration(watched)}<small>累计有效学习</small></b></div><div className="side-stat"><span><Icon name="award"/></span><b>{certificates.length}<small>链上证书</small></b></div></div>
        <div className="side-card safety-card"><Icon name="shield"/><h3>数据从哪里来？</h3><p>购买与证书由 The Graph 索引 Sepolia 事件；学习进度来自数据库。索引延迟时自动使用 RPC 日志，不覆盖已确认 receipt。</p></div>
      </aside>
    </div>
  );
}
