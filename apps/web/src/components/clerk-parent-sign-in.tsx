"use client";

import { SignIn } from "@clerk/nextjs";

export function ClerkParentSignIn() {
  return (
    <SignIn
      routing="hash"
      signUpUrl="/parent/login"
      afterSignInUrl="/parent/dashboard"
      appearance={{ elements: { rootBox: "mx-auto" } }}
    />
  );
}

export function isClerkEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}
