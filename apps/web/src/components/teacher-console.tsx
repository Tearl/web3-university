"use client";

import { courseMarketAbi } from "@web3-university/shared";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, createWalletClient, custom, formatUnits, http, keccak256, parseUnits, toBytes, type Hash } from "viem";
import { appChain, appChainId, contracts } from "../lib/web3";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const teacherRole = keccak256(toBytes("TEACHER_ROLE"));
const reviewerRole = keccak256(toBytes("REVIEWER_ROLE"));
const publicClient = createPublicClient({ chain: appChain, transport: http(appChain.rpcUrls.default.http[0]) });

interface Draft {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  metadataUri: string;
  priceYD: string;
  status: "DRAFT" | "SUBMITTED";
  courseId: string | null;
  transactionHash: string | null;
}

interface ChainCourse {
  id: bigint;
  teacher: `0x${string}`;
  priceYD: bigint;
  metadataUri: string;
  status: number;
}

const statusLabels = ["审核中", "已上架", "已拒绝", "已下架"];
const statusTones = ["pending", "active", "rejected", "offline"];

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("User rejected") || message.includes("4001")) return "你取消了钱包交易。";
  if (message.includes("AccessControlUnauthorizedAccount")) return "当前钱包没有执行此操作的链上角色。";
  if (message.includes("teacher_role_required")) return "当前钱包尚未获得教师角色，请先由管理员授权。";
  if (message.includes("chain_unavailable")) return "无法读取链上角色，请确认 RPC、chainId 与合约地址。";
  if (message.includes("course_submission_mismatch")) return "链上交易与草稿内容不一致，未绑定课程 ID。";
  if (message.includes("course_submission_not_confirmed")) return "未找到成功的课程提交事件。";
  return "操作失败，请确认 RPC、钱包网络、API 和数据库均已就绪。";
}

export function TeacherConsole() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets.find((candidate) => candidate.walletClientType === "privy");
  const address = wallet?.address as `0x${string}` | undefined;
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [courses, setCourses] = useState<ChainCourse[]>([]);
  const [roles, setRoles] = useState({ teacher: false, reviewer: false });
  const [pending, setPending] = useState<string>();
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    title: "", description: "", coverUrl: "https://images.unsplash.com/photo-1639322537228-f710d846310a",
    priceYD: "4", lessonTitle: "第一课", videoKey: "courses/new/lesson-1.mp4", durationSec: "600",
  });

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getAccessToken();
    if (!token) throw new Error("access_token_required");
    return fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(address ? { "x-wallet-address": address } : {}), ...init.headers },
    });
  }, [address, getAccessToken]);

  const load = useCallback(async () => {
    if (!address || !authenticated) return;
    const [teacher, reviewer, nextId, draftResponse] = await Promise.all([
      publicClient.readContract({ abi: courseMarketAbi, address: contracts.courseMarket, functionName: "hasRole", args: [teacherRole, address] }),
      publicClient.readContract({ abi: courseMarketAbi, address: contracts.courseMarket, functionName: "hasRole", args: [reviewerRole, address] }),
      publicClient.readContract({ abi: courseMarketAbi, address: contracts.courseMarket, functionName: "nextCourseId" }),
      authorizedFetch("/teacher/drafts"),
    ]);
    setRoles({ teacher: teacher === true, reviewer: reviewer === true });
    const draftData = await draftResponse.json() as { drafts?: Draft[]; error?: { code?: string } };
    if (!draftResponse.ok) throw new Error(draftData.error?.code);
    setDrafts(draftData.drafts ?? []);
    const ids = Array.from({ length: Math.max(0, Number(nextId as bigint) - 1) }, (_, index) => BigInt(index + 1));
    const chainCourses = await Promise.all(ids.map(async (id) => {
      const value = await publicClient.readContract({ abi: courseMarketAbi, address: contracts.courseMarket, functionName: "courses", args: [id] }) as readonly [bigint, `0x${string}`, bigint, string, number];
      return { id: value[0], teacher: value[1], priceYD: value[2], metadataUri: value[3], status: value[4] };
    }));
    setCourses(chainCourses.reverse());
  }, [address, authenticated, authorizedFetch]);

  useEffect(() => { void load().catch((error) => setMessage(friendlyError(error))); }, [load]);

  async function walletClient() {
    if (!wallet || !address) throw new Error("wallet_not_found");
    await wallet.switchChain(appChainId);
    return createWalletClient({ account: address, chain: appChain, transport: custom(await wallet.getEthereumProvider()) });
  }

  async function createDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!address) return;
    setPending("draft"); setMessage("");
    try {
      const response = await authorizedFetch("/teacher/drafts", {
        method: "POST",
        body: JSON.stringify({
          wallet: address, title: form.title, description: form.description, coverUrl: form.coverUrl, priceYD: form.priceYD,
          lessons: [{ title: form.lessonTitle, videoKey: form.videoKey, durationSec: Number(form.durationSec), orderIndex: 0 }],
        }),
      });
      const data = await response.json() as { draft?: Draft; error?: { code?: string } };
      if (!response.ok || !data.draft) throw new Error(data.error?.code);
      setDrafts((current) => [data.draft!, ...current]);
      setMessage("链下草稿已保存。下一步由教师钱包提交上链。");
    } catch (error) { setMessage(friendlyError(error)); } finally { setPending(undefined); }
  }

  async function submitDraft(draft: Draft) {
    if (!address) return;
    setPending(draft.id); setMessage("");
    try {
      const client = await walletClient();
      const hash = await client.writeContract({
        abi: courseMarketAbi, address: contracts.courseMarket, functionName: "submitCourse",
        args: [draft.metadataUri, BigInt(draft.priceYD)], account: address, chain: appChain,
      }) as Hash;
      await publicClient.waitForTransactionReceipt({ hash });
      const response = await authorizedFetch(`/teacher/drafts/${draft.id}/submit`, {
        method: "POST", body: JSON.stringify({ wallet: address, transactionHash: hash }),
      });
      const data = await response.json() as { draft?: Draft; error?: { code?: string } };
      if (!response.ok || !data.draft) throw new Error(data.error?.code);
      setMessage(`课程已提交，链上 Course #${data.draft.courseId} 正在等待审核。`);
      await load();
    } catch (error) { setMessage(friendlyError(error)); } finally { setPending(undefined); }
  }

  async function review(courseId: bigint, action: "approveCourse" | "rejectCourse" | "offlineCourse") {
    if (!address) return;
    setPending(`${action}-${courseId}`); setMessage("");
    try {
      const client = await walletClient();
      const hash = await client.writeContract({ abi: courseMarketAbi, address: contracts.courseMarket, functionName: action, args: [courseId], account: address, chain: appChain }) as Hash;
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("transaction_reverted");
      setMessage(`Course #${courseId} 状态交易已确认。`);
      await load();
    } catch (error) { setMessage(friendlyError(error)); } finally { setPending(undefined); }
  }

  const ownCourses = useMemo(() => courses.filter((course) => course.teacher.toLowerCase() === address?.toLowerCase()), [address, courses]);

  if (!ready) return <main className="dashboard-page shell"><p>正在加载身份服务…</p></main>;
  if (!authenticated) return <main className="dashboard-page shell"><div className="dashboard-card admin-auth"><h1>教师中心</h1><p>请先使用 Privy 登录，再读取绑定钱包的教师与审核角色。</p><button className="button primary" onClick={login}>使用 Privy 登录</button></div></main>;
  if (!address) return <main className="dashboard-page shell"><p>当前 Privy 用户尚无嵌入式 EVM 钱包，请退出后重新登录。</p></main>;

  return (
    <main className="dashboard-page shell">
      <div className="dashboard-heading"><div><div className="eyebrow">TEACHER STUDIO</div><h1>教师与审核中心</h1><p><code>{address}</code> · 教师 {roles.teacher ? "✓" : "—"} · Reviewer {roles.reviewer ? "✓" : "—"}</p></div><button className="button ghost" onClick={() => void load()}>刷新链上状态</button></div>
      {message && <p className="admin-message">{message}</p>}

      {!roles.teacher && !roles.reviewer && <section className="dashboard-card role-empty"><h2>当前钱包尚未授权</h2><p>管理员需要先在 CourseMarket 为该地址授予 TEACHER_ROLE 或 REVIEWER_ROLE。</p></section>}

      {roles.teacher && <section className="dashboard-card admin-form-card"><div className="card-heading"><div><h2>创建课程草稿</h2><p>先保存链下内容，再由钱包提交 CourseMarket。</p></div></div><form className="course-form" onSubmit={createDraft}>
        <label>课程标题<input required minLength={2} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/></label>
        <label>价格（YD）<input required inputMode="decimal" value={form.priceYD} onChange={(e) => setForm({ ...form, priceYD: e.target.value })}/></label>
        <label className="wide">课程描述<textarea required minLength={10} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></label>
        <label className="wide">封面 URL<input required type="url" value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}/></label>
        <label>首课标题<input required value={form.lessonTitle} onChange={(e) => setForm({ ...form, lessonTitle: e.target.value })}/></label>
        <label>时长（秒）<input required type="number" min="1" value={form.durationSec} onChange={(e) => setForm({ ...form, durationSec: e.target.value })}/></label>
        <label className="wide">视频存储 Key<input required value={form.videoKey} onChange={(e) => setForm({ ...form, videoKey: e.target.value })}/></label>
        <button className="button primary" disabled={pending === "draft"}>{pending === "draft" ? "保存中" : "保存链下草稿"}</button>
      </form></section>}

      <section className="dashboard-card"><div className="card-heading"><div><h2>我的草稿</h2><p>链上提交成功前可安全重试，不会生成虚假 courseId。</p></div></div><div className="table-wrap"><table><thead><tr><th>课程</th><th>价格</th><th>状态</th><th>操作</th></tr></thead><tbody>{drafts.length === 0 ? <tr><td colSpan={4}>暂无草稿</td></tr> : drafts.map((draft) => <tr key={draft.id}><td><span className="mini-cover">{draft.courseId ? `#${draft.courseId}` : "DRAFT"}</span><span><b>{draft.title}</b><small>{draft.metadataUri.slice(0, 34)}…</small></span></td><td>{formatUnits(BigInt(draft.priceYD), 18)} YD</td><td><span className={`status-badge ${draft.status === "SUBMITTED" ? "pending" : "draft"}`}>{draft.status === "SUBMITTED" ? "已提交" : "草稿"}</span></td><td>{draft.status === "DRAFT" ? <button className="button" disabled={!roles.teacher || pending === draft.id} onClick={() => void submitDraft(draft)}>{pending === draft.id ? "交易确认中" : "提交上链"}</button> : `Course #${draft.courseId}`}</td></tr>)}</tbody></table></div></section>

      <section className="dashboard-card"><div className="card-heading"><div><h2>{roles.reviewer ? "课程审核队列" : "我的链上课程"}</h2><p>状态直接读取 CourseMarket，不使用静态数据。</p></div></div><div className="table-wrap"><table><thead><tr><th>课程</th><th>教师</th><th>价格</th><th>链上状态</th><th>操作</th></tr></thead><tbody>{(roles.reviewer ? courses : ownCourses).map((course) => <tr key={course.id.toString()}><td><span className="mini-cover">#{course.id.toString()}</span><span><b>{drafts.find((draft) => draft.courseId === course.id.toString())?.title ?? course.metadataUri}</b><small>{course.metadataUri}</small></span></td><td><code>{course.teacher.slice(0, 8)}…{course.teacher.slice(-6)}</code></td><td>{formatUnits(course.priceYD, 18)} YD</td><td><span className={`status-badge ${statusTones[course.status]}`}>{statusLabels[course.status]}</span></td><td>{roles.reviewer ? <div className="review-actions">{course.status !== 1 && <button disabled={Boolean(pending)} onClick={() => void review(course.id, "approveCourse")}>上架</button>}{course.status === 0 && <button disabled={Boolean(pending)} onClick={() => void review(course.id, "rejectCourse")}>拒绝</button>}{course.status === 1 && <button disabled={Boolean(pending)} onClick={() => void review(course.id, "offlineCourse")}>下架</button>}</div> : "只读"}</td></tr>)}</tbody></table></div></section>
    </main>
  );
}
