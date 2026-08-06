/**
 * Branded safe text — only factories below may mint these for UI props.
 * Forgotten humanizers become compile errors when components require these types.
 */

import { containsForbiddenTerm } from "./forbidden-terms";

declare const studentSafeBrand: unique symbol;
declare const parentSafeBrand: unique symbol;

export type StudentSafeText = string & { readonly [studentSafeBrand]: true };
export type ParentSafeText = string & { readonly [parentSafeBrand]: true };

const SOFT_DEFAULT = "A short set to keep this skill strong.";

export function toStudentSafeText(raw: string | null | undefined): StudentSafeText {
  const text = (raw ?? "").trim() || SOFT_DEFAULT;
  if (containsForbiddenTerm(text)) {
    return SOFT_DEFAULT as StudentSafeText;
  }
  return text as StudentSafeText;
}

export function toParentSafeText(raw: string | null | undefined): ParentSafeText {
  const text = (raw ?? "").trim();
  if (!text) return "We're still gathering evidence this week." as ParentSafeText;
  if (containsForbiddenTerm(text)) {
    return "We're still gathering evidence — we'll say more once we see a clear pattern." as ParentSafeText;
  }
  return text as ParentSafeText;
}

export function unwrapSafe(text: StudentSafeText | ParentSafeText | string): string {
  return String(text);
}
