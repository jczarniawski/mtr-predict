import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SessionProvider } from "@/components/session-context";
import { Nav } from "@/components/nav";

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
          <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6">{children}</main>
          <footer className="border-t border-line bg-white py-6 text-center text-xs text-slate-400">
            Powered by the Match-Trader Broker API v2 · Demo application — not investment advice
          </footer>
        </SessionProvider>
      </body>
    </html>
  );
}
