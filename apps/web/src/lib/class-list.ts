/**
 * One student per line, pasted from a spreadsheet ("Name<TAB>roll<TAB>phone…") or typed
 * ("Name, roll, phone, phone"). A cell with ten or more digits is a parent's phone; the first
 * other cell with a digit is the roll number; cells without digits before those stay part of the
 * name, so "Sharma, Aarav" is one name. A "Name" header row is skipped.
 */
export function parseClassList(text: string): Array<{ name: string; rollNumber?: string; phones?: string[] }> {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [first = "", ...rest] = line.split(line.includes("\t") ? "\t" : ",").map((cell) => cell.trim());
      const name = [first];
      const phones: string[] = [];
      let roll: string | undefined;
      for (const cell of rest.filter(Boolean)) {
        if (cell.replace(/\D/g, "").length >= 10) phones.push(cell);
        else if (/\d/.test(cell)) roll ??= cell;
        else if (!roll && !phones.length) name.push(cell);
      }
      return { name: name.filter(Boolean).join(", "), roll, phones };
    })
    .filter((row) => row.name);
  if (rows[0] && /^(student\s*)?name$/i.test(rows[0].name.split(",")[0]!.trim())) rows.shift();
  return rows.map(({ name, roll, phones }) => ({ name, ...(roll ? { rollNumber: roll } : {}), ...(phones.length ? { phones } : {}) }));
}
