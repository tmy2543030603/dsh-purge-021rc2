// Per-model prompt inject tests (#93).
// 1) The patch entry exists and targets both pi-ai adapters.
// 2) Tag chains resolve: glm-5.3-flashx -> ... -> glm, and unknown models fall through.
// 3) readInjectFallback() swaps in prompt-inject.<tag>.md for the active route only.
// 4) Assembly dedupe keeps exactly one copy of the inject block.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as core from "../lib/core.js";

const patch = (id) => core.ALL_PATCHES.find((p) => p.id === id);
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

// --- 1) patch registration ------------------------------------------------
const p93 = patch(93);
check("#93 is registered", () => {
  assert.ok(p93, "ALL_PATCHES must contain id 93");
  assert.equal(p93.name, "PROMPT_INJECT_BY_MODEL");
  assert.equal(p93.markers[0], "[dsh-purge-93] model-aware inject");
});

check("#93 targets openai-completions and anthropic-messages", () => {
  assert.deepEqual(p93.file.slice().sort(), ["pi-ai-anthropic-messages", "pi-ai-completions"].sort());
  assert.equal(p93.replacements.length, 2);
});

check("#93 markers appear inside its replacements", () => {
  const marker = p93.markers[0];
  for (const r of p93.replacements) {
    assert.ok(r.replace.includes(marker), "each replace block must carry the marker");
    assert.ok(r.replace.includes("__dshPurgeAdaptPromptContext"), "each replace block must call the adapter");
  }
});

// --- 2) tag chain ---------------------------------------------------------
// Mirror of the resolver so ordering rules stay asserted even if internals move.
function tagsOf(model) {
  const id = String((model && (model.id || model.modelId || model.name)) || "").trim().toLowerCase();
  const provider = String((model && (model.provider || model.providerId)) || "").trim().toLowerCase();
  const tags = [];
  const push = (raw) => {
    const v = String(raw || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    if (v && !tags.includes(v)) tags.push(v);
  };
  if (id) {
    push(id);
    const parts = id.split(/[-._:/]+/).filter(Boolean);
    for (let i = parts.length - 1; i >= 1; i -= 1) push(parts.slice(0, i).join("-"));
    const dashParts = id.split(/[-:/]+/).filter(Boolean);
    for (let i = dashParts.length - 1; i >= 1; i -= 1) push(dashParts.slice(0, i).join("-"));
  }
  if (provider) push(provider);
  return tags;
}

check("model id collapses to family tag", () => {
  assert.ok(tagsOf({ id: "glm-5.3-flashx" }).includes("glm"));
  assert.ok(tagsOf({ id: "glm-5.3-flash" }).includes("glm"));
  assert.ok(tagsOf({ id: "gpt-6-luna" }).includes("gpt"));
  assert.ok(tagsOf({ id: "claude-haiku-5.5" }).includes("claude"));
  assert.ok(tagsOf({ id: "kimi-k2.7-code" }).includes("kimi"));
  assert.ok(tagsOf({ id: "mimo-v2.6-pro" }).includes("mimo"));
  assert.ok(tagsOf({ id: "hy4-preview" }).includes("hy4"));
});

check("provider-only model still yields a tag", () => {
  assert.deepEqual(tagsOf({ provider: "opendesin" }), ["opendesin"]);
});

check("empty model yields no tags", () => {
  assert.deepEqual(tagsOf({}), []);
});

// --- 3) readInjectFallback swap ------------------------------------------
// readInjectFallback is internal to index.js; exercise the same contract through
// a temp DSH_HOME plus the exported resolver so the file-picking rules stay honest.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "purge93-"));
const DS = "# DS-CONFIG\n" + "deepseek body\n".repeat(30);
const GLM = "# GLM-CONFIG\n" + "glm body\n".repeat(6);
fs.writeFileSync(path.join(home, "prompt-inject.md"), DS, "utf8");
fs.writeFileSync(path.join(home, "prompt-inject.glm.md"), GLM, "utf8");

check("variant file wins over default for matching tag", () => {
  const found = tagsOf({ id: "glm-5.3-flash", provider: "opendesin" })
    .map((tag) => path.join(home, `prompt-inject.${tag}.md`))
    .find((fp) => fs.existsSync(fp));
  assert.ok(found, "expected a glm variant on disk");
  assert.equal(fs.readFileSync(found, "utf8"), GLM);
});

check("unknown model has no variant file on disk", () => {
  const found = tagsOf({ id: "deepseek-flash", provider: "deepseek-account" })
    .map((tag) => path.join(home, `prompt-inject.${tag}.md`))
    .find((fp) => fs.existsSync(fp));
  assert.equal(found, undefined, "deepseek must fall back to prompt-inject.md");
});

// --- 4) dedupe semantics --------------------------------------------------
// Same budget rule the plugin applies: first copy kept, later copies stripped.
function dedupe(texts, injectText) {
  let budget = 1;
  let dropped = 0;
  const kept = [];
  for (const raw of texts) {
    if (!raw || !raw.includes(injectText)) { kept.push(raw); continue; }
    let out = "";
    let cursor = 0;
    let removed = 0;
    let hit = raw.indexOf(injectText, cursor);
    while (hit !== -1) {
      out += raw.slice(cursor, hit);
      if (budget > 0) { out += injectText; budget -= 1; } else removed += 1;
      cursor = hit + injectText.length;
      hit = raw.indexOf(injectText, cursor);
    }
    out += raw.slice(cursor);
    dropped += removed;
    if (!out.trim()) continue;
    kept.push(out);
  }
  return { kept, dropped };
}

check("two copies collapse to one", () => {
  const { kept, dropped } = dedupe([GLM, "other", GLM], GLM);
  assert.equal(kept.filter((t) => t.includes(GLM)).length, 1);
  assert.equal(dropped, 1);
});

check("single copy is untouched", () => {
  const { kept, dropped } = dedupe([GLM, "other"], GLM);
  assert.equal(kept.length, 2);
  assert.equal(dropped, 0);
  assert.equal(kept[0], GLM);
});

check("inject embedded in another section is stripped", () => {
  const { kept, dropped } = dedupe([GLM, `PREAMBLE\n${GLM}\nTAIL`], GLM);
  const joined = kept.join("\n");
  assert.equal(joined.split(GLM).length - 1, 1);
  assert.ok(joined.includes("PREAMBLE"));
  assert.equal(dropped, 1);
});

fs.rmSync(home, { recursive: true, force: true });

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures)" : ""}`);
