// Minimal self-check for the pure render helpers. Run: node test.mjs
import assert from "node:assert";
import { fmt, renderCard, renderLangsCard } from "./worker.js";

// fmt: K only at >=1000
assert.equal(fmt(39), "39");
assert.equal(fmt(512), "512");
assert.equal(fmt(3491), "3.5K");
assert.equal(fmt(1805), "1.8K");
assert.equal(fmt(2237), "2.2K");
assert.equal(fmt(1000), "1K"); // .0 stripped

// renderCard: valid SVG, contains all five stats, no unresolved template holes
const svg = renderCard({ commits: 3491, pullRequests: 2237, repos: 39, merged: 1805, reviews: 512 });
assert.ok(svg.startsWith("<svg"), "starts with <svg");
assert.ok(svg.trim().endsWith("</svg>"), "ends with </svg>");
for (const v of ["3.5K", "2.2K", "39", "512", "1.8K"]) assert.ok(svg.includes(v), `has ${v}`);
for (const l of ["Commits:", "Pull Requests:", "Public Repos:", "PR Reviews:", "Merged PRs:"])
  assert.ok(svg.includes(l), `has label ${l}`);
assert.ok(!svg.includes("undefined"), "no undefined leaked into SVG");
assert.ok(svg.includes("animateTransform"), "SMIL animation present");

// renderLangsCard: valid SVG, all languages present, animated segments
const LANGS = [
  { name: "TypeScript", pct: 80.87 },
  { name: "JavaScript", pct: 6.06 },
  { name: "Python", pct: 6.03 },
  { name: "Kotlin", pct: 3.3 },
  { name: "Swift", pct: 2.23 },
  { name: "Go", pct: 1.52 },
];
const langsSvg = renderLangsCard(LANGS);
assert.ok(langsSvg.startsWith("<svg"), "langs starts with <svg");
assert.ok(langsSvg.trim().endsWith("</svg>"), "langs ends with </svg>");
for (const l of LANGS) {
  assert.ok(langsSvg.includes(l.name), `langs has ${l.name}`);
  assert.ok(langsSvg.includes(`${l.pct.toFixed(1)}%`), `langs has ${l.pct.toFixed(1)}%`);
}
assert.ok(!langsSvg.includes("undefined"), "no undefined in langs SVG");
assert.equal((langsSvg.match(/<animate /g) || []).length, 7, "6 bar segments + 1 glyph fade");
assert.equal((langsSvg.match(/<animateTransform /g) || []).length, 2, "2 bracket ease-in transforms");

console.log("✓ all checks passed");
