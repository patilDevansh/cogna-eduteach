"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/ui";
import { getTeacherInvitation, type TeacherInvitationRecord } from "@/lib/session";
import styles from "./teacher.module.css";

const links = [
  ["Today", "/teacher/today", "◉"],
  ["Classes", "/teacher/classes", "▦"],
  ["Sessions", "/teacher/sessions", "▶"],
  ["Students", "/teacher/students", "◎"],
  ["Reports", "/teacher/reports", "↗"],
  ["Pilot story", "/teacher/pilot-story", "◇"],
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [teacher,setTeacher]=useState<TeacherInvitationRecord|null>(null);
  useEffect(()=>setTeacher(getTeacherInvitation()),[]);
  const isAuth = pathname === "/teacher/signup" || pathname === "/teacher/login" || pathname === "/teacher/setup";
  if (isAuth) return children;

  return (
    <div className={styles.teacherPage}>
      <header className={styles.appHeader}>
        <div className={styles.appHeaderInner}>
          <Wordmark href="/teacher/today" size="1.35rem" />
          <div className={styles.teacherIdentity}>
            <div className={styles.teacherIdentityText}>
              <strong>{teacher?.teacherName ?? "Teacher workspace"}</strong>
              <span>{teacher?.schoolName ?? "Cogna production classroom"}</span>
            </div>
            <div className={styles.avatar}>{teacher?.teacherName?.split(/\s+/).map(part=>part[0]).slice(0,2).join("") ?? "T"}</div>
          </div>
        </div>
      </header>
      <div className={styles.appLayout}>
        <aside className={styles.sidebar}>
          <div className={styles.navLabel}>Workspace</div>
          <nav className={styles.nav} aria-label="Teacher navigation">
            {links.map(([label, href, icon]) => (
              <Link key={href} href={href} data-active={pathname === href}>
                <span aria-hidden="true">{icon}</span>{label}
              </Link>
            ))}
          </nav>
          <div className={styles.sideClass}>
            <span>Viewing class</span>
            <strong>Production data</strong>
          </div>
        </aside>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
