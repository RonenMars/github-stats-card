// Minimal self-check for the pure render helpers. Run: node test.mjs
import assert from "node:assert";
import { fmt, renderCard } from "./worker.js";

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

console.log("✓ all checks passed");
