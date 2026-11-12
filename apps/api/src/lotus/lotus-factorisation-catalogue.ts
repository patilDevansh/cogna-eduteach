/**
 * The skill maps and AI-writing specifications for every planned Lotus topic:
 * factorisation (below) and the Class 8 chapters drafted in ./syllabus. Skill
 * ids are unique across topics, so a skill lookup needs no topic; a slot
 * lookup does (each topic numbers its slots 1–25). No question bank lives here.
 */
import { LOTUS_BOARDS, LOTUS_PLANNED_TOPICS, LOTUS_TOPIC_NAMES, type LotusBoard, type LotusItemDiagnostics, type LotusPhase, type LotusPlannedTopic, type LotusTopic } from "@cogna/shared";
import { checkProves, classifyExpansion, classifyFactorisation, classifyReducedForm, classifySimplification, normalizeMathText, readNumberAnswer, sameNumber } from "./lotus-algebra";
import { GRADE_8_DRAFTS } from "./syllabus";

export interface FactorisationSkill { id: string; name: string; group: number; dependsOn: string[]; mistakes: string[]; }
export const FACTORISATION_SKILLS: FactorisationSkill[] = [
  {id:"FND_FACTOR_PAIRS",name:"Factor pairs of a number",group:0,dependsOn:[],mistakes:["NO_NEGATIVE_PAIRS","MISSED_PAIR"]},
  {id:"FND_GCD_NUMERIC",name:"HCF of whole numbers",group:0,dependsOn:["FND_FACTOR_PAIRS"],mistakes:["GAVE_LCM","COMMON_NOT_HIGHEST"]},
  {id:"FND_EXPONENT_PRODUCT",name:"Multiplying powers",group:0,dependsOn:[],mistakes:["MULTIPLIED_EXPONENTS","SUBTRACTED_EXPONENTS","ADDED_BASES"]},
  {id:"FND_MIN_EXP_COMMON",name:"Common letters at the lowest power",group:0,dependsOn:["FND_EXPONENT_PRODUCT"],mistakes:["TOOK_HIGHEST_POWER","COMMON_NOT_HIGHEST"]},
  {id:"FND_SIGN_MUL_DIV",name:"Multiplying signed numbers",group:0,dependsOn:[],mistakes:["SIGN_PRODUCT_ERROR","ADDED_INSTEAD"]},
  {id:"FND_SIGN_ADD_SUB",name:"Adding signed numbers",group:0,dependsOn:[],mistakes:["SIGN_SUM_ERROR"]},
  {id:"FND_RECOGNISE_SQUARE",name:"Recognising perfect squares",group:0,dependsOn:[],mistakes:["ROOTED_NUMBER_ONLY","NOT_ROOTED","HALVED_NOT_ROOTED"]},
  {id:"ALG_IDENTIFY_STRUCTURE",name:"Reading the terms of an expression",group:0,dependsOn:[],mistakes:["COUNTED_FACTORS_AS_TERMS","MISCOUNTED_TERMS"]},
  {id:"EXP_EXPAND_SINGLE",name:"Expanding one bracket",group:0,dependsOn:["ALG_IDENTIFY_STRUCTURE"],mistakes:["FIRST_TERM_ONLY","DROPPED_VARIABLE_POWER","COMBINED_UNLIKE_TERMS"]},
  {id:"EXP_EXPAND_BINOMIALS",name:"Expanding two brackets",group:0,dependsOn:["EXP_EXPAND_SINGLE"],mistakes:["FIRST_LAST_ONLY","ADDED_CONSTANTS","SWAPPED_PRODUCT_SUM"]},
  {id:"ID_SQUARE_DIFF",name:"Using the identities forwards",group:0,dependsOn:["EXP_EXPAND_BINOMIALS"],mistakes:["SQUARE_DISTRIBUTES","DROPPED_MIDDLE_TERM"]},
  {id:"FAC_MEANING",name:"What factorised means",group:1,dependsOn:["ALG_IDENTIFY_STRUCTURE"],mistakes:["SUM_ACCEPTED_AS_FACTORISED","TERMS_VS_FACTORS"]},
  {id:"FAC_CHOOSE_METHOD",name:"Choosing the method",group:1,dependsOn:["FAC_MEANING"],mistakes:["SKIPPED_COMMON_FACTOR_CHECK","IDENTITY_MISAPPLIED"]},
  {id:"FAC_GCF_NUMERIC",name:"Finding the number common to every term",group:2,dependsOn:["FND_GCD_NUMERIC"],mistakes:["GAVE_LCM","COMMON_NOT_HIGHEST"]},
  {id:"FAC_GCF_VARIABLE",name:"Finding the letters common to every term",group:2,dependsOn:["FND_MIN_EXP_COMMON"],mistakes:["TOOK_HIGHEST_POWER","INCLUDED_NON_COMMON_VARIABLE"]},
  {id:"FAC_DIVIDE_TERMS",name:"Dividing every term by the common factor",group:2,dependsOn:["FAC_GCF_NUMERIC","FAC_GCF_VARIABLE","FND_EXPONENT_PRODUCT","FND_EXPONENT_QUOTIENT"],mistakes:["DIVIDED_FIRST_TERM_ONLY","DROPPED_THE_ONE","INDEX_NOT_REDUCED"]},
  {id:"FAC_GCF_NEGATIVE",name:"Taking out a negative common factor",group:2,dependsOn:["FAC_DIVIDE_TERMS","FND_SIGN_MUL_DIV"],mistakes:["KEPT_ORIGINAL_SIGNS","FLIPPED_ONE_SIGN"]},
  {id:"FAC_COMMON_MONOMIAL",name:"Taking out the full common factor",group:2,dependsOn:["FAC_DIVIDE_TERMS","FND_IRREDUCIBLE_FACTORS"],mistakes:["PARTIAL_GCF"]},
  {id:"FAC_COMMON_BINOMIAL",name:"Taking out a common bracket",group:3,dependsOn:["FAC_MEANING","FAC_DIVIDE_TERMS"],mistakes:["LEFTOVERS_MULTIPLIED","BRACKET_NOT_SEEN_AS_FACTOR","REVERSED_BRACKET_MISSED"]},
  {id:"FAC_GROUP_TERMS",name:"Grouping four terms into pairs",group:3,dependsOn:["FAC_COMMON_MONOMIAL","FAC_COMMON_BINOMIAL"],mistakes:["PAIRS_SHARE_NOTHING"]},
  {id:"FAC_GROUP_SIGN",name:"Grouping when the second pair starts with a minus",group:3,dependsOn:["FAC_GROUP_TERMS","FAC_GCF_NEGATIVE"],mistakes:["SIGN_NOT_FLIPPED_IN_GROUP"]},
  {id:"ID_REVERSE_PATTERN",name:"Recognising which identity fits",group:4,dependsOn:["FND_RECOGNISE_SQUARE","ID_SQUARE_DIFF"],mistakes:["SHAPE_MISREAD"]},
  {id:"FAC_DIFF_SQUARES",name:"Difference of two squares",group:4,dependsOn:["ID_REVERSE_PATTERN","FND_RECOGNISE_SQUARE"],mistakes:["WROTE_PERFECT_SQUARE","DROPPED_SQUARE","NOT_DIFF_OF_SQUARES","COEFFICIENT_NOT_ROOTED"]},
  {id:"FAC_PERFECT_SQUARE_PLUS",name:"Perfect square with a plus",group:4,dependsOn:["ID_REVERSE_PATTERN"],mistakes:["MIDDLE_TERM_NOT_CHECKED","SQUARED_WITHOUT_ROOT","COEFFICIENT_NOT_ROOTED","WROTE_DIFF_OF_SQUARES"]},
  {id:"FAC_PERFECT_SQUARE_MINUS",name:"Perfect square with a minus",group:4,dependsOn:["FAC_PERFECT_SQUARE_PLUS","FND_SIGN_MUL_DIV"],mistakes:["WRONG_MIDDLE_SIGN","WROTE_DIFF_OF_SQUARES","COEFFICIENT_NOT_ROOTED"]},
  {id:"FAC_READ_ABC_SIGNS",name:"Reading signed numbers in a trinomial",group:5,dependsOn:["ALG_IDENTIFY_STRUCTURE"],mistakes:["DROPPED_SIGN"]},
  {id:"FAC_PAIR_PRODUCT_SUM",name:"Two numbers with a given product and sum",group:5,dependsOn:["FAC_READ_ABC_SIGNS","FND_FACTOR_PAIRS","FND_SIGN_MUL_DIV","FND_SIGN_ADD_SUB"],mistakes:["WRONG_FACTOR_PAIR_SUM","WRONG_FACTOR_PAIR_PRODUCT","SIGN_PAIR_ERROR","PRODUCT_SUM_SWAPPED"]},
  {id:"FAC_MONIC_TRINOMIAL",name:"Factorising x² + bx + c",group:5,dependsOn:["FAC_PAIR_PRODUCT_SUM","EXP_EXPAND_BINOMIALS"],mistakes:["SIGNS_SWAPPED","WRONG_FACTOR_PAIR_SUM","WRONG_FACTOR_PAIR_PRODUCT","SIGN_PAIR_ERROR","PRODUCT_SUM_SWAPPED"]},
  {id:"FAC_FACTOR_FULLY",name:"Factorising fully",group:6,dependsOn:["FAC_CHOOSE_METHOD"],mistakes:["INCOMPLETE_FACTORISATION","FACTORED_SUM_OF_SQUARES"]},
  {id:"FAC_VERIFY_EXPAND",name:"Checking a factorisation by expanding",group:6,dependsOn:["EXP_EXPAND_BINOMIALS"],mistakes:["EXPAND_CHECK_FAIL","CHECKED_FIRST_TERM_ONLY"]},
  {id:"FAC_CANCEL_COMMON_FACTOR",name:"Cancelling factors, never terms",group:6,dependsOn:["FAC_MEANING","FAC_DIVIDE_TERMS"],mistakes:["CANCELLED_TERMS_NOT_FACTORS","DIVIDED_ONE_TERM_ONLY"]},
  // Added 4 Nov 2026 (the seven proposed in the Core Skill Map, Draft 3). Each has its own mistakes and needs different teaching.
  {id:"FND_EXPONENT_QUOTIENT",name:"Dividing powers",group:0,dependsOn:["FND_EXPONENT_PRODUCT"],mistakes:["DIVIDED_EXPONENTS","ADDED_EXPONENTS_IN_QUOTIENT"]},
  {id:"FND_IRREDUCIBLE_FACTORS",name:"Irreducible factors",group:0,dependsOn:["FND_FACTOR_PAIRS"],mistakes:["STOPPED_AT_COMPOSITE_FACTOR"]},
  {id:"FAC_REARRANGE_TO_GROUP",name:"Rearranging terms to group",group:3,dependsOn:["FAC_GROUP_TERMS"],mistakes:["TRIED_GIVEN_ORDER_ONLY"]},
  {id:"ID_BRACKET_AS_ONE",name:"A bracket as one quantity",group:4,dependsOn:["FAC_DIFF_SQUARES"],mistakes:["EXPANDED_BRACKET_FIRST","TREATED_BRACKET_AS_TWO_TERMS"]},
  {id:"FAC_SPLIT_MIDDLE",name:"Splitting the middle term",group:5,dependsOn:["FAC_PAIR_PRODUCT_SUM","FAC_GROUP_TERMS"],mistakes:["SPLIT_PAIR_DOES_NOT_SUM","SPLIT_THEN_NO_GROUP"]},
  {id:"DIV_TERM_BY_TERM",name:"Dividing a term by a term",group:7,dependsOn:["FND_SIGN_MUL_DIV","FND_EXPONENT_QUOTIENT"],mistakes:["DIVIDED_COEFFICIENT_ONLY","SIGN_QUOTIENT_ERROR"]},
  {id:"DIV_EXPR_BY_TERM",name:"Dividing an expression by a term",group:7,dependsOn:["DIV_TERM_BY_TERM"],mistakes:["LEFT_TERM_UNDIVIDED"]},
];
/**
 * Prerequisites the 25 slots never ask about, added after the early stop was tuned. They are in the map and the
 * short checks can test them, but an unasked one never holds the early stop open: making them required stretched a
 * child who divides only the first term from 8 questions to 17-23. Once asked and shaky, they count like any other.
 */
export const SOFT_PREREQUISITES = new Set(["FND_EXPONENT_QUOTIENT", "FND_IRREDUCIBLE_FACTORS"]);
export const UNFINISHED_MISTAKES = new Set(["COMMON_NOT_HIGHEST","PARTIAL_GCF","INCOMPLETE_FACTORISATION","SUM_ACCEPTED_AS_FACTORISED","BRACKET_NOT_SEEN_AS_FACTOR","PAIRS_SHARE_NOTHING","SKIPPED_COMMON_FACTOR_CHECK","TRIED_GIVEN_ORDER_ONLY","EXPANDED_BRACKET_FIRST","SPLIT_THEN_NO_GROUP"]);

type Level="easy"|"medium"|"hard";
export interface SlotSpec{slot:number;skillId:string;tagged:string[];kind:LotusItemDiagnostics["itemKind"];level:Level;phase:LotusPhase;shape:string;note?:string;mistakes:string[];
  /** Drafted chapters: the worked example for this slot (the answer, choice options, or the check that proves a number). */
  example?:{answer:string;options?:string[];check?:string};}
const raw:Array<[string,SlotSpec["kind"],Level,LotusPhase,string,string[],string[],string?]>=[
 ["FAC_DIVIDE_TERMS","FACTORISE","easy","EXPLORE","6x + 9",["FAC_GCF_NUMERIC"],["DIVIDED_FIRST_TERM_ONLY","COMMON_NOT_HIGHEST"]],
 ["FAC_GCF_VARIABLE","FACTORISE","easy","EXPLORE","x^2 + 5x",["FAC_DIVIDE_TERMS"],["TOOK_HIGHEST_POWER","INCLUDED_NON_COMMON_VARIABLE","DIVIDED_FIRST_TERM_ONLY"]],
 ["FAC_DIVIDE_TERMS","FACTORISE","medium","EXPLORE","3x^2 + 3x",["FAC_GCF_VARIABLE"],["DROPPED_THE_ONE","DIVIDED_FIRST_TERM_ONLY"]],
 ["FAC_COMMON_MONOMIAL","FACTORISE","hard","EXPLORE","10x^2 - 18x^3 + 14x^4",["FAC_GCF_VARIABLE","FAC_DIVIDE_TERMS","FAC_GCF_NUMERIC"],["PARTIAL_GCF","INDEX_NOT_REDUCED","TOOK_HIGHEST_POWER"]],
 ["FAC_GCF_NEGATIVE","FACTORISE","easy","EXPLORE","-4x - 8",[],["KEPT_ORIGINAL_SIGNS","FLIPPED_ONE_SIGN"]],
 ["FAC_MEANING","CHOICE","medium","EXPLORE","Is 2y(x + 1) + 3(x + 1) fully factorised? Why?",[],["SUM_ACCEPTED_AS_FACTORISED","BRACKET_NOT_SEEN_AS_FACTOR"]],
 ["FAC_COMMON_BINOMIAL","FACTORISE","easy","EXPLORE","3(x - 2) + y(x - 2)",[],["LEFTOVERS_MULTIPLIED","BRACKET_NOT_SEEN_AS_FACTOR"]],
 ["FAC_GROUP_TERMS","FACTORISE","easy","EXPLORE","2xy + 2y + 3x + 3",["FAC_COMMON_BINOMIAL","FAC_MEANING"],["PAIRS_SHARE_NOTHING","SUM_ACCEPTED_AS_FACTORISED"]],
 ["FAC_DIFF_SQUARES","FACTORISE","easy","EXPLORE","x^2 - 9",[],["WROTE_PERFECT_SQUARE","DROPPED_SQUARE"]],
 ["FAC_DIFF_SQUARES","FACTORISE","medium","EXPLORE","49a^2 - 25b^2",["FND_RECOGNISE_SQUARE"],["COEFFICIENT_NOT_ROOTED","WROTE_PERFECT_SQUARE"]],
 ["FAC_PERFECT_SQUARE_PLUS","FACTORISE","easy","EXPLORE","x^2 + 6x + 9",[],["SQUARED_WITHOUT_ROOT","WROTE_DIFF_OF_SQUARES"]],
 ["FAC_PAIR_PRODUCT_SUM","CHOICE","medium","EXPLORE","Which two numbers have a product of 12 and a sum of -7?",[],["WRONG_FACTOR_PAIR_SUM","WRONG_FACTOR_PAIR_PRODUCT","SIGN_PAIR_ERROR"]],
 ["FAC_MONIC_TRINOMIAL","FACTORISE","easy","EXPLORE","x^2 + 5x + 6",["FAC_PAIR_PRODUCT_SUM"],["WRONG_FACTOR_PAIR_SUM","PRODUCT_SUM_SWAPPED"]],
 ["FAC_MONIC_TRINOMIAL","FACTORISE","medium","DIAGNOSE","x^2 - 7x + 12",["FAC_PAIR_PRODUCT_SUM"],["SIGN_PAIR_ERROR","WRONG_FACTOR_PAIR_SUM"]],
 ["FAC_MONIC_TRINOMIAL","FACTORISE","hard","DIAGNOSE","x^2 - x - 12",["FAC_PAIR_PRODUCT_SUM"],["SIGNS_SWAPPED","WRONG_FACTOR_PAIR_SUM"]],
 ["FAC_PERFECT_SQUARE_MINUS","FACTORISE","medium","DIAGNOSE","4y^2 - 12y + 9",[],["WRONG_MIDDLE_SIGN","WROTE_DIFF_OF_SQUARES","COEFFICIENT_NOT_ROOTED"]],
 ["FAC_GROUP_SIGN","FACTORISE","medium","DIAGNOSE","6xy - 4y - 9x + 6",["FAC_GCF_NEGATIVE","FAC_COMMON_BINOMIAL"],["SIGN_NOT_FLIPPED_IN_GROUP","SUM_ACCEPTED_AS_FACTORISED"]],
 ["FAC_VERIFY_EXPAND","CHOICE","medium","DIAGNOSE","Riya says x^2 - 5x + 6 = (x - 2)(x + 3). Is she right?",["EXP_EXPAND_BINOMIALS"],["CHECKED_FIRST_TERM_ONLY","EXPAND_CHECK_FAIL"]],
 ["FAC_CHOOSE_METHOD","CHOICE","medium","DIAGNOSE","What should you do first to factorise 3x^2 - 12?",[],["SKIPPED_COMMON_FACTOR_CHECK","SHAPE_MISREAD"]],
 ["FAC_FACTOR_FULLY","FACTORISE","medium","CONFIRM","3x^2 - 12",["FAC_COMMON_MONOMIAL","FAC_DIFF_SQUARES","FAC_CHOOSE_METHOD"],["INCOMPLETE_FACTORISATION","SKIPPED_COMMON_FACTOR_CHECK"]],
 ["FAC_FACTOR_FULLY","FACTORISE","medium","CONFIRM","2x^2 + 10x + 12",["FAC_COMMON_MONOMIAL","FAC_MONIC_TRINOMIAL","FAC_CHOOSE_METHOD"],["INCOMPLETE_FACTORISATION","SKIPPED_COMMON_FACTOR_CHECK"]],
 ["FAC_FACTOR_FULLY","FACTORISE","hard","CONFIRM","x^4 - 16",["FAC_DIFF_SQUARES"],["INCOMPLETE_FACTORISATION","FACTORED_SUM_OF_SQUARES"]],
 ["FAC_MEANING","CHOICE","medium","CONFIRM","Amit writes (7x + 5)/5 = 7x. Is he right?",["FAC_CANCEL_COMMON_FACTOR"],["TERMS_VS_FACTORS","DIVIDED_ONE_TERM_ONLY"]],
 ["FAC_CANCEL_COMMON_FACTOR","SIMPLIFY","hard","CONFIRM","(x^2 - 9) / (x^2 - 6x + 9)",["FAC_DIFF_SQUARES","FAC_PERFECT_SQUARE_MINUS"],["CANCELLED_TERMS_NOT_FACTORS","DIVIDED_ONE_TERM_ONLY"]],
 ["FAC_GROUP_TERMS","FACTORISE","hard","CONFIRM","2x + 3y + 6 + xy",["FAC_COMMON_BINOMIAL","FAC_MEANING"],["PAIRS_SHARE_NOTHING","SUM_ACCEPTED_AS_FACTORISED"]],
];
export const FACTORISATION_SLOTS:SlotSpec[]=raw.map(([skillId,kind,level,phase,shape,tagged,mistakes,note],i)=>({slot:i+1,skillId,kind,level,phase,shape,tagged,mistakes,note}));

/**
 * Adapts prompt wording and algebraic notation for the student's educational board.
 * - CBSE: "HCF", "regrouping", (x + a)(x + b) with "splitting the middle term"
 * - ICSE: "HCF", "grouping method", (x + a)(x + b) with "quadratic factors"
 * - IGCSE: "GCF", "factorising completely in pairs", (x + p)(x + q), "Factorise"
 *
 * Idempotent: calling adaptPromptForBoard multiple times produces identical output.
 */
export function adaptPromptForBoard(prompt: string, board: LotusBoard): string {
  if (!prompt || typeof prompt !== "string") return "";
  const b: LotusBoard = (board === "CBSE" || board === "ICSE" || board === "IGCSE") ? board : "CBSE";

  let out = prompt;

  // 1. Universal spelling normalization (all three boards use British spelling in standard curriculum exams)
  out = out.replace(/\bFactorize\b/g, "Factorise");
  out = out.replace(/\bfactorize\b/g, "factorise");
  out = out.replace(/\bFactorization\b/g, "Factorisation");
  out = out.replace(/\bfactorization\b/g, "factorisation");
  out = out.replace(/\bFactorizing\b/g, "Factorising");
  out = out.replace(/\bfactorizing\b/g, "factorising");

  if (b === "CBSE") {
    // A. GCF -> HCF
    out = out.replace(/\bGreatest Common Factor\b/g, "Highest Common Factor");
    out = out.replace(/\bGreatest common factor\b/g, "Highest common factor");
    out = out.replace(/\bgreatest common factor\b/g, "highest common factor");
    out = out.replace(/\bGCF\b/g, "HCF");
    out = out.replace(/\bgcf\b/g, "hcf");

    // B. Grouping: NCERT Class 8 Ch 12 uses "regrouping" / "regrouping terms"
    out = out.replace(/\bby\s+grouping\s+of\s+terms\b/gi, "by regrouping terms");
    out = out.replace(/\bgrouping\s+of\s+terms\b/gi, "regrouping terms");
    out = out.replace(/\bby\s+grouping\s+terms\b/gi, "by regrouping");
    out = out.replace(/\b[Ff]actorise\s+(?:completely\s+in\s+pairs|in\s+pairs|by\s+grouping(?:\s+method)?)(?!\s+by\s+regrouping)\b/gi, "Factorise by regrouping");
    out = out.replace(/\bby\s+(?:grouping(?:\s+method)?|factorising\s+completely\s+in\s+pairs|factorising\s+in\s+pairs|grouping\s+in\s+pairs)\b/gi, "by regrouping");
    out = out.replace(/\b(?:factorising\s+completely\s+in\s+pairs|factorising\s+in\s+pairs|grouping\s+in\s+pairs|grouping\s+method)\b/gi, "regrouping");

    // C. Quadratics: (x + a)(x + b) and "splitting the middle term"
    out = out.replace(/\(\s*x\s*\+\s*p\s*\)\s*\(\s*x\s*\+\s*q\s*\)/g, "(x + a)(x + b)");
    out = out.replace(/\bby\s+(?:finding\s+)?quadratic\s+factors\b/gi, "by splitting the middle term");
    out = out.replace(/\bquadratic\s+factors\b/gi, "splitting the middle term");
    out = out.replace(/\bdouble\s+brackets\b/gi, "splitting the middle term");
    out = out.replace(/\btwo\s+linear\s+factors\b/gi, "factors of the form (x + a)(x + b)");
  } else if (b === "ICSE") {
    // A. GCF -> HCF
    out = out.replace(/\bGreatest Common Factor\b/g, "Highest Common Factor");
    out = out.replace(/\bGreatest common factor\b/g, "Highest common factor");
    out = out.replace(/\bgreatest common factor\b/g, "highest common factor");
    out = out.replace(/\bGCF\b/g, "HCF");
    out = out.replace(/\bgcf\b/g, "hcf");

    // B. Grouping: Selina / ML Aggarwal uses "grouping method" / "grouping of terms"
    out = out.replace(/\bby\s+regrouping\s+terms\b/gi, "by grouping of terms");
    out = out.replace(/\bregrouping\s+terms\b/gi, "grouping of terms");
    out = out.replace(/\b[Ff]actorise\s+(?:completely\s+in\s+pairs|in\s+pairs|by\s+regrouping)(?!\s+by\s+grouping\s+method)\b/gi, "Factorise by grouping method");
    out = out.replace(/\bby\s+(?:regrouping|grouping(?!\s+(?:method|of\s+terms))|factorising\s+completely\s+in\s+pairs|factorising\s+in\s+pairs|grouping\s+in\s+pairs)\b/gi, "by grouping method");
    out = out.replace(/\b(?:factorising\s+completely\s+in\s+pairs|factorising\s+in\s+pairs|grouping\s+in\s+pairs|regrouping)\b/gi, "grouping method");

    // C. Quadratics: (x + a)(x + b) and "quadratic factors"
    out = out.replace(/\(\s*x\s*\+\s*p\s*\)\s*\(\s*x\s*\+\s*q\s*\)/g, "(x + a)(x + b)");
    out = out.replace(/\bby\s+splitting\s+(?:the\s+)?middle\s+term\b/gi, "into quadratic factors");
    out = out.replace(/\bsplitting\s+(?:the\s+)?middle\s+term\b/gi, "quadratic factors");
    out = out.replace(/\bdouble\s+brackets\b/gi, "quadratic factors");
    out = out.replace(/\btwo\s+linear\s+factors\b/gi, "quadratic factors");
  } else if (b === "IGCSE") {
    // A. HCF -> GCF
    out = out.replace(/\bHighest Common Factor\b/g, "Greatest Common Factor");
    out = out.replace(/\bHighest common factor\b/g, "Greatest common factor");
    out = out.replace(/\bhighest common factor\b/g, "greatest common factor");
    out = out.replace(/\bHCF\b/g, "GCF");
    out = out.replace(/\bhcf\b/g, "gcf");

    // B. Grouping: Cambridge 0580 / 0862 uses "factorising completely in pairs"
    out = out.replace(/\b[Ff]actorise\s+(?:by\s+)?(?:regrouping|grouping(?:\s+method)?|in\s+pairs)(?!\s+completely)\b/gi, "Factorise completely in pairs");
    out = out.replace(/\bby\s+(?:regrouping|grouping(?:\s+method)?)(?!\s+in\s+pairs)\b/gi, "by factorising completely in pairs");
    out = out.replace(/\b(?:regrouping\s+terms|grouping\s+method)\b/gi, "factorising completely in pairs");
    out = out.replace(/\bgrouping\s+of\s+terms\b/gi, "factorising in pairs");
    out = out.replace(/\bregrouping\b/gi, "factorising completely in pairs");

    // C. Quadratics: (x + p)(x + q) and "two linear factors" / "factorising into double brackets"
    out = out.replace(/\(\s*x\s*\+\s*a\s*\)\s*\(\s*x\s*\+\s*b\s*\)/g, "(x + p)(x + q)");
    out = out.replace(/\bby\s+splitting\s+(?:the\s+)?middle\s+term\b/gi, "into double brackets");
    out = out.replace(/\bsplitting\s+(?:the\s+)?middle\s+term\b/gi, "factorising into double brackets");
    out = out.replace(/\bquadratic\s+factors\b/gi, "two linear factors (x + p)(x + q)");
  }

  return out;
}

const canonicalRaw: Array<[string, SlotSpec["kind"], Level, LotusPhase, string, string[], string[], string?]> = [
  // Tier 1: Foundations (Q1-Q3)
  ["FAC_DIVIDE_TERMS", "FACTORISE", "easy", "EXPLORE", "6x + 9", ["FAC_GCF_NUMERIC"], ["DIVIDED_FIRST_TERM_ONLY", "COMMON_NOT_HIGHEST"], "Tier 1: Numeric GCF"],
  ["FAC_GCF_VARIABLE", "FACTORISE", "easy", "EXPLORE", "x^2 + 5x", ["FAC_DIVIDE_TERMS"], ["TOOK_HIGHEST_POWER", "INCLUDED_NON_COMMON_VARIABLE", "DIVIDED_FIRST_TERM_ONLY"], "Tier 1: Variable GCF"],
  ["FAC_DIVIDE_TERMS", "FACTORISE", "medium", "EXPLORE", "3x^2 + 3x", ["FAC_GCF_VARIABLE"], ["DROPPED_THE_ONE", "DIVIDED_FIRST_TERM_ONLY"], "Tier 1: Compound Monomial GCF"],
  // Tier 2: Signs & Meaning (Q4-Q6)
  ["FAC_COMMON_MONOMIAL", "FACTORISE", "hard", "EXPLORE", "10x^2 - 18x^3 + 14x^4", ["FAC_GCF_VARIABLE", "FAC_DIVIDE_TERMS", "FAC_GCF_NUMERIC"], ["PARTIAL_GCF", "INDEX_NOT_REDUCED", "TOOK_HIGHEST_POWER"], "Tier 2: Multi-Term Monomial GCF"],
  ["FAC_GCF_NEGATIVE", "FACTORISE", "easy", "EXPLORE", "-4x - 8", ["FND_SIGN_MUL_DIV"], ["KEPT_ORIGINAL_SIGNS", "FLIPPED_ONE_SIGN"], "Tier 2: Negative GCF"],
  ["FAC_MEANING", "CHOICE", "medium", "EXPLORE", "Is 2y(x + 1) + 3(x + 1) fully factorised? Why?", ["ALG_IDENTIFY_STRUCTURE"], ["SUM_ACCEPTED_AS_FACTORISED", "BRACKET_NOT_SEEN_AS_FACTOR"], "Tier 2: What Factorised Means"],
  // Tier 3: Grouping (Q7-Q8)
  ["FAC_COMMON_BINOMIAL", "FACTORISE", "easy", "EXPLORE", "3(x - 2) + y(x - 2)", ["FAC_MEANING"], ["LEFTOVERS_MULTIPLIED", "BRACKET_NOT_SEEN_AS_FACTOR"], "Tier 3: Common Binomial"],
  ["FAC_GROUP_SIGN", "FACTORISE", "medium", "EXPLORE", "6xy - 4y - 9x + 6", ["FAC_GROUP_TERMS", "FAC_COMMON_BINOMIAL", "FAC_GCF_NEGATIVE"], ["SIGN_NOT_FLIPPED_IN_GROUP", "PAIRS_SHARE_NOTHING", "SUM_ACCEPTED_AS_FACTORISED"], "Tier 3: 4-Term Grouping, second pair starts with a minus"],
  // Tier 4: Identities (Q9-Q11)
  ["FAC_DIFF_SQUARES", "FACTORISE", "easy", "EXPLORE", "x^2 - 9", ["ID_REVERSE_PATTERN"], ["WROTE_PERFECT_SQUARE", "DROPPED_SQUARE"], "Tier 4: Difference of Squares Basic"],
  ["FAC_DIFF_SQUARES", "FACTORISE", "medium", "EXPLORE", "49a^2 - 25b^2", ["FND_RECOGNISE_SQUARE"], ["COEFFICIENT_NOT_ROOTED", "WROTE_PERFECT_SQUARE"], "Tier 4: Difference of Squares with Coefficients"],
  ["FAC_PERFECT_SQUARE_MINUS", "FACTORISE", "easy", "EXPLORE", "4y^2 - 12y + 9", ["FAC_PERFECT_SQUARE_PLUS", "ID_REVERSE_PATTERN", "FND_SIGN_MUL_DIV"], ["WRONG_MIDDLE_SIGN", "WROTE_DIFF_OF_SQUARES"], "Tier 4: Perfect Square Trinomial with a minus"],
  // Tier 5: Quadratics & Synthesis (Q12-Q15)
  ["FAC_PAIR_PRODUCT_SUM", "CHOICE", "medium", "EXPLORE", "Which two numbers have a product of 12 and a sum of -7?", ["FND_FACTOR_PAIRS", "FND_SIGN_ADD_SUB"], ["WRONG_FACTOR_PAIR_SUM", "WRONG_FACTOR_PAIR_PRODUCT", "SIGN_PAIR_ERROR"], "Tier 5: Product-Sum Pair Search"],
  ["FAC_CANCEL_COMMON_FACTOR", "SIMPLIFY", "hard", "EXPLORE", "(x^2 - 9) / (x^2 - 6x + 9)", ["FAC_DIFF_SQUARES", "FAC_PERFECT_SQUARE_MINUS", "FAC_MEANING"], ["CANCELLED_TERMS_NOT_FACTORS", "DIVIDED_ONE_TERM_ONLY"], "Tier 5: Cancelling factors, never terms"],
  ["FAC_MONIC_TRINOMIAL", "FACTORISE", "hard", "DIAGNOSE", "x^2 - x - 12", ["FAC_PAIR_PRODUCT_SUM", "FND_SIGN_MUL_DIV"], ["SIGNS_SWAPPED", "WRONG_FACTOR_PAIR_SUM"], "Tier 5: Monic Quadratic Mixed Signs"],
  ["FAC_FACTOR_FULLY", "FACTORISE", "medium", "CONFIRM", "2x^2 - 18", ["FAC_COMMON_MONOMIAL", "FAC_DIFF_SQUARES"], ["INCOMPLETE_FACTORISATION", "SKIPPED_COMMON_FACTOR_CHECK"], "Tier 5: Multi-Step Synthesis"],
];

/** The canonical 15-question board-aligned diagnostic spine across 5 curriculum tiers. */
export const CANONICAL_15_SPINE: SlotSpec[] = canonicalRaw.map(
  ([skillId, kind, level, phase, shape, tagged, mistakes, note], i) => ({
    slot: i + 1,
    skillId,
    kind,
    level,
    phase,
    shape,
    tagged,
    mistakes,
    note,
  }),
);

const stretchRaw: Array<[number, string, SlotSpec["kind"], Level, LotusPhase, string, string[], string[], string]> = [
  [6, "FAC_SPLIT_MIDDLE", "FACTORISE", "hard", "DIAGNOSE", "6x^2 - 11x - 10", ["FAC_PAIR_PRODUCT_SUM", "FAC_GROUP_TERMS"], ["SPLIT_PAIR_DOES_NOT_SUM", "SPLIT_THEN_NO_GROUP"], "Stretch Slot 6: Non-monic quadratic splitting"],
  [7, "FAC_FACTOR_FULLY", "FACTORISE", "hard", "CONFIRM", "x^4 - 81", ["FAC_DIFF_SQUARES"], ["INCOMPLETE_FACTORISATION", "FACTORED_SUM_OF_SQUARES"], "Stretch Slot 7: Multi-step nested difference of squares"],
  [8, "FAC_CANCEL_COMMON_FACTOR", "SIMPLIFY", "hard", "CONFIRM", "(x^2 - 9) / (x^2 - 5x + 6)", ["FAC_DIFF_SQUARES", "FAC_MONIC_TRINOMIAL"], ["CANCELLED_TERMS_NOT_FACTORS", "DIVIDED_ONE_TERM_ONLY"], "Stretch Slot 8: Algebraic fraction simplification"],
  [9, "FAC_FACTOR_FULLY", "FACTORISE", "medium", "CONFIRM", "a^3 - 4a", ["FAC_COMMON_MONOMIAL", "FAC_DIFF_SQUARES"], ["INCOMPLETE_FACTORISATION", "PARTIAL_GCF"], "Stretch Slot 9: Compound GCF with difference of squares"],
  [10, "FAC_PERFECT_SQUARE_MINUS", "FACTORISE", "hard", "DIAGNOSE", "4x^2 - 12xy + 9y^2", ["FND_RECOGNISE_SQUARE"], ["WRONG_MIDDLE_SIGN", "COEFFICIENT_NOT_ROOTED", "WROTE_DIFF_OF_SQUARES"], "Stretch Slot 10: Two-variable perfect square trinomial"],
  [11, "FAC_PERFECT_SQUARE_PLUS", "NUMBER", "hard", "CONFIRM", "Find positive k such that x^2 + kx + 49 is a perfect square trinomial.", ["ID_REVERSE_PATTERN", "FND_RECOGNISE_SQUARE"], ["MIDDLE_TERM_NOT_CHECKED", "HALVED_NOT_ROOTED"], "Stretch Slot 11: Competition parameter challenge"],
  [12, "FAC_FACTOR_FULLY", "FACTORISE", "hard", "CONFIRM", "2x^3 - 8x^2 - 24x", ["FAC_COMMON_MONOMIAL", "FAC_MONIC_TRINOMIAL"], ["INCOMPLETE_FACTORISATION", "SKIPPED_COMMON_FACTOR_CHECK"], "Stretch Slot 12: Monomial GCF and trinomial synthesis"],
  [13, "ID_BRACKET_AS_ONE", "FACTORISE", "hard", "CONFIRM", "x^2 - (y + 1)^2", ["FAC_DIFF_SQUARES", "FAC_PERFECT_SQUARE_PLUS"], ["EXPANDED_BRACKET_FIRST", "TREATED_BRACKET_AS_TWO_TERMS"], "Stretch Slot 13: Grouping into difference of squares"],
  [14, "FAC_CANCEL_COMMON_FACTOR", "SIMPLIFY", "hard", "CONFIRM", "(2x^2 + 5x - 3) / (4x^2 - 1)", ["FAC_SPLIT_MIDDLE", "FAC_DIFF_SQUARES"], ["CANCELLED_TERMS_NOT_FACTORS", "DIVIDED_ONE_TERM_ONLY"], "Stretch Slot 14: Non-monic algebraic fraction reduction"],
  [15, "FAC_FACTOR_FULLY", "FACTORISE", "hard", "CONFIRM", "n^4 + 4", ["FAC_PERFECT_SQUARE_PLUS", "FAC_DIFF_SQUARES"], ["FACTORED_SUM_OF_SQUARES", "INCOMPLETE_FACTORISATION"], "Stretch Slot 15: Olympiad Sophie Germain identity"],
];

/** Ceiling escalation stretch slots (replacing Q6-Q15 for high performers). */
export const FACTORISATION_STRETCH_SLOTS: SlotSpec[] = stretchRaw.map(
  ([slot, skillId, kind, level, phase, shape, tagged, mistakes, note]) => ({
    slot,
    skillId,
    kind,
    level,
    phase,
    shape,
    tagged,
    mistakes,
    note,
    ...(kind === "NUMBER" ? { example: { answer: "14", check: "2 * 7" } } : {}),
  }),
);

export interface Curriculum {
  topic: LotusPlannedTopic;
  name: string;
  skills: FactorisationSkill[];
  slots: SlotSpec[];
  /** What each mistake code means, when the chapter's draft says (factorisation's codes are self-describing). */
  mistakeNotes: Record<string, string>;
}

const DRAFT_KIND = { EXPRESSION: "EXPAND", NUMBER: "NUMBER", CHOICE: "CHOICE" } as const;

const CURRICULA: Curriculum[] = [
  { topic: "FACTORISATION", name: LOTUS_TOPIC_NAMES.FACTORISATION, skills: FACTORISATION_SKILLS, slots: CANONICAL_15_SPINE, mistakeNotes: {} },
  ...GRADE_8_DRAFTS.flatMap((draft): Curriculum[] => {
    const topic = draft.topicId.toUpperCase().replace(/-/g, "_") as LotusPlannedTopic;
    // Linear equations still runs the original brackets test; its draft waits.
    if (!(LOTUS_PLANNED_TOPICS as readonly string[]).includes(topic)) return [];
    return [{
      topic,
      name: LOTUS_TOPIC_NAMES[topic],
      skills: draft.skills,
      mistakeNotes: draft.mistakes,
      slots: draft.slots.map((d) => ({
        slot: d.slot, skillId: d.skillId, tagged: d.tagged, kind: DRAFT_KIND[d.kind], level: d.level, phase: d.phase,
        shape: d.prompt, mistakes: d.mistakes,
        example: { answer: d.answer, ...(d.options ? { options: d.options } : {}), ...(d.check ? { check: d.check } : {}) },
      })),
    }];
  }),
];

const BY_TOPIC = new Map(CURRICULA.map((c) => [c.topic, c]));
const SKILL_BY_ID = new Map<string, FactorisationSkill>();
const TOPIC_OF_SKILL = new Map<string, Curriculum>();
for (const c of CURRICULA) for (const skill of c.skills) {
  if (SKILL_BY_ID.has(skill.id)) throw new Error(`Skill ${skill.id} is in two topics.`);
  SKILL_BY_ID.set(skill.id, skill);
  TOPIC_OF_SKILL.set(skill.id, c);
}

export function curriculumFor(topic: LotusTopic | undefined): Curriculum {
  return BY_TOPIC.get((topic ?? "FACTORISATION") as LotusPlannedTopic) ?? BY_TOPIC.get("FACTORISATION")!;
}
export function hasCurriculum(topic: LotusTopic | undefined): boolean { return !!topic && BY_TOPIC.has(topic as LotusPlannedTopic); }
/** The topic a skill belongs to. */
export function curriculumOfSkill(id: string): Curriculum | undefined { return TOPIC_OF_SKILL.get(id); }
export function findSkill(id: string): FactorisationSkill | undefined { return SKILL_BY_ID.get(id); }
export function skillName(id: string): string { return SKILL_BY_ID.get(id)?.name ?? id; }
export function dependsOnTransitively(skill: string, target: string, seen = new Set<string>()): boolean {
  if (skill === target) return true;
  if (seen.has(skill)) return false;
  seen.add(skill);
  return (SKILL_BY_ID.get(skill)?.dependsOn ?? []).some((d) => dependsOnTransitively(d, target, seen));
}
/** The skill a mistake belongs to: the item's own skill, then its tagged skills, then any skill in the same topic. */
export function ownerOfMistake(code: string, diagnostics: Pick<LotusItemDiagnostics, "skillId" | "taggedSkills">): string {
  if (SKILL_BY_ID.get(diagnostics.skillId)?.mistakes.includes(code)) return diagnostics.skillId;
  const tagged = diagnostics.taggedSkills.find((s) => SKILL_BY_ID.get(s)?.mistakes.includes(code));
  const sameTopic = TOPIC_OF_SKILL.get(diagnostics.skillId)?.skills ?? FACTORISATION_SKILLS;
  return tagged ?? sameTopic.find((s) => s.mistakes.includes(code))?.id ?? diagnostics.skillId;
}
export function skillsUsedBy(diagnostics: Pick<LotusItemDiagnostics, "skillId" | "taggedSkills" | "stepSkills">): string[] {
  return [...new Set([diagnostics.skillId, ...diagnostics.taggedSkills, ...diagnostics.stepSkills])];
}

/** Validates an AI-created item before it can be installed for a learner. */
export function assertFixedItemIsValid(item: any, label: string): void {
  const d = item?.answerKey?.diagnostics;
  if (!d) throw new Error(`${label}: missing diagnostics`);
  if (!findSkill(d.skillId)) throw new Error(`${label}: unknown skill ${d.skillId}`);
  for (const s of [...(d.taggedSkills ?? []), ...(d.stepSkills ?? [])]) if (!findSkill(s)) throw new Error(`${label}: unknown skill ${s}`);
  if ((d.stepSkills ?? []).length !== (item.answerKey.workedSolution ?? []).length) throw new Error(`${label}: stepSkills must line up with workedSolution`);
  const key = String(item.answerKey.canonicalAnswer);
  if (d.itemKind === "SELECT") {
    const options = item.options ?? [];
    const chosen = key.split(" | ").filter(Boolean);
    if (options.length < 4 || options.length > 6 || new Set(options).size !== options.length) throw new Error(`${label}: invalid select options`);
    if (!chosen.length || chosen.length >= options.length || !chosen.every((c: string) => options.includes(c))) throw new Error(`${label}: invalid select key`);
    for (const p of d.predictedMistakes ?? []) if (!options.includes(p.answer) || chosen.includes(p.answer)) throw new Error(`${label}: invalid select mistake`);
    return;
  }
  if (d.itemKind === "CHOICE") {
    const options = item.options ?? [];
    if (options.length !== 4 || new Set(options).size !== 4 || !options.includes(key)) throw new Error(`${label}: invalid choice`);
    return;
  }
  if (d.itemKind === "NUMBER") {
    if (readNumberAnswer(key) === null) throw new Error(`${label}: answer ${key} is not a number`);
    if (!d.check || !checkProves(d.check, key)) throw new Error(`${label}: check ${d.check ?? "(none)"} doesn't prove ${key}`);
    for (const p of d.predictedMistakes ?? []) {
      if (readNumberAnswer(p.answer) === null || sameNumber(p.answer, key)) throw new Error(`${label}: invalid predicted answer`);
    }
    return;
  }
  const expression = d.expression;
  if (!expression || !normalizeMathText(item.prompt).includes(normalizeMathText(expression))) throw new Error(`${label}: prompt must show expression`);
  const verdict = classifyKey(d.itemKind, key, expression);
  if (verdict !== "CORRECT") throw new Error(`${label}: answer is ${verdict}`);
  for (const p of d.predictedMistakes ?? []) {
    const problem = predictionProblem(d, expression, key, p);
    if (problem) throw new Error(`${label}: ${problem}`);
  }
}

function classifyKey(itemKind: string, answer: string, expression: string) {
  return itemKind === "EXPAND" ? classifyExpansion(answer, expression)
    : itemKind === "SIMPLIFY" ? classifyReducedForm(answer, expression) : classifyFactorisation(answer, expression);
}

function predictionProblem(d: { itemKind: string }, expression: string, key: string, p: { answer: string; mistake: string }): string | null {
  const v = d.itemKind === "SIMPLIFY" ? classifySimplification(p.answer, expression, key) : classifyKey(d.itemKind, p.answer, expression);
  if (v === "CORRECT" || v === "UNREADABLE") return "invalid predicted answer";
  if (v === "UNFINISHED" && d.itemKind !== "EXPAND" && !UNFINISHED_MISTAKES.has(p.mistake)) return "invalid unfinished mistake";
  return null;
}

/**
 * A question whose own task and right answer check out should not be thrown away because one of the
 * AI's guesses about wrong answers was unusable. Removes only those guesses and reports them; every
 * other check (including how many valid wrong answers must remain) still applies afterwards.
 */
export function dropInvalidPredictions(item: any): string[] {
  const d = item?.answerKey?.diagnostics;
  if (!d?.expression || !Array.isArray(d.predictedMistakes) || !["FACTORISE", "EXPAND", "SIMPLIFY"].includes(d.itemKind)) return [];
  const key = String(item.answerKey.canonicalAnswer);
  if (classifyKey(d.itemKind, key, d.expression) !== "CORRECT") return [];
  const dropped: string[] = [];
  d.predictedMistakes = d.predictedMistakes.filter((p: { answer: string; mistake: string }) => {
    const problem = predictionProblem(d, d.expression, key, p);
    if (problem) dropped.push(`${p.mistake} "${p.answer}" (${problem})`);
    return !problem;
  });
  return dropped;
}

for (const c of CURRICULA) {
  if (c.slots.length !== 15 && c.slots.length !== 25) {
    throw new Error(`The ${c.name} plan must have 15 or 25 AI slots.`);
  }
  for (const skill of c.skills) for (const d of skill.dependsOn) if (!SKILL_BY_ID.has(d)) throw new Error(`${skill.id} depends on unknown ${d}`);
}
