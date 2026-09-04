import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { PUBLIC_RPC } from "@incinerator/chain";
import { ACTIVE_CHAIN_ID, activeChain } from "./network";

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

/**
 * Wallet configuration. The browser talks to the public Robinhood Chain RPC;
 * provider credentials stay server-side.
 */
export function getWagmiConfig() {
  return createConfig({
    chains: [activeChain],
    connectors: [
      injected({ shimDisconnect: true }),
      ...(wcProjectId
        ? [
            walletConnect({
              projectId: wcProjectId,
              showQrModal: true,
              metadata: {
                name: "Incinerator",
                description: "Clean your wallet. Keep your ETH.",
                url: typeof window !== "undefined" ? window.location.origin : "https://incinerator.local",
                icons: [],
              },
            }),
          ]
        : []),
    ],
    multiInjectedProviderDiscovery: true,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: {
      [ACTIVE_CHAIN_ID]: http(PUBLIC_RPC[ACTIVE_CHAIN_ID], { batch: true }),
    },
  });
}

export type WagmiConfig = ReturnType<typeof getWagmiConfig>;
