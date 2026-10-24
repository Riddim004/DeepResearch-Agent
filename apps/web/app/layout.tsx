import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "@fontsource-variable/newsreader/wght.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "./globals.css";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Dossier — Deep research, with receipts.",
    template: "%s · Dossier",
  },
  description:
    "An open-source deep research harness that plans, searches, reads, writes, and audits — with every claim traceable to a source.",
  applicationName: "Dossier",
  authors: [{ name: "Riddim004", url: "https://github.com/Riddim004" }],
  keywords: [
    "deep research",
    "AI agents",
    "agent harness",
    "citations",
    "research agent",
    "TypeScript",
  ],
  openGraph: {
    title: "Dossier — Deep research, with receipts.",
    description:
      "A production-grade research harness: typed events, citation auditing, source reading, and a beautiful research desk.",
    type: "website",
    siteName: "Dossier",
    images: [
      { url: "/og.png", width: 1200, height: 630, alt: "Dossier — deep research, with receipts." },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dossier — Deep research, with receipts.",
    description: "An open-source deep research harness with citations you can audit.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe4" },
    { media: "(prefers-color-scheme: dark)", color: "#12110e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
