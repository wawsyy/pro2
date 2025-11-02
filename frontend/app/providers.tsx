"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider, createConfig } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { http } from "viem";
import { injected } from "wagmi/connectors";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MetaMaskProvider } from "@/hooks/metamask/useMetaMaskProvider";
import { MetaMaskEthersSignerProvider } from "@/hooks/metamask/useMetaMaskEthersSigner";
import { InMemoryStorageProvider } from "@/hooks/useInMemoryStorage";

const chains = [hardhat, sepolia] as const;

const wagmiConfig = createConfig({
  chains,
  ssr: true,
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [hardhat.id]: http("http://localhost:8545"),
    [sepolia.id]: http(sepolia.rpcUrls.default.http[0]),
  },
});

type Props = {
  children: ReactNode;
};

export function Providers({ children }: Props) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider chains={chains} theme={lightTheme({ accentColor: "#4338ca" })}>
          <MetaMaskProvider>
            <MetaMaskEthersSignerProvider initialMockChains={{ 31337: "http://localhost:8545" }}>
              <InMemoryStorageProvider>{children}</InMemoryStorageProvider>
            </MetaMaskEthersSignerProvider>
          </MetaMaskProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
