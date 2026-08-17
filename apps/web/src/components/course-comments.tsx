"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../lib/course-data";

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  author: { username: string | null; wallet: string };
}

interface CommentPage { comments: CommentItem[]; nextCursor: string | null }

function commentError(code?: string) {
  const messages: Record<string, string> = {
    comment_rate_limited: "发布过于频繁，请一分钟后再试。",
    wallet_not_linked: "当前钱包未绑定到 Privy 用户。",
    invalid_access_token: "登录已过期，请重新登录。",
    invalid_comment: "评论不能为空，且最多 1000 个字符。",
  };
  return messages[code ?? ""] ?? "评论发布失败，请稍后重试。";
}

export function CourseComments({ courseId }: { courseId: string }) {
  const { authenticated, getAccessToken, login } = usePrivy();
  const { wallets } = useWallets();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async (cursor?: string) => {
    const query = cursor ? `?limit=10&cursor=${encodeURIComponent(cursor)}` : "?limit=10";
    const response = await fetch(`${apiUrl}/courses/${courseId}/comments${query}`);
    if (!response.ok) throw new Error("comments_unavailable");
    const page = await response.json() as CommentPage;
    setComments((current) => cursor ? [...current, ...page.comments] : page.comments);
    setNextCursor(page.nextCursor);
  }, [courseId]);

  useEffect(() => { void load().catch(() => setMessage("暂时无法读取评论。")); }, [load]);

  async function submit() {
    if (!content.trim()) return;
    const wallet = wallets.find((candidate) => candidate.walletClientType === "privy")?.address;
    if (!wallet) { setMessage("Privy 嵌入式钱包尚未就绪，请重新登录。"); return; }
    setPending(true); setMessage("");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("invalid_access_token");
      const response = await fetch(`${apiUrl}/courses/${courseId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ wallet, content: content.trim() }),
      });
      const result = await response.json() as { comment?: CommentItem; error?: { code?: string } };
      if (!response.ok || !result.comment) throw new Error(result.error?.code);
      setComments((current) => [result.comment!, ...current]);
      setContent("");
      setMessage("评论已发布。");
    } catch (error) {
      setMessage(commentError(error instanceof Error ? error.message : undefined));
    } finally { setPending(false); }
  }

  return <section className="content-block comments-block">
    <div className="block-title"><h2>课程评论</h2><span>{comments.length} 条已加载</span></div>
    {authenticated ? <div className="comment-form"><textarea value={content} maxLength={1000} onChange={(event) => setContent(event.target.value)} placeholder="分享你的学习感受…"/><div><small>{content.length}/1000</small><button className="button" disabled={pending || !content.trim()} onClick={() => void submit()}>{pending ? "发布中" : "发布评论"}</button></div></div> : <div className="comment-login"><span>登录后参与讨论</span><button className="button" onClick={login}>使用 Privy 登录</button></div>}
    {message ? <p className="profile-auth-message">{message}</p> : null}
    <div className="comment-list">{comments.length === 0 ? <p className="empty-comment">还没有评论，来写第一条吧。</p> : comments.map((comment) => <article className="comment-item" key={comment.id}><div className="comment-author"><span className="avatar">{(comment.author.username ?? comment.author.wallet).slice(0, 1)}</span><div><b>{comment.author.username ?? `${comment.author.wallet.slice(0, 6)}…${comment.author.wallet.slice(-4)}`}</b><time>{new Date(comment.createdAt).toLocaleString("zh-CN")}</time></div></div><p>{comment.content}</p></article>)}</div>
    {nextCursor ? <button className="button ghost load-more" onClick={() => void load(nextCursor)}>加载更多</button> : null}
  </section>;
}
