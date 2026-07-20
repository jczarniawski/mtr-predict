import type { Metadata } from "next";
import { Portfolio } from "@/components/portfolio-view";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return <Portfolio />;
}
