import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { singleReviewPrompt, singleReviewStudentInput } from '../../src/lotus/lotus-prompts';

describe('single review submitted evidence', () => {
  it('includes the submitted typing history, timing context and game facts, without adding absent fields', () => {
    const response = { answer: 'x', working: '', confidence: 50, responseTimeMs: 8000, didNotKnow: false,
      game: { kind: 'EDIT_HISTORY', history: [{ t: 500, v: 'x+' }, { t: 2000, v: 'x' }] },
      gameReading: { summary: 'changed answer', signals: ['long_pause'], facts: { drafts: 1 } },
      interactionContext: { timing: { elapsedMs: 8000, hiddenMs: 2000, complete: false } } };
    const args = { audits: [], currentQuestion: { phase: 'EXPLORE', subtopic: 's', prompt: 'x', answerKey: { workedSolution: [] }, game: { kind: 'EDIT_HISTORY' } }, currentResponse: response, currentVerification: { status: 'VERIFIED_INCORRECT' }, elapsedSeconds: 8, answeredCount: 1, phase: 'EXPLORE' } as never;
    const prompt = singleReviewPrompt(args);
    assert.ok(prompt.includes('"v":"x+"'));
    assert.match(prompt, /"hiddenMs":2000/);
    assert.match(prompt, /"drafts":1/);
    assert.match(prompt, /does not establish attention, emotion/);
    const input = singleReviewStudentInput(args);
    const names = Object.entries(input).filter(([, value]) => value !== undefined).map(([name]) => name);
    assert.ok(names.includes('submittedGame'));
    assert.ok(!names.includes('tileInteraction'));
  });
});
