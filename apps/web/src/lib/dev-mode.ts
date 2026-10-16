import { useSyncExternalStore } from "react";

/**
 * Developer mode for the student flow.
 *
 * - Dev mode (default ON outside production) shows developer tools: the dev
 *   panel's switches, "Fill demo response", "Show AI Lab", evidence audits.
 *   OFF shows exactly what a student sees.
 * - Fake model routes Lotus calls to the free, instant fake-model API. It only
 *   ever applies while dev mode is on, and it's locked while a diagnostic is
 *   running, because the fake and live APIs hold separate sessions.
 *
 * Production builds never expose any of this: every getter returns "off".
 */

export const DEV_TOOLS_AVAILABLE = process.env.NODE_ENV !== "production";

const DEV_MODE_KEY = "cogna_dev_mode";
const FAKE_MODEL_KEY = "cogna_lotus_model_mode";

interface DevState {
  devMode: boolean;
  fakeModel: boolean;
  /** Set by the Lotus page while a diagnostic is ACTIVE. */
  fakeModelLocked: boolean;
}

const listeners = new Set<() => void>();
let fakeModelLocked = false;
let snapshot: DevState | null = null;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the switch still works for this page view */
  }
}

function compute(): DevState {
  if (!DEV_TOOLS_AVAILABLE || typeof window === "undefined") return { devMode: false, fakeModel: false, fakeModelLocked: false };
  const devMode = read(DEV_MODE_KEY) !== "off";
  return { devMode, fakeModel: devMode && read(FAKE_MODEL_KEY) === "fake", fakeModelLocked };
}

function emit() {
  snapshot = compute();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === DEV_MODE_KEY || event.key === FAKE_MODEL_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const SERVER_STATE: DevState = { devMode: false, fakeModel: false, fakeModelLocked: false };

export function getDevState(): DevState {
  if (!snapshot) snapshot = compute();
  return snapshot;
}

export function useDevState(): DevState {
  return useSyncExternalStore(subscribe, getDevState, () => SERVER_STATE);
}

export function setDevMode(on: boolean) {
  if (!DEV_TOOLS_AVAILABLE) return;
  write(DEV_MODE_KEY, on ? null : "off");
  emit();
}

export function setFakeModel(on: boolean) {
  if (!DEV_TOOLS_AVAILABLE || fakeModelLocked) return;
  write(FAKE_MODEL_KEY, on ? "fake" : null);
  emit();
}

export function setFakeModelLocked(locked: boolean) {
  if (fakeModelLocked === locked) return;
  fakeModelLocked = locked;
  emit();
}

/** What the API client sends: fake only when dev mode is on and the switch is on. */
export function lotusModelMode(): "fake" | "real" {
  return getDevState().fakeModel ? "fake" : "real";
}
