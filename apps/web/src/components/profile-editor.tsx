"use client";

import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface ProfileResponse {
  profile: { username: string | null; wallet: string } | null;
  linkedWallets: string[];
}

interface ChallengeResponse {
  typedData: {
    domain: { name: string; version: string; chainId: number };
    types: { UpdateProfile: { name: string; type: string }[] };
    primaryType: "UpdateProfile";
    message: { privyDid: string; wallet: `0x${string}`; username: string; nonce: string; expiresAt: string };
  };
  chainId: number;
  expiresAt: number;
}

interface ApiErrorResponse {
  error?: { code?: string };
}

function errorMessage(code?: string) {
  const messages: Record<string, string> = {
    wallet_not_linked: "该钱包没有绑定到当前 Privy 用户。",
    access_token_required: "未获取到 Privy 登录凭据，请退出后重新登录。",
    nonce_invalid_or_used: "签名挑战已过期或被使用，请重新提交。",
    invalid_access_token: "登录已过期，请重新登录。",
    identity_not_configured: "API 的 Privy 服务端凭据尚未生效，请重启 API。",
    api_unreachable: `无法连接 API（${apiUrl}），请确认服务已启动。`,
    internal_error: "API 读取资料失败，请检查数据库连接。",
    signature_wallet_mismatch: "签名钱包与绑定钱包不一致。",
  };
  return messages[code ?? ""] ?? "资料更新失败，请稍后重试。";
}

export function ProfileEditor() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <div className="profile-auth-panel"><strong>Privy 尚未配置</strong><p>在 `.env` 填写 Privy App ID 与服务端凭据后，即可启用身份登录和资料签名。</p></div>;
  }
  return <ConfiguredProfileEditor />;
}

function ConfiguredProfileEditor() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { signTypedData } = useSignTypedData();
  const { wallets } = useWallets();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [username, setUsername] = useState("");
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function authorizedFetch(path: string, init: RequestInit = {}) {
    const token = await getAccessToken();
    if (!token) throw new Error("access_token_required");
    return fetch(`${apiUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers } });
  }

  useEffect(() => {
    if (!authenticated) { setProfile(null); return; }
    void authorizedFetch("/profile").then(async (response) => {
      const data = await response.json() as ProfileResponse & ApiErrorResponse;
      if (!response.ok) throw new Error(data.error?.code ?? "profile_load_failed");
      setProfile(data);
      setUsername(data.profile?.username ?? "");
      setMessage("");
    }).catch((error) => {
      const code = error instanceof TypeError ? "api_unreachable" : error instanceof Error ? error.message : undefined;
      setMessage(errorMessage(code));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  async function saveProfile() {
    const wallet = wallets.find((candidate) =>
      candidate.walletClientType === "privy" && profile?.linkedWallets.some((linked) => linked.toLowerCase() === candidate.address.toLowerCase()),
    )?.address;
    if (!wallet || !username.trim()) return;
    setPending(true); setMessage("");
    try {
      const challengeResponse = await authorizedFetch("/profile/nonce", { method: "POST", body: JSON.stringify({ wallet, username: username.trim() }) });
      const challenge = await challengeResponse.json() as ChallengeResponse & { error?: { code?: string } };
      if (!challengeResponse.ok) throw new Error(challenge.error?.code);
      const { signature } = await signTypedData(
        {
          ...challenge.typedData,
          // Privy serializes signature requests for transport/analytics. A native
          // BigInt makes JSON.stringify throw, while this Unix timestamp is safely
          // representable as a JavaScript number and is valid for EIP-712 uint256.
          message: { ...challenge.typedData.message, expiresAt: challenge.expiresAt },
        },
        { address: wallet },
      );
      const updateResponse = await authorizedFetch("/profile", { method: "PATCH", body: JSON.stringify({ wallet, username: username.trim(), nonce: challenge.typedData.message.nonce, expiresAt: challenge.expiresAt, chainId: challenge.chainId, signature }) });
      const result = await updateResponse.json() as { profile?: { username: string; wallet: string }; error?: { code?: string } };
      if (!updateResponse.ok || !result.profile) throw new Error(result.error?.code);
      setProfile((current) => current && { ...current, profile: result.profile! });
      setEditing(false); setMessage("资料已通过钱包签名安全更新。");
    } catch (error) {
      setMessage(errorMessage(error instanceof Error ? error.message : undefined));
    } finally { setPending(false); }
  }

  if (!ready) return <div className="profile-auth-panel"><p>正在加载身份服务…</p></div>;
  if (!authenticated) return <div className="profile-auth-panel"><strong>登录后管理资料</strong><p>Privy 登录与绑定钱包签名共同保护用户名修改。</p><button className="button" onClick={login}>使用 Privy 登录</button></div>;

  const wallet = wallets.find((candidate) =>
    candidate.walletClientType === "privy" && profile?.linkedWallets.some((linked) => linked.toLowerCase() === candidate.address.toLowerCase()),
  )?.address;
  return <div className="profile-auth-panel"><div className="profile-auth-heading"><div><strong>{profile?.profile?.username ?? "未设置用户名"}</strong><code>{wallet ?? "尚未绑定 EVM 钱包"}</code></div><button className="button ghost" onClick={() => void logout()}>退出登录</button></div>{wallet && editing ? <div className="profile-edit-row"><input value={username} maxLength={32} onChange={(event) => setUsername(event.target.value)} placeholder="2–32 位用户名"/><button className="button" disabled={pending || username.trim().length < 2} onClick={() => void saveProfile()}>{pending ? "签名确认中" : "签名并保存"}</button><button className="button ghost" disabled={pending} onClick={() => setEditing(false)}>取消</button></div> : null}{wallet && !editing ? <button className="button" onClick={() => setEditing(true)}>编辑资料</button> : null}{!wallet ? <p>请先在 Privy 中绑定一个 EVM 钱包。</p> : null}{message ? <p className="profile-auth-message">{message}</p> : null}</div>;
}
