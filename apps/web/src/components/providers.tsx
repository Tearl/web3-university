"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivyProvider } from "@privy-io/react-auth";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { appChain, wagmiConfig } from "../lib/web3";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(() => new QueryClient());
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  const web3Tree = (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );

  if (!privyAppId) return web3Tree;

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email", "wallet"],
        supportedChains: [appChain],
        defaultChain: appChain,
        embeddedWallets: { ethereum: { createOnLogin: "all-users" } },
      }}
    >
      {web3Tree}
    </PrivyProvider>
  );
}
