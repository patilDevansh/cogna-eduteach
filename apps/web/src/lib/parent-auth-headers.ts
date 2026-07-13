import { getParent } from "./session";

export type ParentAuthInput = {
  bearerToken?: string | null;
  parentId?: string | null;
};

/** Normalize legacy `parentId` string or structured auth input. */
export function normalizeParentAuth(
  input?: string | ParentAuthInput,
): ParentAuthInput {
  if (typeof input === "string") return { parentId: input };
  if (input) return input;
  const parent = getParent();
  return { parentId: parent?.parentId ?? null };
}

/**
 * Parent API auth: Clerk Bearer when a session token is available,
 * otherwise dev `X-Parent-Id` from input or localStorage.
 */
export function buildParentAuthHeaders(
  auth?: string | ParentAuthInput,
): Record<string, string> {
  const { bearerToken, parentId } = normalizeParentAuth(auth);
  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }
  if (parentId) {
    return { "X-Parent-Id": parentId };
  }
  return {};
}
