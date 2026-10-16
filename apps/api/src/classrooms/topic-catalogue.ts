/**
 * Syllabus topics a class works through, in NCERT order (Class 8 Mathematics,
 * rationalised 2023 edition). A topic with `lotus` has Cogna checks; one
 * without stays on the plan so it mirrors the school year, and is taught as usual.
 */
import type { LotusTopic } from "@cogna/shared";

export type LotusTopicKey = LotusTopic;

export interface CatalogueTopic {
  id: string;
  name: string;
  chapter: number;
  lotus?: LotusTopicKey;
}

const GRADE_8: CatalogueTopic[] = [
  { id: "rational-numbers", name: "Rational numbers", chapter: 1, lotus: "RATIONAL_NUMBERS" },
  { id: "linear-equations", name: "Linear equations in one variable", chapter: 2, lotus: "BRACKETS" },
  { id: "quadrilaterals", name: "Understanding quadrilaterals", chapter: 3, lotus: "QUADRILATERALS" },
  { id: "data-handling", name: "Data handling", chapter: 4, lotus: "DATA_HANDLING" },
  { id: "squares-roots", name: "Squares and square roots", chapter: 5, lotus: "SQUARES_ROOTS" },
  { id: "cubes-roots", name: "Cubes and cube roots", chapter: 6, lotus: "CUBES_ROOTS" },
  { id: "comparing-quantities", name: "Comparing quantities", chapter: 7, lotus: "COMPARING_QUANTITIES" },
  { id: "algebraic-expressions", name: "Algebraic expressions and identities", chapter: 8, lotus: "ALGEBRAIC_EXPRESSIONS" },
  { id: "mensuration", name: "Mensuration", chapter: 9, lotus: "MENSURATION" },
  { id: "exponents-powers", name: "Exponents and powers", chapter: 10, lotus: "EXPONENTS_POWERS" },
  { id: "proportions", name: "Direct and inverse proportions", chapter: 11, lotus: "PROPORTIONS" },
  { id: "factorisation", name: "Factorisation", chapter: 12, lotus: "FACTORISATION" },
  { id: "graphs", name: "Introduction to graphs", chapter: 13, lotus: "GRAPHS" },
];

const BY_GRADE: Record<number, CatalogueTopic[]> = { 8: GRADE_8 };

export function topicsForGrade(grade: number): CatalogueTopic[] {
  return BY_GRADE[grade] ?? [];
}

export function findTopic(topicId: string): CatalogueTopic | undefined {
  return Object.values(BY_GRADE).flat().find((t) => t.id === topicId);
}

export function topicName(topicId: string): string {
  return findTopic(topicId)?.name ?? topicId.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
