import { ALGEBRAIC_EXPRESSIONS } from "./grade8-algebraic-expressions";
import { COMPARING_QUANTITIES } from "./grade8-comparing-quantities";
import { CUBES_ROOTS } from "./grade8-cubes-roots";
import { DATA_HANDLING } from "./grade8-data-handling";
import type { DraftChapter } from "./draft";
import { EXPONENTS_POWERS } from "./grade8-exponents-powers";
import { GRAPHS } from "./grade8-graphs";
import { LINEAR_EQUATIONS } from "./grade8-linear-equations";
import { MENSURATION } from "./grade8-mensuration";
import { PROPORTIONS } from "./grade8-proportions";
import { QUADRILATERALS } from "./grade8-quadrilaterals";
import { RATIONAL_NUMBERS } from "./grade8-rational-numbers";
import { SQUARES_ROOTS } from "./grade8-squares-roots";

/** Every Class 8 chapter except factorisation, which has its own catalogue. */
export const GRADE_8_DRAFTS: DraftChapter[] = [
  RATIONAL_NUMBERS, LINEAR_EQUATIONS, QUADRILATERALS, DATA_HANDLING, SQUARES_ROOTS, CUBES_ROOTS,
  COMPARING_QUANTITIES, ALGEBRAIC_EXPRESSIONS, MENSURATION, EXPONENTS_POWERS, PROPORTIONS, GRAPHS,
];
