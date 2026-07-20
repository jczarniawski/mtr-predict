import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/session";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;

describe("session tokens", () => {
  it("round-trips a session", () => {
    const token = createSessionToken(
      { login: "820000", name: "Demo Trader", email: "d@e.f" },
      NOW,
      SECRET,
    );
    const session = verifySessionToken(token, NOW + 1000, SECRET);
    expect(session).not.toBeNull();
    expect(session?.login).toBe("820000");
    expect(session?.name).toBe("Demo Trader");
  });

  it("rejects tampered payloads", () => {
    const token = createSessionToken({ login: "820000" }, NOW, SECRET);
    const [payload, sig] = [token.slice(0, token.lastIndexOf(".")), token.slice(token.lastIndexOf(".") + 1)];
    const forged = Buffer.from(JSON.stringify({ login: "999999", iat: NOW, exp: NOW + 9e9 })).toString(
      "base64url",
    );
    expect(verifySessionToken(`${forged}.${sig}`, NOW, SECRET)).toBeNull();
    expect(verifySessionToken(`${payload}.AAAA${sig.slice(4)}`, NOW, SECRET)).toBeNull();
  });

  it("rejects the wrong secret", () => {
    const token = createSessionToken({ login: "820000" }, NOW, SECRET);
    expect(verifySessionToken(token, NOW, "other-secret")).toBeNull();
  });

  it("rejects expired sessions", () => {
    const token = createSessionToken({ login: "820000" }, NOW, SECRET);
    expect(verifySessionToken(token, NOW + 31 * 24 * 3600 * 1000, SECRET)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySessionToken(undefined, NOW, SECRET)).toBeNull();
    expect(verifySessionToken("", NOW, SECRET)).toBeNull();
    expect(verifySessionToken("abc", NOW, SECRET)).toBeNull();
    expect(verifySessionToken("a.b.c", NOW, SECRET)).toBeNull();
  });
});
