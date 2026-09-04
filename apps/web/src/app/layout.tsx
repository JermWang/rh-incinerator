import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { AsciiField } from "@/components/ascii-field";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import { getWagmiConfig } from "@/lib/wagmi";
import "./globals.css";

const description = "Burn junk tokens and revoke stale approvals on Robinhood Chain. Eligible cleanups are paid for by creator fees.";

export const metadata: Metadata = {
  title: { default: "Incinerator · Clean your wallet. Keep your ETH.", template: "%s · Incinerator" },
  description,
  applicationName: "Incinerator",
  icons: { icon: "/brand/icon.png", apple: "/brand/apple-icon.png" },
  openGraph: { title: "Incinerator", description, images: ["/brand/social-card.jpg"], type: "website" },
  twitter: { card: "summary_large_image", title: "Incinerator", description, images: ["/brand/social-card.jpg"] },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const initialState = cookieToInitialState(getWagmiConfig(), (await headers()).get("cookie"));
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <Providers initialState={initialState}>
          <AsciiField />
          <div className="relative z-10 flex min-h-dvh flex-col">
            <Nav />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
