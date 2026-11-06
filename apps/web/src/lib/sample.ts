"use client";

/**
 * The public sample test, on this device: which student is the sample child, and their private
 * link token, so the check page can send them to their result instead of the normal report.
 */
const KEY = "cogna_sample_test";

export function saveSample(record: { token: string; studentId: string }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Private mode: the parent still has the link by email.
  }
}

/** The sample link token if this student is the sample child on this device. */
export function sampleTokenFor(studentId: string | undefined): string | null {
  if (!studentId) return null;
  try {
    const record = JSON.parse(localStorage.getItem(KEY) ?? "null") as { token?: string; studentId?: string } | null;
    return record?.studentId === studentId && record.token ? record.token : null;
  } catch {
    return null;
  }
}
