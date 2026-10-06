/**
 * Syllabus topics a class works through, in NCERT order (Class 8 Mathematics,
 * rationalised 2023 edition). A topic with `lotus` has Cogna checks; the others
 * stay on the plan so it mirrors the school year, and are taught as usual.
 */

export type LotusTopicKey = "FACTORISATION" | "BRACKETS";

export interface CatalogueTopic {
  id: string;
  name: string;
  chapter: number;
  lotus?: LotusTopicKey;
}

const GRADE_8: CatalogueTopic[] = [
  { id: "rational-numbers", name: "Rational numbers", chapter: 1 },
  { id: "linear-equations", name: "Linear equations in one variable", chapter: 2, lotus: "BRACKETS" },
  { id: "quadrilaterals", name: "Understanding quadrilaterals", chapter: 3 },
  { id: "data-handling", name: "Data handling", chapter: 4 },
  { id: "squares-roots", name: "Squares and square roots", chapter: 5 },
  { id: "cubes-roots", name: "Cubes and cube roots", chapter: 6 },
  { id: "comparing-quantities", name: "Comparing quantities", chapter: 7 },
  { id: "algebraic-expressions", name: "Algebraic expressions and identities", chapter: 8 },
  { id: "mensuration", name: "Mensuration", chapter: 9 },
  { id: "exponents-powers", name: "Exponents and powers", chapter: 10 },
  { id: "proportions", name: "Direct and inverse proportions", chapter: 11 },
  { id: "factorisation", name: "Factorisation", chapter: 12, lotus: "FACTORISATION" },
  { id: "graphs", name: "Introduction to graphs", chapter: 13 },
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
