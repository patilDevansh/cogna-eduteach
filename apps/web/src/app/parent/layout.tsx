"use client";

import { ParentAuthProvider } from "@/lib/parent-auth-context";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <ParentAuthProvider>{children}</ParentAuthProvider>;
}
