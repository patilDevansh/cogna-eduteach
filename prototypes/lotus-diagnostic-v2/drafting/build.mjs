// Stitches the drafting drawing set into one page: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
const r = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const page = r("./01-shell.html") + "\n<style>\n" + r("./03-sheets.css") + "</style>\n<script>\n" + ["02-core.js", "04-a.js", "05-b.js", "06-c.js", "99-boot.js"].map(r).join("\n") + "</script>\n";
writeFileSync(new URL("../drafting-room-set.html", import.meta.url), page);
console.log("built", page.length);
