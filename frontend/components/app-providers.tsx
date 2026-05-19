"use client";

import { useState, type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/components/AuthProvider";

// Solana
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import '@solana/wallet-adapter-react-ui/styles.css'
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

const wallets = [new PhantomWalletAdapter()];
// console.log("RPC URL:", process.env.NEXT_PUBLIC_RPC_URL);

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  const content = (
<ConnectionProvider endpoint={"https://api.devnet.solana.com"}>      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}>
          {content}
          <Toaster />
        </PrivyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}