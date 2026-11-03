// Inlines results.json into the lab page: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
const results = readFileSync(new URL("./results.json", import.meta.url), "utf8");
const page = readFileSync(new URL("./lab.src.html", import.meta.url), "utf8").replace("/*RESULTS*/null", JSON.stringify(JSON.parse(results)));
writeFileSync(new URL("./lotus-question-lab.html", import.meta.url), page);
