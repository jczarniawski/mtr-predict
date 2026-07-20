import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForms } from "@/components/auth-forms";
import { PageLoader } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

export default function AuthPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AuthForms />
    </Suspense>
  );
}
