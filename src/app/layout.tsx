import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SessionProvider } from "@/components/session-context";
import { Nav } from "@/components/nav";
import { BottomNav } from "@/components/bottom-nav";

export const metadata: Metadata = {
  title: {
    default: "MTR Predict — trade on what's next",
    template: "%s · MTR Predict",
  },
  description:
    "Kalshi-style prediction market trading on the Match-Trader Broker API v2. Buy YES or NO on real-world events.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <SessionProvider>
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:pb-24">{children}</main>
          <footer className="border-t border-line bg-white py-6 pb-20 text-center text-xs text-slate-400 md:pb-6">
            Powered by the Match-Trader Broker API v2 · Demo application — not investment advice
          </footer>
          <BottomNav />
        </SessionProvider>
      </body>
    </html>
  );
}
