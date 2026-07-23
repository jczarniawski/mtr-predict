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
      {/* key by uuid so a market→market navigation remounts and re-reads the
          ?outcome=&side= deep-link instead of keeping the prior selection */}
      <MarketView key={uuid} uuid={uuid} />
    </Suspense>
  );
}
