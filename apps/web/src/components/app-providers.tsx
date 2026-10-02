"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { DevPanel } from "./dev-panel";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const page = (
    <>
      {children}
      <DevPanel />
    </>
  );
  if (!key) return page;
  return <ClerkProvider publishableKey={key}>{page}</ClerkProvider>;
}
