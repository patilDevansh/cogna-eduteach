"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ProductionClassroom } from "./api";

const SELECTED_KEY = "cogna_teacher_class";

function readSelected(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

function writeSelected(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id);
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
  const [classes, setClasses] = useState<ProductionClassroom[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (prefer?: string) => {
    try {
      const items = await api.listClassrooms();
      setClasses(items);
      setError("");
      const requested = prefer ?? new URLSearchParams(window.location.search).get("classroom") ?? readSelected();
      const id = requested && items.some((c) => c.id === requested) ? requested : items[0]?.id ?? "";
      setSelectedId(id);
      if (id) writeSelected(id);
      return { items, id };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your classes.");
      return { items: [] as ProductionClassroom[], id: "" };
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = useCallback((id: string) => refresh(id), [refresh]);

  return { classes, setClasses, selectedId, selected: classes.find((c) => c.id === selectedId), select, refresh, loaded, error };
}
