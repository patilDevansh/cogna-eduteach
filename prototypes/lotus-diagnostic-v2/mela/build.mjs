// Stitches the Maths Mela into one page: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
const r = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const page = r("./01-shell.html")
  + "\n<style>\n" + ["03-a.css", "04-b.css", "05-c.css"].map(r).join("\n") + "</style>\n"
  + "<script>\n" + ["02-core.js", "03-a.js", "04-b.js", "05-c.js", "99-boot.js"].map(r).join("\n") + "</script>\n";
writeFileSync(new URL("../maths-mela.html", import.meta.url), page);
console.log("built", page.length, "bytes");
