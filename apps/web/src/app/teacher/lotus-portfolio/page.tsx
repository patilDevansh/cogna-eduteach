"use client";

import { useEffect, useState } from "react";
import type { LotusClassroomPortfolio } from "@cogna/shared";
import { api } from "@/lib/api";
import { useTeacherClasses } from "@/lib/teacher-classes";
import { ClassroomPortfolioCard } from "@/components/ClassroomPortfolioCard";
import { ClassTabs } from "../class-tabs";
import styles from "../teacher.module.css";

export default function LotusPortfolioPage() {
  const { sample, classes, selectedId, selected, select, loaded, error: classError } = useTeacherClasses();
  const [portfolio, setPortfolio] = useState<LotusClassroomPortfolio | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setPortfolio(null);
    setError("");
    if (!selectedId || sample) return;
    api.getLotusClassroomPortfolio(selectedId)
      .then((value) => { if (current) setPortfolio(value); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Could not load this class summary."); });
    return () => { current = false; };
  }, [selectedId, sample]);
  return <>
    <div className={styles.pageHeader}><div><div className={styles.dateLine}>Lotus diagnostic</div><h1>{selected?.name ?? "Class summary"}</h1><p>Rated diagnostic evidence across your class.</p></div></div>
    <ClassTabs classes={classes} selectedId={selectedId} onSelect={(id) => void select(id)} />
    {(classError || error) && <section className={styles.emptyCard} role="alert"><p>{classError || error}</p></section>}
    {sample ? <section className={styles.emptyCard}><p>Switch off Sample data to view your class’s saved Lotus results.</p></section>
      : portfolio ? <ClassroomPortfolioCard portfolio={portfolio} />
      : !classError && !error && <section className={styles.emptyCard}><p>{loaded && !classes.length ? "Create a class to see its diagnostic summary." : "Loading class summary…"}</p></section>}
  </>;
}
