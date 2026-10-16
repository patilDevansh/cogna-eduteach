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

  it("picks out parents' phones, typed or pasted, in any column after the name", () => {
    assert.deepEqual(parseClassList("Name, Roll, Mother, Father\nAarav Sharma, 8A-01, 98765 43210, +91 91234 56789\nMeena K\t\t9876500000\nSharma, Aarav, 9876511111"), [
      { name: "Aarav Sharma", rollNumber: "8A-01", phones: ["98765 43210", "+91 91234 56789"] },
      { name: "Meena K", phones: ["9876500000"] },
      { name: "Sharma, Aarav", phones: ["9876511111"] },
    ]);
  });
});
