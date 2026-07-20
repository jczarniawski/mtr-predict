import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpBrokerClient } from "@/lib/broker/http";
import { BrokerApiError } from "@/lib/broker/errors";

const BASE = "https://broker-api-v2-demo.match-trader.com";

function stubFetch(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    return handler(new URL(String(input)), init ?? {});
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("HttpBrokerClient", () => {
  const client = new HttpBrokerClient(BASE, "test-token");

  it("sends the bearer token and JSON content type", async () => {
    const spy = stubFetch(() =>
      new Response(JSON.stringify({ items: [], total: 0, page: 0, size: 100 }), { status: 200 }),
    );
    await client.getBets();
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain(`${BASE}/v1/bets?`);
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("parses the standard error body into BrokerApiError (matching on type)", async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify({
          status: 409,
          title: "User account already exists.",
          detail: "User account already exists.",
          path: "/v1/user-accounts",
          type: "error://broker-api/user-account/already-exists",
        }),
        { status: 409 },
      ),
    );
    try {
      await client.createUserAccount("a@b.c", "Abcd1234");
      expect.unreachable();
    } catch (e) {
      const err = e as BrokerApiError;
      expect(err).toBeInstanceOf(BrokerApiError);
      expect(err.status).toBe(409);
      expect(err.isConflict).toBe(true);
      expect(err.errorType).toBe("error://broker-api/user-account/already-exists");
    }
  });

  it("flags non-JSON error bodies as blocked-before-API", async () => {
    stubFetch(() => new Response("<html>Forbidden</html>", { status: 403 }));
    try {
      await client.getBets();
      expect.unreachable();
    } catch (e) {
      const err = e as BrokerApiError;
      expect(err.status).toBe(403);
      expect(err.detail).toMatch(/blocked before reaching/i);
    }
  });

  it("treats 204 as success with no body (deposit)", async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    await expect(client.deposit("149937", 500)).resolves.toBeUndefined();
  });

  it("returns null for unknown user emails (404)", async () => {
    stubFetch(() =>
      new Response(JSON.stringify({ status: 404, detail: "Not found" }), { status: 404 }),
    );
    await expect(client.getUserByEmail("missing@x.y")).resolves.toBeNull();
  });

  it("unwraps the closed-positions envelope and queries one login per call", async () => {
    const spy = stubFetch(() =>
      new Response(
        JSON.stringify({
          closedPositions: [
            {
              id: "W1",
              symbol: "BTC-150K-26-YES",
              volume: 1,
              side: "BUY",
              openTime: "2026-05-29T10:43:07.561Z",
              openPrice: 0.4,
              closeTime: "2026-05-29T10:43:27.945Z",
              closePrice: 0.5,
              profit: 0.1,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const rows = await client.getClosedPositions("149937", "2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("W1");
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body));
    expect(body.logins).toEqual(["149937"]);
  });

  it("paginates getAllBets until total is reached", async () => {
    let calls = 0;
    stubFetch(() => {
      const page = calls++;
      const items = Array.from({ length: page === 0 ? 100 : 20 }, (_, i) => ({
        uuid: `u${page}-${i}`,
        title: "t",
        imageUrl: "",
        category: "c",
        type: "BINARY",
        status: "ACTIVE",
        created: "2026-01-01T00:00:00Z",
      }));
      return new Response(JSON.stringify({ items, total: 120, page, size: 100 }), { status: 200 });
    });
    const all = await client.getAllBets();
    expect(all).toHaveLength(120);
    expect(calls).toBe(2);
  });
});
