/** Factorisation skills and AI-writing specifications. No question bank lives here. */
import type { LotusItemDiagnostics, LotusPhase } from "@cogna/shared";
import { classifyFactorisation, classifySimplification, normalizeMathText } from "./lotus-algebra";

export interface FactorisationSkill { id: string; name: string; group: 0|1|2|3|4|5|6; dependsOn: string[]; mistakes: string[]; }
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
  {id:"FAC_DIVIDE_TERMS",name:"Dividing every term by the common factor",group:2,dependsOn:["FAC_GCF_NUMERIC","FAC_GCF_VARIABLE","FND_EXPONENT_PRODUCT"],mistakes:["DIVIDED_FIRST_TERM_ONLY","DROPPED_THE_ONE","INDEX_NOT_REDUCED"]},
  {id:"FAC_GCF_NEGATIVE",name:"Taking out a negative common factor",group:2,dependsOn:["FAC_DIVIDE_TERMS","FND_SIGN_MUL_DIV"],mistakes:["KEPT_ORIGINAL_SIGNS","FLIPPED_ONE_SIGN"]},
  {id:"FAC_COMMON_MONOMIAL",name:"Taking out the full common factor",group:2,dependsOn:["FAC_DIVIDE_TERMS"],mistakes:["PARTIAL_GCF"]},
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
];
const SKILL_BY_ID = new Map(FACTORISATION_SKILLS.map((s) => [s.id,s]));
export function findFactorisationSkill(id:string):FactorisationSkill|undefined{return SKILL_BY_ID.get(id);}
export function skillName(id:string):string{return SKILL_BY_ID.get(id)?.name??id;}
export const UNFINISHED_MISTAKES = new Set(["COMMON_NOT_HIGHEST","PARTIAL_GCF","INCOMPLETE_FACTORISATION","SUM_ACCEPTED_AS_FACTORISED","BRACKET_NOT_SEEN_AS_FACTOR","PAIRS_SHARE_NOTHING","SKIPPED_COMMON_FACTOR_CHECK"]);
export function dependsOnTransitively(skill:string,target:string,seen=new Set<string>()):boolean{if(skill===target)return true;if(seen.has(skill))return false;seen.add(skill);return(SKILL_BY_ID.get(skill)?.dependsOn??[]).some((d)=>dependsOnTransitively(d,target,seen));}
export function ownerOfMistake(code:string,diagnostics:Pick<LotusItemDiagnostics,"skillId"|"taggedSkills">):string{if(SKILL_BY_ID.get(diagnostics.skillId)?.mistakes.includes(code))return diagnostics.skillId;const tagged=diagnostics.taggedSkills.find((s)=>SKILL_BY_ID.get(s)?.mistakes.includes(code));return tagged??FACTORISATION_SKILLS.find((s)=>s.mistakes.includes(code))?.id??diagnostics.skillId;}
export function skillsUsedBy(diagnostics:Pick<LotusItemDiagnostics,"skillId"|"taggedSkills"|"stepSkills">):string[]{return[...new Set([diagnostics.skillId,...diagnostics.taggedSkills,...diagnostics.stepSkills])];}

type Level="easy"|"medium"|"hard";
export interface SlotSpec{slot:number;skillId:string;tagged:string[];kind:LotusItemDiagnostics["itemKind"];level:Level;phase:LotusPhase;shape:string;note?:string;mistakes:string[];}
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

/** Validates an AI-created item before it can be installed for a learner. */
export function assertFixedItemIsValid(item:any,label:string):void{const d=item?.answerKey?.diagnostics;if(!d)throw new Error(`${label}: missing diagnostics`);if(!findFactorisationSkill(d.skillId))throw new Error(`${label}: unknown skill ${d.skillId}`);for(const s of[...(d.taggedSkills??[]),...(d.stepSkills??[])])if(!findFactorisationSkill(s))throw new Error(`${label}: unknown skill ${s}`);if((d.stepSkills??[]).length!==(item.answerKey.workedSolution??[]).length)throw new Error(`${label}: stepSkills must line up with workedSolution`);if(d.itemKind==="CHOICE"){const options=item.options??[];if(options.length!==4||new Set(options).size!==4||!options.includes(item.answerKey.canonicalAnswer))throw new Error(`${label}: invalid choice`);return;}const expression=d.expression;if(!expression||!normalizeMathText(item.prompt).includes(normalizeMathText(expression)))throw new Error(`${label}: prompt must show expression`);const verdict=d.itemKind==="SIMPLIFY"?classifySimplification(item.answerKey.canonicalAnswer,expression,item.answerKey.canonicalAnswer):classifyFactorisation(item.answerKey.canonicalAnswer,expression);if(verdict!=="CORRECT")throw new Error(`${label}: answer is ${verdict}`);for(const p of d.predictedMistakes??[]){const v=d.itemKind==="SIMPLIFY"?classifySimplification(p.answer,expression,item.answerKey.canonicalAnswer):classifyFactorisation(p.answer,expression);if(v==="CORRECT"||v==="UNREADABLE")throw new Error(`${label}: invalid predicted answer`);if(v==="UNFINISHED"&&!UNFINISHED_MISTAKES.has(p.mistake))throw new Error(`${label}: invalid unfinished mistake`);}}
if(FACTORISATION_SLOTS.length!==25)throw new Error("The factorisation plan must have 25 AI slots.");
for(const skill of FACTORISATION_SKILLS)for(const d of skill.dependsOn)if(!SKILL_BY_ID.has(d))throw new Error(`${skill.id} depends on unknown ${d}`);
