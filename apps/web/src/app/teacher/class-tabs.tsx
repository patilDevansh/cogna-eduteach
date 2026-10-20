"use client";

import type { ProductionClassroom } from "@/lib/api";
import styles from "./sessions/pilot.module.css";

/** One pill per class; the selected class is shared by Today, Class and Students. */
export function ClassTabs({
  classes,
  selectedId,
  onSelect,
  onNew,
  creating = false,
}: {
  classes: ProductionClassroom[];
  selectedId: string;
  onSelect: (id: string) => void;
  onNew?: () => void;
  creating?: boolean;
}) {
  if (!classes.length && !onNew) return null;
  return (
    <nav className={styles.classTabs} aria-label="Your classes">
      {classes.map((c) => (
        <button type="button" key={c.id} aria-current={!creating && c.id === selectedId ? "true" : undefined} onClick={() => onSelect(c.id)}>
          {c.name}
        </button>
      ))}
      {onNew && (
        <button type="button" className={styles.newClass} aria-current={creating ? "true" : undefined} onClick={onNew}>
          + New class
        </button>
      )}
    </nav>
  );
}
