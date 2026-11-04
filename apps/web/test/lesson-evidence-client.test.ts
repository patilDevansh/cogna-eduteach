import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { practicePendingKey, readPendingPractice, readPracticeDraft } from "../src/lib/lesson-evidence-client";

describe("tab-scoped pending practice recovery", () => {
  it("restores exact unsubmitted edits but never replaces a newer checked answer", () => {
    const map = new Map<string, string>();
    const storage = { getItem: (key: string) => map.get(key) ?? null, removeItem: (key: string) => { map.delete(key); } };
    const draft = { text: "(x+3)(X+2)", baseEventId: "previous-check", storedAt: Date.now() };
    map.set("draft", JSON.stringify(draft));
    assert.equal(readPracticeDraft(storage, "draft", "previous-check")?.text, draft.text);
    assert.equal(readPracticeDraft(storage, "draft", "new-check"), null);
    assert.equal(map.has("draft"), false);
    map.set("draft", JSON.stringify({ ...draft, baseEventId: null, text: "", storedAt: Date.now() }));
    assert.equal(readPracticeDraft(storage, "draft", null)?.text, "");
    map.set("draft", JSON.stringify({ ...draft, storedAt: Date.now() - 86400001 }));
    assert.equal(readPracticeDraft(storage, "draft", "previous-check"), null);
  });
  it("separates learner, assignment, item and version", () => {
    const base = practicePendingKey("a", "lesson", "item", "v1");
    for (const args of [["b", "lesson", "item", "v1"], ["a", "other", "item", "v1"], ["a", "lesson", "other", "v1"], ["a", "lesson", "item", "v2"]]) assert.notEqual(practicePendingKey(...args as [string,string,string,string]), base);
    assert.notEqual(practicePendingKey("a:b", "c", "item", "v1"), practicePendingKey("a", "b:c", "item", "v1"));
  });
  it("preserves event identity and drops expired/malformed local requests", () => {
    const map = new Map<string, string>(); const storage = { getItem: (key: string) => map.get(key) ?? null, removeItem: (key: string) => { map.delete(key); } };
    const event = { schemaVersion: 1, eventId: "stable-request", kind: "ANSWER_SUBMITTED" };
    map.set("pending", JSON.stringify({ event, storedAt: Date.now() }));
    assert.equal(readPendingPractice(storage, "pending")?.eventId, "stable-request");
    map.set("pending", JSON.stringify({ event, storedAt: Date.now() - 25*60*60*1000 }));
    assert.equal(readPendingPractice(storage, "pending"), null); assert.equal(map.has("pending"), false);
    map.set("pending", "{invalid"); assert.equal(readPendingPractice(storage, "pending"), null);
  });
});
