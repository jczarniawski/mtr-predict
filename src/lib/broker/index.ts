import { getEnv } from "@/lib/env";
import { HttpBrokerClient } from "@/lib/broker/http";
import { MockBrokerClient } from "@/lib/broker/mock";
import { MarketService } from "@/lib/markets";
import { QuoteService } from "@/lib/quotes";
import type { BrokerClient } from "@/lib/broker/types";

interface Services {
  key: string;
  broker: BrokerClient;
  quotes: QuoteService;
  markets: MarketService;
}

declare global {
  // eslint-disable-next-line no-var
  var __mtrPredictServices: Services | undefined;
}

/**
 * Process-wide singletons (survive Next.js HMR): one broker client, one quote
 * cache/stream, one market cache — shared by every request.
 */
function services(): Services {
  const env = getEnv();
  const key = [env.mode, env.brokerApiUrl, env.brokerToken, env.brokerGrpcHost, env.brokerGroup].join("|");
  const existing = globalThis.__mtrPredictServices;
  if (existing && existing.key === key) return existing;

  const broker: BrokerClient =
    env.mode === "live"
      ? new HttpBrokerClient(env.brokerApiUrl, env.brokerToken)
      : new MockBrokerClient();
  const quotes = new QuoteService(broker, env.brokerGrpcHost, env.brokerToken);
  const markets = new MarketService(broker, quotes, env.brokerGroup);
  const next = { key, broker, quotes, markets };
  globalThis.__mtrPredictServices = next;
  // Tear down the superseded feed/stream/timers so an env or HMR change doesn't
  // leak an orphaned gRPC stream pushing into a dead cache.
  if (existing) existing.quotes.dispose();
  return next;
}

export function getBroker(): BrokerClient {
  return services().broker;
}

export function getQuoteService(): QuoteService {
  return services().quotes;
}

export function getMarketService(): MarketService {
  return services().markets;
}
