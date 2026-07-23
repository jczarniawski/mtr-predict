"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/session-context";

function Tab({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${
        active ? "text-brand" : "text-slate-400"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

/** App-style bottom navigation, mobile only. */
export function BottomNav() {
  const pathname = usePathname();
  const { me } = useSession();
  const signedIn = !!me?.account;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex">
        <Tab
          href="/"
          label="Markets"
          active={pathname === "/" || pathname.startsWith("/market/")}
          icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 17l5-6 4 4 6-8" />
              <path d="M21 7v4h-4" />
            </svg>
          }
        />
        <Tab
          href="/portfolio"
          label="Portfolio"
          active={pathname.startsWith("/portfolio")}
          icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="8" width="18" height="12" rx="2" />
              <path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          }
        />
        <Tab
          href={signedIn ? "/portfolio" : "/auth"}
          label={signedIn ? "Account" : "Sign in"}
          active={pathname.startsWith("/auth")}
          icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
            </svg>
          }
        />
      </div>
    </nav>
  );
}
