import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseClassList } from "../../../web/src/lib/class-list";

describe("pasted class list", () => {
  it("reads spreadsheet columns and typed lines, keeps 'Surname, Name' whole, skips a header", () => {
    assert.deepEqual(parseClassList("Name\tRoll\nAarav Sharma\t8A-01\n\nMeena K, 8A-02\nRohan\nSharma, Aarav\nDas, Kabir, 24\n"), [
      { name: "Aarav Sharma", rollNumber: "8A-01" },
      { name: "Meena K", rollNumber: "8A-02" },
      { name: "Rohan" },
      { name: "Sharma, Aarav" },
      { name: "Das, Kabir", rollNumber: "24" },
    ]);
  });
});
