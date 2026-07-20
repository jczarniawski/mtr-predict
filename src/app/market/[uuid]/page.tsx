import { Suspense } from "react";
import { MarketView } from "@/components/market-view";
import { PageLoader } from "@/components/ui";

export default async function MarketPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  return (
    <Suspense fallback={<PageLoader label="Loading market…" />}>
      <MarketView uuid={uuid} />
    </Suspense>
  );
}
