"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductionClassroom } from "./api";
import { teacherData, useSampleMode } from "./teacher-mode";

const SELECTED_KEY = "cogna_teacher_class";

function readSelected(sample: boolean): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY + (sample ? ":sample" : ""));
  } catch {
    return null;
  }
}

function writeSelected(id: string, sample: boolean) {
  try {
    localStorage.setItem(SELECTED_KEY + (sample ? ":sample" : ""), id);
  } catch {
    // Remembering the class is a convenience; the page still works without storage.
  }
}

/**
 * The teacher's classes and which one she is looking at. The choice is shared by
 * Today, Class and Students and remembered between visits. `refresh` re-reads the
 * list (with each class's latest check), so switching never shows a stale check.
 */
export function useTeacherClasses() {
  const { sample, ready } = useSampleMode();
  const latest = useRef(0); // only the newest request may update state (a slow one must not overwrite it)
  const [classes, setClasses] = useState<ProductionClassroom[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (prefer?: string) => {
    const request = ++latest.current;
    try {
      const items = await teacherData(sample).listClassrooms();
      if (request !== latest.current) return { items, id: "" };
      setClasses(items);
      setError("");
      const requested = prefer ?? new URLSearchParams(window.location.search).get("classroom") ?? readSelected(sample);
      const id = requested && items.some((c) => c.id === requested) ? requested : items[0]?.id ?? "";
      setSelectedId(id);
      if (id) writeSelected(id, sample);
      return { items, id };
    } catch (cause) {
      if (request !== latest.current) return { items: [] as ProductionClassroom[], id: "" };
      setError(cause instanceof Error ? cause.message : "Could not load your classes.");
      return { items: [] as ProductionClassroom[], id: "" };
    } finally {
      if (request === latest.current) setLoaded(true);
    }
  }, [sample]);

  // Re-reads whenever the Sample data switch flips.
  useEffect(() => {
    if (ready) void refresh();
  }, [refresh, ready]);

  const select = useCallback((id: string) => refresh(id), [refresh]);

  return { sample, classes, setClasses, selectedId, selected: classes.find((c) => c.id === selectedId), select, refresh, loaded, error };
}
