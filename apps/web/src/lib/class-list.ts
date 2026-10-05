/**
 * One student per line, pasted from a spreadsheet ("Name<TAB>roll") or typed ("Name, roll").
 * A comma only splits off a roll number when that last part has a digit, so "Sharma, Aarav"
 * stays one name. A "Name" header row is skipped.
 */
export function parseClassList(text: string): Array<{ name: string; rollNumber?: string }> {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes("\t")) {
        const [name, roll] = line.split("\t").map((cell) => cell.trim());
        return { name: name ?? "", roll };
      }
      const comma = line.lastIndexOf(",");
      const tail = comma >= 0 ? line.slice(comma + 1).trim() : "";
      return /\d/.test(tail) ? { name: line.slice(0, comma).trim(), roll: tail } : { name: line, roll: undefined };
    })
    .filter((row) => row.name);
  if (rows[0] && /^(student\s*)?name$/i.test(rows[0].name)) rows.shift();
  return rows.map(({ name, roll }) => ({ name, ...(roll ? { rollNumber: roll } : {}) }));
}
