/**
 * The link code from a parent-invite email (/parent/students/new#code=…). It is kept for this
 * browser tab across sign-in, so a parent who wasn't signed in still lands on the claim form
 * with the code filled in. Storage can be unavailable (private mode, locked-down tablets).
 */
const KEY = "cogna.pendingParentCode";

export function rememberParentCodeFromUrl(): void {
  try {
    const match = /(?:^|[#&])code=([^&]+)/.exec(window.location.hash);
    if (!match) return;
    window.sessionStorage.setItem(KEY, decodeURIComponent(match[1]!));
    // The code is a one-time secret: keep it out of the address bar and history.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    // Without storage the parent types the code from the email instead.
  }
}

export function pendingParentCode(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function forgetParentCode(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
