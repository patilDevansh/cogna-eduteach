import { FACTORISATION_REFERENCE_PACK_V1 } from "../lotus/packs/factorisation-reference-pack";
import { algebraicallyEqual, classifyFactorisation } from "../lotus/lotus-algebra";
import type { PersonalizedVideoLesson } from "@cogna/shared";

/** Reviewed reference content. A module run must record the exact package and segment version shown. */
export const FACTORISATION_TEACHING_V1 = {
  id: "TEACH_MATH_8_FACT_MONIC_TRINOMIAL",
  version: "1.0.0",
  questionPackId: FACTORISATION_REFERENCE_PACK_V1.metadata.packId,
  questionPackVersion: FACTORISATION_REFERENCE_PACK_V1.metadata.version,
  skillId: "FAC_MONIC_TRINOMIAL",
  checkpointId: "PRAC_FACT_01",
  default: {
    id: "DEFAULT_PAIR_PRODUCT_SUM",
    representation: "WORKED_EXAMPLE",
    title: "Find the pair before writing brackets",
    objective: "Factorise x² + bx + c by finding two integers whose sum is b and product is c.",
    exampleId: "EX_FACT_01_ALL_POS",
    steps: [
      { text: "For x² + 5x + 6, we need two numbers that add to 5 and multiply to 6.", math: "2 + 3 = 5; 2 * 3 = 6" },
      { text: "Put one number in each bracket.", math: "(x + 2)(x + 3)" },
      { text: "Expand to check the answer gives the starting expression.", math: "(x + 2)(x + 3) = x^2 + 5x + 6" },
    ],
  },
  repairs: [
    {
      id: "REPAIR_SIGN_PAIR",
      skillId: "FND_SIGN_MUL_DIV",
      trigger: "SIGN_PAIR_ERROR",
      title: "Choose signs from the sum and product",
      exampleId: "EX_FACT_02_NEG_SUM_POS_PROD",
      steps: [
        { text: "A positive product and negative sum require two negative numbers.", math: "(-3) * (-4) = 12; (-3) + (-4) = -7" },
        { text: "Use those numbers in the brackets.", math: "(x - 3)(x - 4)" },
        { text: "Expand to check.", math: "(x - 3)(x - 4) = x^2 - 7x + 12" },
      ],
      recheckId: "PRAC_FACT_03",
    },
    {
      id: "REPAIR_PAIR_SEARCH",
      skillId: "FAC_PAIR_PRODUCT_SUM",
      trigger: "WRONG_FACTOR_PAIR_SUM",
      title: "Test both conditions for each pair",
      exampleId: "EX_FACT_01_ALL_POS",
      steps: [
        { text: "For 6, the pair 1 and 6 multiplies correctly but adds to 7.", math: "1 * 6 = 6; 1 + 6 = 7" },
        { text: "The pair 2 and 3 meets both conditions.", math: "2 * 3 = 6; 2 + 3 = 5" },
        { text: "So the factorisation uses 2 and 3.", math: "(x + 2)(x + 3) = x^2 + 5x + 6" },
      ],
      recheckId: "PRAC_FACT_02",
    },
  ],
  alternate: {
    id: "ALTERNATE_EXPANSION_CHECK",
    title: "Start from the brackets and expand",
    text: "If choosing a pair feels uncertain, multiply the brackets to test it. The x terms must combine to the middle term, and the numbers must make the final term.",
    math: "(x + 2)(x + 3) = x^2 + 2x + 3x + 6 = x^2 + 5x + 6",
  },
  /** Complete text/equations remain available when narration or animation delivery fails. */
  staticFallback: "TEXT_AND_EQUATIONS",
} as const;

export function verifyFactorisationTeachingPackage(): string[] {
  const pack = FACTORISATION_REFERENCE_PACK_V1;
  const lesson = FACTORISATION_TEACHING_V1;
  const errors: string[] = [];
  if (lesson.questionPackId !== pack.metadata.packId || lesson.questionPackVersion !== pack.metadata.version || lesson.skillId !== pack.metadata.subskillId) errors.push("Package linkage changed");
  const examples = new Map(pack.workedExamples.map(item => [item.id, item]));
  for (const segment of [lesson.default, ...lesson.repairs]) {
    const example = examples.get(segment.exampleId);
    if (!example || classifyFactorisation(example.finalAnswer, example.problem.replace("Factorise ", "")) !== "CORRECT") errors.push(`Invalid example: ${segment.id}`);
    if (!segment.steps.length || segment.steps.some(step => !step.text || !step.math)) errors.push(`Incomplete static steps: ${segment.id}`);
    for (const step of segment.steps) {
      for (const equation of step.math.split(";")) {
        const sides = equation.split("=").map(side => side.trim());
        if (sides.length < 2) {
          if (!example || classifyFactorisation(equation.trim(), example.problem.replace("Factorise ", "")) !== "CORRECT") errors.push(`Unverified expression: ${segment.id}`);
          continue;
        }
        try {
          if (sides.some((side, index) => index > 0 && !algebraicallyEqual(sides[0]!, side))) errors.push(`Incorrect equation: ${segment.id}`);
        } catch { errors.push(`Unparseable equation: ${segment.id}`); }
      }
    }
  }
  for (const repair of lesson.repairs) {
    const item = pack.supportedPractice.find(candidate => candidate.id === repair.recheckId);
    if (!item || classifyFactorisation(item.canonicalAnswer, item.expression) !== "CORRECT") errors.push(`Invalid recheck: ${repair.id}`);
    if (!pack.supportedPractice.some(candidate => candidate.predictedMistakes.some(mistake => mistake.mistake === repair.trigger))) errors.push(`Unknown repair trigger: ${repair.id}`);
  }
  if (!pack.supportedPractice.some(item => item.id === lesson.checkpointId)) errors.push("Missing lesson checkpoint");
  if (!algebraicallyEqual("(x+2)(x+3)", "x^2+5x+6") || !algebraicallyEqual("(x-3)(x-4)", "x^2-7x+12")) errors.push("A displayed factorisation is not equivalent");
  const alternateSides = lesson.alternate.math.split("=").map(side => side.trim());
  if (alternateSides.some((side, index) => index > 0 && !algebraicallyEqual(alternateSides[0]!, side))) errors.push("Alternate expansion is not equivalent");
  return errors;
}

function displayMath(math: string): string {
  return math.trim().replaceAll("x^2", "x²").replaceAll("*", "×");
}

/** Ready for the existing slide renderer; selection of a repair requires separate learner evidence. */
export function factorisationReferenceLesson(segmentId: string): PersonalizedVideoLesson | null {
  if (verifyFactorisationTeachingPackage().length) return null;
  const packageData = FACTORISATION_TEACHING_V1;
  if (segmentId === packageData.alternate.id) return {
    title: packageData.alternate.title,
    duration: "About 30 seconds",
    objective: packageData.default.objective,
    generationReason: "Reviewed alternate representation; a learner-specific evidence decision is required before delivery.",
    verification: `Reviewed package ${packageData.id} v${packageData.version}; expansion checked algebraically.`,
    scenes: [{ eyebrow: "Another way", headline: packageData.alternate.title, equation: packageData.alternate.math.split("=").map(text => ({ text: displayMath(text) })), narration: packageData.alternate.text, durationSeconds: 30, accent: "green" }],
  };
  const segment = [packageData.default, ...packageData.repairs].find(item => item.id === segmentId);
  if (!segment) return null;
  return {
    title: segment.title,
    duration: "About 1 minute",
    objective: packageData.default.objective,
    generationReason: segmentId === packageData.default.id ? "Reviewed starting lesson for this module." : "Reviewed targeted explanation. A learner-specific evidence decision is required before delivery.",
    verification: `Reviewed package ${packageData.id} v${packageData.version}; equations checked against the linked question pack.`,
    scenes: segment.steps.map((step, index) => ({
      eyebrow: segmentId === packageData.default.id ? "Learn" : "Repair",
      headline: index === 0 ? segment.title : index === segment.steps.length - 1 ? "Check the result" : "Build the next step",
      equation: step.math.split(";").map(text => ({ text: displayMath(text) })),
      narration: step.text,
      durationSeconds: Math.max(8, Math.ceil(step.text.split(/\s+/).length / 2.5)),
      accent: index === segment.steps.length - 1 ? "green" : "amber",
    })),
  };
}

export function factorisationReferenceAsset(segmentId: string) {
  const lesson = factorisationReferenceLesson(segmentId);
  if (!lesson) return null;
  const repair = FACTORISATION_TEACHING_V1.repairs.find(item => item.id === segmentId);
  return {
    packageId: FACTORISATION_TEACHING_V1.id,
    packageVersion: FACTORISATION_TEACHING_V1.version,
    segmentId,
    exposureTag: `${FACTORISATION_TEACHING_V1.id}@${FACTORISATION_TEACHING_V1.version}/${segmentId}`,
    skillId: repair?.skillId ?? FACTORISATION_TEACHING_V1.skillId,
    purpose: repair ? "PREREQUISITE_REPAIR" as const : segmentId === FACTORISATION_TEACHING_V1.alternate.id ? "ALTERNATE_EXPLANATION" as const : "DEFAULT_TEACHING" as const,
    representation: "REVIEWED_SLIDES_WITH_STATIC_FALLBACK" as const,
    staticFallback: FACTORISATION_TEACHING_V1.staticFallback,
    contentFeatures: {
      format: "WORKED_EQUATION_SLIDES" as const,
      theme: "UNTHEMED" as const,
      narrationScriptAvailable: true,
      motionRequired: false,
      answerReveal: segmentId === FACTORISATION_TEACHING_V1.default.id ? "WORKED_EXAMPLE" as const : "WORKED_REPAIR" as const,
    },
    checkpointId: segmentId === FACTORISATION_TEACHING_V1.default.id ? FACTORISATION_TEACHING_V1.checkpointId : null,
    recheckId: repair?.recheckId ?? null,
    staticSlides: lesson.scenes.map((scene, index) => ({
      step: index + 1,
      title: scene.headline,
      explanation: scene.narration,
      equations: scene.equation.map(equation => equation.text),
    })),
    lesson,
  };
}
