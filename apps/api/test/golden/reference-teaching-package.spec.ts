import assert from "node:assert/strict";
import { it } from "node:test";
import { FACTORISATION_TEACHING_V1, factorisationReferenceAsset, factorisationReferenceLesson, verifyFactorisationTeachingPackage } from "../../src/personalized-videos/reference-teaching-package";

it("CUR-010 links a default, specific repairs and static fallback to reviewed questions", () => {
  assert.deepEqual(verifyFactorisationTeachingPackage(), []);
  assert.equal(FACTORISATION_TEACHING_V1.repairs.length, 2);
  assert.equal(FACTORISATION_TEACHING_V1.staticFallback, "TEXT_AND_EQUATIONS");
  assert.equal(new Set(FACTORISATION_TEACHING_V1.repairs.map(repair => repair.recheckId)).size, 2);
  assert.equal(factorisationReferenceLesson(FACTORISATION_TEACHING_V1.default.id)?.scenes.length, 3);
  assert.equal(factorisationReferenceLesson("REPAIR_SIGN_PAIR")?.scenes.length, 3);
  assert.equal(factorisationReferenceLesson("ALTERNATE_EXPANSION_CHECK")?.scenes.length, 1);
  assert.equal(factorisationReferenceLesson("UNKNOWN"), null);
  assert.equal(factorisationReferenceAsset("REPAIR_SIGN_PAIR")?.recheckId, "PRAC_FACT_03");
  assert.equal(factorisationReferenceAsset("DEFAULT_PAIR_PRODUCT_SUM")?.purpose, "DEFAULT_TEACHING");
  assert.equal(factorisationReferenceAsset("DEFAULT_PAIR_PRODUCT_SUM")?.checkpointId, "PRAC_FACT_01");
  assert.equal(factorisationReferenceAsset("REPAIR_SIGN_PAIR")?.exposureTag, "TEACH_MATH_8_FACT_MONIC_TRINOMIAL@1.0.0/REPAIR_SIGN_PAIR");
  assert.equal(factorisationReferenceAsset("REPAIR_SIGN_PAIR")?.staticFallback, "TEXT_AND_EQUATIONS");
  assert.equal(factorisationReferenceAsset("REPAIR_SIGN_PAIR")?.staticSlides.length, 3);
  assert.equal(factorisationReferenceLesson("ALTERNATE_EXPANSION_CHECK")?.scenes[0]?.equation.length, 3);
});
