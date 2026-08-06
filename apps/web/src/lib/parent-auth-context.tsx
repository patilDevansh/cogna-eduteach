"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { isClerkEnabled } from "@/components/clerk-parent-sign-in";
import { clearParent, getParent, onParentChanged } from "@/lib/session";
import type { ParentAuthInput } from "@/lib/parent-auth-headers";

export type ParentDisplay = {
  name: string;
  email?: string;
};

export type ParentAuthState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  display: ParentDisplay | null;
  getAuth: () => Promise<ParentAuthInput>;
  signOut: () => void | Promise<void>;
};

const ParentAuthContext = createContext<ParentAuthState | null>(null);

function DevParentAuthProvider({ children }: { children: ReactNode }) {
  const [parent, setParent] = useState<ReturnType<typeof getParent>>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setParent(getParent());
    setIsLoaded(true);
    return onParentChanged(() => setParent(getParent()));
  }, []);

  const getAuth = useCallback(
    async (): Promise<ParentAuthInput> => ({
      parentId: getParent()?.parentId ?? null,
    }),
    [],
  );

  const signOut = useCallback(() => {
    clearParent();
    setParent(null);
  }, []);

  const value = useMemo<ParentAuthState>(
    () => ({
      isLoaded,
      isSignedIn: Boolean(parent),
      display: parent
        ? { name: parent.name, email: parent.email }
        : null,
      getAuth,
      signOut,
    }),
    [isLoaded, parent, getAuth, signOut],
  );

  return (
    <ParentAuthContext.Provider value={value}>
      {children}
    </ParentAuthContext.Provider>
  );
}

function ClerkParentAuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const getAuth = useCallback(async (): Promise<ParentAuthInput> => {
    const bearerToken = await getToken();
    return { bearerToken };
  }, [getToken]);

  const signOut = useCallback(async () => {
    await clerkSignOut();
  }, [clerkSignOut]);

  const display = useMemo((): ParentDisplay | null => {
    if (!isSignedIn || !user) return null;
    return {
      name: user.fullName ?? user.firstName ?? "Parent",
      email: user.primaryEmailAddress?.emailAddress ?? undefined,
    };
  }, [isSignedIn, user]);

  const value = useMemo<ParentAuthState>(
    () => ({
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      display,
      getAuth,
      signOut,
    }),
    [isLoaded, isSignedIn, display, getAuth, signOut],
  );

  return (
    <ParentAuthContext.Provider value={value}>
      {children}
    </ParentAuthContext.Provider>
  );
}

export function ParentAuthProvider({ children }: { children: ReactNode }) {
  if (isClerkEnabled()) {
    return <ClerkParentAuthProvider>{children}</ClerkParentAuthProvider>;
  }
  return <DevParentAuthProvider>{children}</DevParentAuthProvider>;
}

export function useParentAuth(): ParentAuthState {
  const ctx = useContext(ParentAuthContext);
  if (!ctx) {
    throw new Error("useParentAuth must be used within ParentAuthProvider");
  }
  return ctx;
}
