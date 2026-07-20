"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ApiError, fetchJson } from "@/components/fetcher";
import { useSession } from "@/components/session-context";
import { Spinner } from "@/components/ui";

const inputCls =
  "w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none transition focus:border-brand";

export function AuthForms() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me, refresh } = useSession();
  const [tab, setTab] = useState<"signup" | "login">(
    searchParams.get("tab") === "signup" ? "signup" : "login",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [login, setLogin] = useState("");

  const next = searchParams.get("next") ?? "/";
  const finish = () => {
    refresh();
    router.push(next);
  };

  const run = async (fn: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await fn();
      finish();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  };

  const signup = () =>
    run(() =>
      fetchJson("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ firstName, lastName, email, password }),
      }),
    );

  const attach = () =>
    run(() =>
      fetchJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ login }),
      }),
    );

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl border border-line bg-white p-6 shadow-card">
        <h1 className="mb-1 text-center text-xl font-extrabold tracking-tight">
          Welcome to MTR Predict
        </h1>
        <p className="mb-5 text-center text-sm text-slate-500">
          Trade Yes/No on real-world events, powered by the Match-Trader Broker API.
        </p>

        <div className="mb-5 grid grid-cols-2 rounded-lg bg-canvas p-1 text-sm font-bold">
          <button
            onClick={() => setTab("login")}
            className={`rounded-md py-2 transition ${tab === "login" ? "bg-white shadow-card" : "text-slate-500"}`}
          >
            Use existing login
          </button>
          <button
            onClick={() => setTab("signup")}
            className={`rounded-md py-2 transition ${tab === "signup" ? "bg-white shadow-card" : "text-slate-500"}`}
          >
            Create demo account
          </button>
        </div>

        {tab === "signup" ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void signup();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputCls}
              />
              <input
                required
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputCls}
              />
            </div>
            <input
              required
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
            <input
              required
              type="password"
              placeholder="Password (8+ chars, Aa1)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-brand py-3 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="border-white/40 border-t-white" /> Creating account…
                </span>
              ) : (
                "Create account & get demo funds"
              )}
            </button>
            <p className="text-center text-xs leading-relaxed text-slate-400">
              Creates a broker user account and a DEMO trading account pre-funded with demo money
              {me?.mode === "live" ? " on the connected Match-Trader environment" : ""}.
            </p>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void attach();
            }}
          >
            <input
              required
              inputMode="numeric"
              placeholder="Trading account login (e.g. 820000)"
              value={login}
              onChange={(e) => setLogin(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-brand py-3 text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-50"
            >
              {pending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="border-white/40 border-t-white" /> Attaching…
                </span>
              ) : (
                "Continue"
              )}
            </button>
            <p className="text-center text-xs leading-relaxed text-slate-400">
              Attaches this browser to an existing trading account by its numeric login.
              {me?.mode === "mock" && (
                <>
                  {" "}
                  In demo-data mode, try <button
                    type="button"
                    onClick={() => setLogin("820000")}
                    className="font-bold text-brand underline"
                  >
                    820000
                  </button>
                  .
                </>
              )}
            </p>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-no/30 bg-no-softer px-3 py-2 text-sm font-medium text-no-strong">
            {error}
          </p>
        )}
      </div>

      <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
        This site talks to the Broker API with a broker-level token; there is no end-user password
        check here. It&apos;s an integration demo — add real authentication before any public
        deployment.
      </p>
    </div>
  );
}
