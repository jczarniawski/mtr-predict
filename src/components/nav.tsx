"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-context";
import { fetchJson } from "@/components/fetcher";
import { formatMoney } from "@/lib/money";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#0a6e54" />
        <path d="M14 44 26 28l8 8 12-18 4 4-15 22-8-8-9 12z" fill="#fff" />
        <circle cx="46" cy="18" r="4" fill="#7ce3b8" />
      </svg>
      <span className="text-lg font-extrabold tracking-tight">
        MTR&nbsp;Predict
      </span>
    </Link>
  );
}

function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in sync with the URL, and cancel any pending debounced submit
  // on navigation — otherwise leaving `/` mid-type fires a stray push back to
  // home, and a stale query lingers in the box after the URL changes.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    setValue(pathname === "/" ? (searchParams.get("q") ?? "") : "");
  }, [pathname, searchParams]);

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  const submit = (q: string) => {
    const params = new URLSearchParams(pathname === "/" ? searchParams : undefined);
    if (q) params.set("q", q);
    else params.delete("q");
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="relative hidden min-w-0 flex-1 max-w-md sm:block">
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.4l3.07 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.07A7 7 0 0 1 2 9Z"
          clipRule="evenodd"
        />
      </svg>
      <input
        value={value}
        onChange={(e) => {
          const q = e.target.value;
          setValue(q);
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(() => submit(q), 350);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (debounce.current) clearTimeout(debounce.current);
            submit(value);
          }
        }}
        placeholder="Search markets"
        className="w-full rounded-full border border-line bg-canvas py-2 pl-9 pr-4 text-sm outline-none transition focus:border-brand focus:bg-white"
      />
    </div>
  );
}

function AccountMenu() {
  const { me, refresh } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!me) return <div className="h-9 w-24 animate-pulse rounded-full bg-slate-100" />;

  if (!me.account) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/auth"
          className="rounded-full px-4 py-2 text-sm font-semibold text-ink transition hover:bg-canvas"
        >
          Log in
        </Link>
        <Link
          href="/auth?tab=signup"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const account = me.account;
  const initials =
    account.name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "A";

  return (
    <div className="relative flex items-center gap-3" ref={menuRef}>
      <Link
        href="/portfolio"
        className="hidden rounded-full bg-canvas px-3 py-1.5 text-sm font-semibold tabular-nums transition hover:bg-slate-100 sm:block"
        title="Equity (balance + open P&L)"
      >
        {formatMoney(account.equity, account.currency, 2)}
      </Link>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white"
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-line bg-white p-2 shadow-pop">
          <div className="border-b border-line px-3 py-2">
            <div className="text-sm font-semibold">{account.name}</div>
            <div className="text-xs text-slate-500">
              Login {account.login} · {account.accountType} · {account.group}
            </div>
          </div>
          <div className="px-3 py-2 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">Balance</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(account.balance, account.currency)}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">Equity</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(account.equity, account.currency)}
              </span>
            </div>
          </div>
          <Link
            href="/portfolio"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-canvas"
          >
            Portfolio
          </Link>
          <button
            onClick={async () => {
              await fetchJson("/api/auth/logout", { method: "POST" });
              setOpen(false);
              refresh();
              router.push("/");
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-no-strong hover:bg-no-softer"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Nav() {
  const { me } = useSession();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo />
          <Suspense fallback={<div className="flex-1" />}>
            <SearchBox />
          </Suspense>
          <nav className="ml-auto flex items-center gap-1 sm:gap-3">
            <Link
              href="/"
              className="hidden rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition hover:text-ink md:block"
            >
              Markets
            </Link>
            <Link
              href="/portfolio"
              className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition hover:text-ink"
            >
              Portfolio
            </Link>
            <AccountMenu />
          </nav>
        </div>
      </header>
      {me?.mode === "mock" && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
          Demo data mode — simulated markets and prices. Set{" "}
          <code className="rounded bg-amber-100 px-1">BROKER_API_TOKEN</code> to trade through the
          real Broker API.
        </div>
      )}
    </>
  );
}
