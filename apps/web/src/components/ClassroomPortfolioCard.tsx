"use client";

import React from "react";
import type { LotusClassroomPortfolio } from "@cogna/shared";

interface Props {
  portfolio: LotusClassroomPortfolio;
}

export function ClassroomPortfolioCard({ portfolio }: Props) {
  return (
    <div style={{ padding: "1.5rem", borderRadius: "12px", background: "var(--surface)", border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--line)", paddingBottom: "0.75rem" }}>
        <div>
          <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)", fontWeight: 700 }}>
            Classroom Portfolio
          </span>
          <h2 style={{ fontSize: "1.25rem", margin: "4px 0" }}>Whole-Class Mastery Distribution</h2>
        </div>
        <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
          {portfolio.completedTests} of {portfolio.totalEnrolled} tested
        </span>
      </div>

      {portfolio.wholeClassFocusAreas.length > 0 && (
        <div style={{ margin: "1rem 0", padding: "10px 14px", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca" }}>
          <strong style={{ fontSize: "0.85rem", color: "#991b1b" }}>Priority Whole-Class Needs:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: "1.2rem", fontSize: "0.85rem", color: "#7f1d1d" }}>
            {portfolio.wholeClassFocusAreas.map((skill, idx) => (
              <li key={idx}>{skill} (&gt; 30% of class in Critical tier)</li>
            ))}
          </ul>
        </div>
      )}

      {portfolio.teacherBrief && (
        <p style={{ fontSize: "0.9rem", color: "var(--ink-soft)", lineHeight: 1.5, margin: "1rem 0" }}>
          {portfolio.teacherBrief}
        </p>
      )}

      <div style={{ marginTop: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: "8px" }}>Skill Competency Breakdown</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {portfolio.skills.map((skill) => (
            <div key={skill.skillId} style={{ padding: "10px 12px", borderRadius: "8px", background: "rgba(0,0,0,0.02)", border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{skill.name}</span>
                <span style={{ fontSize: "0.85rem", fontFamily: "monospace", fontWeight: 700 }}>Avg: {skill.classAverage.toFixed(1)}/5</span>
              </div>
              <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", background: "#e5e7eb" }}>
                <div style={{ width: `${skill.criticalPercent}%`, background: "#ef4444" }} title={`Critical (1-2): ${skill.criticalCount} students (${skill.criticalPercent}%)`} />
                <div style={{ width: `${skill.emergingPercent}%`, background: "#f59e0b" }} title={`Emerging (3): ${skill.emergingCount} students (${skill.emergingPercent}%)`} />
                <div style={{ width: `${skill.fluentPercent}%`, background: "#10b981" }} title={`Fluent (4-5): ${skill.fluentCount} students (${skill.fluentPercent}%)`} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "0.75rem", color: "var(--ink-faint)" }}>
                <span>Critical: {skill.criticalCount} ({skill.criticalPercent}%)</span>
                <span>Emerging: {skill.emergingCount} ({skill.emergingPercent}%)</span>
                <span>Fluent: {skill.fluentCount} ({skill.fluentPercent}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
