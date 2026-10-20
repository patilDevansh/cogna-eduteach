"use client";

import type { ProductionClassroom } from "@/lib/api";
import styles from "./sessions/pilot.module.css";

/** Up to this many classes show as pills; more go in a "More classes" list so the day's work stays in view. */
const MAX_PILLS = 6;

/** Class names as the teacher sees them: two classes with the same name are told apart by their join code. */
export function classLabels(classes: ProductionClassroom[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const c of classes) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return new Map(classes.map((c) => [c.id, (counts.get(c.name) ?? 0) > 1 ? `${c.name} · ${c.joinCode}` : c.name]));
}

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
  const labels = classLabels(classes);
  // Classes arrive newest first: keep the newest as pills, plus the selected one wherever it is.
  const pills = classes.length <= MAX_PILLS
    ? classes
    : [...classes.slice(0, MAX_PILLS - 1), ...classes.slice(MAX_PILLS - 1).filter((c) => c.id === selectedId)];
  const rest = classes.filter((c) => !pills.includes(c));
  return (
    <nav className={styles.classTabs} aria-label="Your classes">
      {pills.map((c) => (
        <button type="button" key={c.id} aria-current={!creating && c.id === selectedId ? "true" : undefined} onClick={() => onSelect(c.id)}>
          {labels.get(c.id)}
        </button>
      ))}
      {rest.length > 0 && (
        <select
          className={styles.moreClasses}
          aria-label="More classes"
          value=""
          onChange={(event) => { if (event.target.value) onSelect(event.target.value); }}
        >
          <option value="">More classes ({rest.length})</option>
          {rest.map((c) => <option key={c.id} value={c.id}>{labels.get(c.id)}</option>)}
        </select>
      )}
      {onNew && (
        <button type="button" className={styles.newClass} aria-current={creating ? "true" : undefined} onClick={onNew}>
          + New class
        </button>
      )}
    </nav>
  );
}
