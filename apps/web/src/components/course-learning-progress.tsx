"use client";

import { completionOracleAbi } from "@web3-university/shared";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseEventLogs } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { apiUrl, formatDuration, type PublicLesson } from "../lib/course-data";
import { appChainId, contracts, isLocalChain, networkLabel } from "../lib/web3";

interface ProgressLesson {
  lessonId: string;
  title: string;
  durationSec: number;
  watchedSeconds: number;
  completed: boolean;
  updatedAt: string | null;
}

interface ProgressResponse {
  progress: {
    courseId: string;
    watchedSeconds: number;
    durationSec: number;
    progress: number;
    lessons: ProgressLesson[];
    evidence: { evidenceHash: string; tokenUri: string } | null;
  };
  certificate?: { tokenId: string; tokenUri: string } | null;
  signedOracleAvailable?: boolean;
}

interface FallbackAttestationResponse {
  requestId: string;
  evidenceHash: `0x${string}`;
  tokenUri: string;
  deadline: string;
  signature: `0x${string}`;
  error?: { code?: string };
}

interface OracleRequestState {
  requestId: bigint;
  status: number;
}

const oracleStatusLabels = ["未知", "等待 Oracle 验证", "Oracle 已履约", "Oracle 验证未通过", "Oracle 请求已超时"];

const maxSessionSeconds = 60;

function progressError(code?: string) {
  const messages: Record<string, string> = {
    course_not_purchased: "只有链上已购买用户才能记录学习进度。",
    progress_jump_too_large: "提交的观看时长超过服务端时间窗口，请继续真实学习后再保存。",
    progress_regression: "观看进度不能倒退。",
    wallet_not_linked: "当前交易钱包未绑定到 Privy 用户。",
    evidence_not_found: "尚未生成完课 evidence。",
    local_fulfillment_disabled: "本地 Oracle 未启用，请确认 API 的 CHAIN_ID=31337 并重启 API。",
    local_oracle_unavailable: "本地 Oracle 暂不可用，请检查 API、Anvil 与 Oracle 账户配置。",
    oracle_request_mismatch: "链上证书请求与当前钱包或课程不匹配。",
    oracle_request_already_fulfilled: "该证书请求已经处理，请刷新页面读取证书状态。",
    request_reverted: "证书申请交易执行失败。",
    request_event_missing: "交易已确认，但没有解析到证书请求事件。",
    signed_oracle_unavailable: "AWS 签名 Oracle 暂不可用，CRE 请求仍会保持等待状态。",
    invalid_fallback_attestation: "AWS 签名请求参数无效。",
    oracle_request_not_pending: "该证书请求已不处于待处理状态，请刷新页面。",
    certificate_already_issued: "证书已经颁发，请刷新页面。",
    invalid_evidence_hash: "完课 evidence 格式无效，请联系管理员。",
  };
  return messages[code ?? ""] ?? "学习进度操作失败，请检查 API 与本地链。";
}

export function CourseLearningProgress({ courseId, lessons, refreshKey = 0 }: { courseId: string; lessons: PublicLesson[]; refreshKey?: number }) {
  const { authenticated, getAccessToken, login } = usePrivy();
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: appChainId });
  const writer = useWriteContract();
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [activeLesson, setActiveLesson] = useState<string>();
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [pending, setPending] = useState(false);
  const [pendingLessonId, setPendingLessonId] = useState<string>();
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [oracleRequest, setOracleRequest] = useState<OracleRequestState>();
  const activeRef = useRef<string | undefined>(undefined);
  const { linkWallet } = useLinkAccount({
    onSuccess: () => {
      setErrorCode("");
      setMessage("钱包已绑定，正在重新验证购买资格…");
      void load().catch((error) => {
        const code = error instanceof Error ? error.message : "";
        setErrorCode(code);
        setMessage(progressError(code));
      });
    },
    onError: () => {
      setMessage("钱包绑定未完成，请在 Privy 弹窗中选择当前交易钱包并签名。");
    },
  });

  async function authorizedFetch(path: string, init: RequestInit = {}) {
    const token = await getAccessToken();
    if (!token || !address) throw new Error("access_token_required");
    return fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-wallet-address": address, ...init.headers },
    });
  }

  async function load() {
    if (!authenticated || !address) return;
    const response = await authorizedFetch(`/courses/${courseId}/progress`);
    const result = await response.json() as ProgressResponse & { error?: { code?: string } };
    if (!response.ok) throw new Error(result.error?.code);
    setData(result);
    setErrorCode("");
    setMessage("");
  }

  useEffect(() => { void load().catch((error) => {
    const code = error instanceof Error ? error.message : "";
    setErrorCode(code);
    setMessage(progressError(code));
  }); }, [authenticated, address, courseId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isLocalChain || !publicClient || !address || data?.certificate) return;
    let cancelled = false;

    async function refreshOracleRequest() {
      const requestId = await publicClient!.readContract({
        address: contracts.completionOracle,
        abi: completionOracleAbi,
        functionName: "activeRequestId",
        args: [address!, BigInt(courseId)],
      }) as bigint;
      const trackedId = requestId !== 0n ? requestId : oracleRequest?.requestId;
      if (!trackedId) return;
      const status = Number(await publicClient!.readContract({
        address: contracts.completionOracle,
        abi: completionOracleAbi,
        functionName: "requestStatuses",
        args: [trackedId],
      }));
      if (cancelled) return;
      setOracleRequest({ requestId: trackedId, status });
      if (status === 2) {
        await load();
        if (!cancelled) setMessage(`Oracle 已完成请求 #${trackedId.toString()}，证书已刷新。`);
      } else if (status === 3 || status === 4) {
        setMessage(`${oracleStatusLabels[status]}，可以重新提交证书请求。`);
      }
    }

    void refreshOracleRequest().catch(() => undefined);
    const timer = window.setInterval(() => void refreshOracleRequest().catch(() => undefined), 5_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [address, courseId, data?.certificate, oracleRequest?.requestId, publicClient]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    activeRef.current = activeLesson;
    if (!activeLesson) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && activeRef.current) {
        setSessionSeconds((seconds) => Math.min(seconds + 1, maxSessionSeconds));
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [activeLesson]);

  const progressByLesson = useMemo(() => new Map(data?.progress.lessons.map((lesson) => [lesson.lessonId, lesson]) ?? []), [data]);

  async function startLesson(lesson: PublicLesson) {
    const current = progressByLesson.get(lesson.id)?.watchedSeconds ?? 0;
    setPending(true); setPendingLessonId(lesson.id); setMessage("");
    try {
      const response = await authorizedFetch(`/courses/${courseId}/lessons/${lesson.id}/progress`, {
        method: "PATCH", body: JSON.stringify({ wallet: address, watchedSeconds: current }),
      });
      const result = await response.json() as ProgressResponse & { error?: { code?: string } };
      if (!response.ok) throw new Error(result.error?.code);
      setData((previous) => ({
        progress: result.progress,
        certificate: previous?.certificate ?? null,
        signedOracleAvailable: previous?.signedOracleAvailable,
      }));
      setActiveLesson(lesson.id); setSessionSeconds(0);
    } catch (error) { setMessage(progressError(error instanceof Error ? error.message : undefined)); }
    finally { setPending(false); setPendingLessonId(undefined); }
  }

  async function saveLesson(lesson: PublicLesson) {
    const current = progressByLesson.get(lesson.id)?.watchedSeconds ?? 0;
    setPending(true); setMessage("");
    try {
      const response = await authorizedFetch(`/courses/${courseId}/lessons/${lesson.id}/progress`, {
        method: "PATCH", body: JSON.stringify({ wallet: address, watchedSeconds: Math.min(lesson.durationSec, current + sessionSeconds) }),
      });
      const result = await response.json() as ProgressResponse & { error?: { code?: string } };
      if (!response.ok) throw new Error(result.error?.code);
      setData((previous) => ({
        progress: result.progress,
        certificate: previous?.certificate ?? null,
        signedOracleAvailable: previous?.signedOracleAvailable,
      }));
      setMessage("本次真实学习时长已保存。"); setActiveLesson(undefined); setSessionSeconds(0);
    } catch (error) { setMessage(progressError(error instanceof Error ? error.message : undefined)); }
    finally { setPending(false); }
  }

  async function requestCertificate() {
    if (!address || !publicClient || !data?.progress.evidence) return;
    setPending(true); setMessage("");
    try {
      await publicClient.simulateContract({
        account: address, address: contracts.completionOracle, abi: completionOracleAbi,
        functionName: "requestCompletion", args: [BigInt(courseId)],
      });
      const hash = await writer.writeContractAsync({
        address: contracts.completionOracle, abi: completionOracleAbi,
        functionName: "requestCompletion", args: [BigInt(courseId)], chainId: appChainId,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("request_reverted");
      const events = parseEventLogs({ abi: completionOracleAbi, logs: receipt.logs, eventName: "CompletionRequested" });
      const requestId = (events[0] as unknown as { args?: { requestId?: bigint } } | undefined)?.args?.requestId;
      if (typeof requestId !== "bigint") throw new Error("request_event_missing");
      if (isLocalChain) {
        const response = await authorizedFetch("/oracle/local/fulfill", {
          method: "POST", body: JSON.stringify({ wallet: address, courseId, requestId: requestId.toString() }),
        });
        const result = await response.json() as { certificate?: { tokenId: string; tokenUri: string }; error?: { code?: string } };
        if (!response.ok || !result.certificate) throw new Error(result.error?.code);
        setData((previous) => previous && { ...previous, certificate: result.certificate! });
        setMessage(`证书 #${result.certificate.tokenId} 已由本地 Oracle 铸造。`);
      } else {
        setOracleRequest({ requestId, status: 1 });
        if (data.signedOracleAvailable) {
          setMessage(`证书请求 #${requestId.toString()} 已提交；可以等待 Chainlink CRE，或使用 AWS 签名 fallback。`);
        } else {
          setMessage(`证书请求 #${requestId.toString()} 已提交，等待 Chainlink CRE 验证。`);
        }
      }
    } catch (error) { setMessage(progressError(error instanceof Error ? error.message : undefined)); }
    finally { setPending(false); }
  }

  async function submitSignedFallback(requestId: bigint) {
    if (!address || !publicClient) return;
    const response = await authorizedFetch("/oracle/fallback/attestation", {
      method: "POST",
      body: JSON.stringify({ wallet: address, courseId, requestId: requestId.toString() }),
    });
    const attestation = await response.json() as FallbackAttestationResponse;
    if (!response.ok) throw new Error(attestation.error?.code);

    const args = [
      requestId,
      attestation.evidenceHash,
      attestation.tokenUri,
      BigInt(attestation.deadline),
      attestation.signature,
    ] as const;
    await publicClient.simulateContract({
      account: address,
      address: contracts.completionOracle,
      abi: completionOracleAbi,
      functionName: "fulfillWithSignature",
      args,
    });
    const hash = await writer.writeContractAsync({
      address: contracts.completionOracle,
      abi: completionOracleAbi,
      functionName: "fulfillWithSignature",
      args,
      chainId: appChainId,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("request_reverted");
    setOracleRequest({ requestId, status: 2 });
    await load();
    setMessage(`AWS 签名 Oracle 已完成请求 #${requestId.toString()}，证书已刷新。`);
  }

  async function retrySignedFallback() {
    if (!oracleRequest) return;
    setPending(true); setMessage("");
    try {
      await submitSignedFallback(oracleRequest.requestId);
    } catch (error) {
      setMessage(progressError(error instanceof Error ? error.message : undefined));
    } finally {
      setPending(false);
    }
  }

  if (!authenticated) return <section className="content-block learning-progress-block"><h2>学习进度</h2><p>登录后才能验证购买资格并记录真实学习时长。</p><button className="button" onClick={login}>使用 Privy 登录</button></section>;
  if (!isConnected || !address) return <section className="content-block learning-progress-block"><h2>学习进度</h2><p>请先连接购买课程时使用的钱包。</p></section>;
  if (chainId !== appChainId) return <section className="content-block learning-progress-block"><h2>学习进度</h2><p>请切换到 {networkLabel}。</p></section>;

  return <section className="content-block learning-progress-block"><div className="block-title"><h2>学习进度</h2><span>{data ? `${data.progress.progress}%` : "验证购买资格中"}</span></div>{data ? <><div className="progress-track large-progress"><span style={{ width: `${data.progress.progress}%` }}/></div><div className="progress-lesson-list">{lessons.map((lesson) => { const saved = progressByLesson.get(lesson.id); const active = activeLesson === lesson.id; return <div className="progress-lesson" key={lesson.id}><div><b>{lesson.title}</b><small>{formatDuration(saved?.watchedSeconds ?? 0)} / {formatDuration(lesson.durationSec)}</small></div>{active ? <button className="button" disabled={pending || sessionSeconds === 0} onClick={() => void saveLesson(lesson)}>暂停并保存 · {sessionSeconds}s{sessionSeconds === maxSessionSeconds ? "（请保存）" : ""}</button> : <button className="button ghost" disabled={pending || Boolean(activeLesson) || saved?.completed} onClick={() => void startLesson(lesson)}>{saved?.completed ? "已完成" : pendingLessonId === lesson.id ? "验证中" : "开始学习"}</button>}</div>; })}</div>{data.progress.evidence ? <div className="evidence-card"><div><b>完课 Evidence 已生成</b><code>{data.progress.evidence.evidenceHash.slice(0, 18)}…</code>{oracleRequest ? <small>{oracleStatusLabels[oracleRequest.status] ?? "Oracle 状态未知"} · #{oracleRequest.requestId.toString()}</small> : null}</div>{data.certificate ? <span className="status-badge active">证书 #{data.certificate.tokenId}</span> : oracleRequest?.status === 1 && data.signedOracleAvailable ? <button className="button primary" disabled={pending} onClick={() => void retrySignedFallback()}>{pending ? "链上处理中" : "使用 AWS 签名完成"}</button> : <button className="button primary" disabled={pending || oracleRequest?.status === 1} onClick={() => void requestCertificate()}>{pending ? "链上处理中" : oracleRequest?.status === 1 ? "等待 CRE 验证" : isLocalChain ? "申请本地证书" : data.signedOracleAvailable ? "申请证书（AWS fallback）" : "提交证书请求"}</button>}</div> : null}</> : null}{message ? <p className="profile-auth-message">{message}</p> : null}{errorCode === "wallet_not_linked" ? <div className="wallet-link-actions"><button className="button primary" onClick={() => linkWallet({ walletChainType: "ethereum-only" })}>绑定当前交易钱包</button><button className="button ghost" onClick={() => void load().catch((error) => { const code = error instanceof Error ? error.message : ""; setErrorCode(code); setMessage(progressError(code)); })}>重新验证</button></div> : null}{errorCode === "course_not_purchased" ? <div className="wallet-link-actions"><button className="button primary" onClick={() => void load().catch((error) => { const code = error instanceof Error ? error.message : ""; setErrorCode(code); setMessage(progressError(code)); })}>重新验证购买资格</button></div> : null}</section>;
}
