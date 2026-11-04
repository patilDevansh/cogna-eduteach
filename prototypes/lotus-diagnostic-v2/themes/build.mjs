// Stitches a theme into one page: node build.mjs cabinet studio soundlab
import { readFileSync, writeFileSync } from "node:fs";
const r = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
for (const t of process.argv.slice(2)) {
  const page = r(`./${t}.head.html`).replace("<style>", "<style>\n" + r("./base.css") + "\n</style>\n<style>") + "\n<script>\n" + r("./shared.js") + "\n" + r("./widgets.js") + "\n" + r(`./${t}.js`) + "</script>\n";
  writeFileSync(new URL(`../theme-${t}.html`, import.meta.url), page);
  console.log(t, page.length);
}
