"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme, type Theme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { connect, disconnect } from "wagmi/actions";
import { site } from "@/lib/site";
import { wagmiConfig } from "@/lib/wagmi";

const base = lightTheme({
  accentColor: "#1f7ae0",
  accentColorForeground: "#ffffff",
  borderRadius: "large",
  fontStack: "system",
  overlayBlur: "small",
});

/** RainbowKit in glacier colours: frosted modal, azure accent, navy text. */
const theme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: "rgba(246, 251, 255, 0.96)",
    modalBackdrop: "rgba(13, 43, 74, 0.28)",
    modalBorder: "rgba(255, 255, 255, 0.9)",
    modalText: "#0d2b4a",
    modalTextSecondary: "rgba(13, 43, 74, 0.6)",
    modalTextDim: "rgba(13, 43, 74, 0.4)",
    generalBorder: "rgba(13, 43, 74, 0.1)",
    generalBorderDim: "rgba(13, 43, 74, 0.06)",
    profileForeground: "rgba(246, 251, 255, 0.98)",
    profileAction: "rgba(255, 255, 255, 0.85)",
    profileActionHover: "#ffffff",
    connectButtonBackground: "rgba(255,255,255,0.7)",
    connectButtonInnerBackground: "rgba(255,255,255,0.9)",
    connectButtonText: "#0d2b4a",
    menuItemBackground: "rgba(31, 122, 224, 0.08)",
    closeButtonBackground: "rgba(13, 43, 74, 0.06)",
    closeButton: "#0d2b4a",
    actionButtonBorder: "rgba(13, 43, 74, 0.1)",
    actionButtonBorderMobile: "rgba(13, 43, 74, 0.1)",
    actionButtonSecondaryBackground: "rgba(13, 43, 74, 0.06)",
    selectedOptionBorder: "rgba(31, 122, 224, 0.5)",
    connectionIndicator: "#1b8f63",
  },
  fonts: { body: "var(--font-inter), system-ui, sans-serif" },
  radii: { ...base.radii, modal: "22px", modalMobile: "22px", menuButton: "14px", actionButton: "999px", connectButton: "999px" },
};

/** Dev only: lets a stubbed window.ethereum be connected from the console during local rehearsals. */
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __droplockWallet?: unknown }).__droplockWallet = {
    connect: () => connect(wagmiConfig, { connector: wagmiConfig.connectors[0] }),
    disconnect: () => disconnect(wagmiConfig),
  };
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} appInfo={{ appName: site.name }} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
