"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { appChainId, networkLabel } from "../lib/web3";

function shortAddress(address: `0x${string}`) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { address, chainId, status } = useAccount();
  const { connectors, connect, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const connector = connectors[0];

  if (status === "connecting" || status === "reconnecting" || isPending) {
    return <button className="button wallet-button" disabled><span className="status-dot pending-dot" />正在连接</button>;
  }

  if (address && chainId !== appChainId) {
    return (
      <button className="button wallet-button network-error" disabled={isSwitching} onClick={() => switchChain({ chainId: appChainId })}>
        <span className="status-dot error-dot" />{isSwitching ? "正在切换" : `切换到 ${networkLabel}`}
      </button>
    );
  }

  if (address) {
    return (
      <button className="button wallet-button" onClick={() => disconnect()} title="点击断开钱包">
        <span className="status-dot" />{shortAddress(address)}
      </button>
    );
  }

  return (
    <button
      className="button wallet-button"
      disabled={!connector}
      onClick={() => connector && connect({ connector, chainId: appChainId })}
      title={connectError?.message ?? "连接浏览器钱包"}
    >
      <span className="status-dot idle-dot" />{connector ? "连接钱包" : "未检测到钱包"}
    </button>
  );
}
