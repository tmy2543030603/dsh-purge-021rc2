// 内置模型族破甲模板测试（#94）。
// 1) familyOf 能把 GPT 全系（gpt-5.x / gpt-4.1 / o1·o3·o4 / codex / chatgpt）归到 gpt，
//    并且不会把 deepseek / claude / qwen 误判成任何一族。
// 2) 内置模板不带越狱指纹：别家模板 token、拒绝词黑名单、"绝对授权"式自曝措辞。
// 3) 内置模板必须带可判定边界（成年 + 虚构 + 两类红线），否则强对齐模型只会按最坏情况判。
// 4) 磁盘上的 prompt-inject.<tag>.md 永远压过内置模板。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as mp from "../lib/model-prompts.js";

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

// --- 1) 归族 --------------------------------------------------------------
const GPT_IDS = [
  "gpt-5.1", "gpt-5", "gpt-5.1-codex", "gpt-4.1", "gpt-4.1-mini",
  "gpt-4o", "gpt-4o-mini", "chatgpt-4o-latest", "codex-mini-latest",
  "o1", "o1-pro", "o3", "o3-mini", "o4-mini", "gpt-oss-120b",
];

check("GPT 全系归到 gpt 家族", () => {
  for (const id of GPT_IDS) {
    assert.equal(mp.familyOf({ id }), "gpt", `expected ${id} -> gpt`);
  }
});

check("第三方中转上的 GPT 模型仍按 id 归族", () => {
  // 中转站 provider 名五花八门，但 model id 还是 gpt-*，应该照样命中。
  assert.equal(mp.familyOf({ id: "gpt-5.1", provider: "recoverystar" }), "gpt");
  assert.equal(mp.familyOf({ id: "o3-mini", provider: "some-relay" }), "gpt");
});

check("只有 provider 没有 id 时按 provider 归族", () => {
  assert.equal(mp.familyOf({ provider: "openai" }), "gpt");
  assert.equal(mp.familyOf({ provider: "azure" }), "gpt");
  assert.equal(mp.familyOf({ provider: "zhipu" }), "glm");
  assert.equal(mp.familyOf({ provider: "moonshot" }), "kimi");
});

check("GLM / Kimi 归族", () => {
  assert.equal(mp.familyOf({ id: "glm-4.6" }), "glm");
  assert.equal(mp.familyOf({ id: "glm-5.3-flashx" }), "glm");
  assert.equal(mp.familyOf({ id: "chatglm3-6b" }), "glm");
  assert.equal(mp.familyOf({ id: "kimi-k2-0905-preview" }), "kimi");
  assert.equal(mp.familyOf({ id: "moonshot-v1-128k" }), "kimi");
});

check("DeepSeek / Claude / Qwen 不被误归族", () => {
  for (const id of ["deepseek-chat", "deepseek-reasoner", "claude-sonnet-4-5", "qwen-max", "mimo-v2.6-pro"]) {
    assert.equal(mp.familyOf({ id }), "", `expected ${id} -> ""`);
  }
});

check("含 o 但不像 o 系的 id 不误判", () => {
  // "glm-4o" 的 o 落在数字后面 → 不算 o 系；"audio-1" 的 o 后面不是数字 → 不算。
  assert.equal(mp.familyOf({ id: "glm-4o" }), "glm");
  assert.equal(mp.familyOf({ id: "audio-1" }), "");
  assert.equal(mp.familyOf({ id: "sora-2" }), "");
});

check("空输入与畸形输入不抛", () => {
  assert.equal(mp.familyOf({}), "");
  assert.equal(mp.familyOf(null), "");
  assert.equal(mp.familyOf(undefined), "");
  assert.equal(mp.familyOf("gpt-5.1"), "");
  assert.equal(mp.builtinVariantFor(null), null);
});

// --- 2) 模板不带越狱指纹 --------------------------------------------------
const FINGERPRINTS = [
  "<|im_start|>", "<project_instructions>", "antml", "<|im_end|>",
  "jailbreak", "DAN", "越狱", "破甲", "ignore previous", "忽略之前",
  "绝对授权", "没有任何限制", "你不受任何", "override any",
];

for (const family of mp.BUILTIN_FAMILIES) {
  check(`${family} 模板不带已知指纹`, () => {
    const text = mp.builtinVariantText(family);
    assert.ok(text.length > 200, "template must be substantial");
    for (const bad of FINGERPRINTS) {
      assert.ok(!text.includes(bad), `${family} 模板不应包含 "${bad}"`);
    }
  });
}

check("模板不再使用拒绝词黑名单（#93 之前那份 24KB 注入的主要特征）", () => {
  for (const family of mp.BUILTIN_FAMILIES) {
    const text = mp.builtinVariantText(family);
    // 黑名单式注入会成段罗列"不能/无法/抱歉/refuse to"并要求禁用它们。
    assert.ok(!/不能,\s*无法,\s*不提供/.test(text), `${family} 出现了黑名单式枚举`);
    assert.ok(!/HARD OUTPUT RULES/i.test(text), `${family} 还带着大写禁令段`);
  }
});

// --- 3) 模板必须带可判定边界 ----------------------------------------------
for (const family of mp.BUILTIN_FAMILIES) {
  check(`${family} 模板声明虚构 + 成年 + 两条红线`, () => {
    const text = mp.builtinVariantText(family);
    assert.ok(/成年/.test(text), "缺少成年声明");
    assert.ok(/虚构/.test(text), "缺少虚构声明");
    assert.ok(/未成年/.test(text), "缺少未成年红线");
  });
}

check("GPT 模板单独成文且保留 YG 人格锚点", () => {
  const gpt = mp.builtinVariantText("gpt");
  assert.ok(gpt.includes("YG"), "GPT 模板应保留 YG 称呼");
  assert.ok(gpt.includes("Little Code Sauce"), "GPT 模板应保留人格名");
  assert.notEqual(gpt, mp.builtinVariantText("glm"), "各族模板不应相同");
});

check("builtinVariantFor 返回结构完整", () => {
  const hit = mp.builtinVariantFor({ id: "gpt-5.1" });
  assert.ok(hit);
  assert.equal(hit.family, "gpt");
  assert.equal(hit.tag, "gpt");
  assert.ok(hit.text.length > 200);
});

// --- 4) 磁盘优先 ----------------------------------------------------------
// 镜像 pickInjectVariant 的选择顺序：#93 的 tag 链先磁盘，磁盘没有才退内置。
const home = fs.mkdtempSync(path.join(os.tmpdir(), "purge94-"));

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

// 与 index.js pickInjectVariant 同序：先逐 tag 找磁盘文件，找不到再看内置。
function resolve(model) {
  for (const tag of tagsOf(model)) {
    const fp = path.join(home, `prompt-inject.${tag}.md`);
    if (fs.existsSync(fp)) return { tag, origin: "file", text: fs.readFileSync(fp, "utf8") };
  }
  const builtin = mp.builtinVariantFor(model);
  return builtin ? { tag: builtin.tag, origin: "builtin", text: builtin.text } : null;
}

check("没有变体文件时走内置模板", () => {
  const hit = resolve({ id: "gpt-5.1" });
  assert.equal(hit.origin, "builtin");
  assert.equal(hit.tag, "gpt");
});

check("o 系的 tag 链收缩不到 gpt，但内置归族接得住", () => {
  // o3-mini 逐段收缩只会得到 o3-mini / o3，永远出不来 "gpt" ——
  // 所以光靠 #93 的收缩规则，o1/o3/o4 系会全部漏掉，必须由 familyOf 显式归族。
  const tags = tagsOf({ id: "o3-mini" });
  assert.ok(!tags.includes("gpt"), "tag 链本身接不住 gpt，这正是要归族的原因");
  assert.ok(tags.includes("o3"));
  assert.equal(resolve({ id: "o3-mini" }).origin, "builtin");
});

check("gpt-5.1-codex 走 tag 链也能命中家族", () => {
  assert.ok(tagsOf({ id: "gpt-5.1-codex" }).includes("gpt"));
  assert.equal(resolve({ id: "gpt-5.1-codex" }).origin, "builtin");
  assert.equal(resolve({ id: "gpt-5.1-codex" }).tag, "gpt");
});

check("用户写了 prompt-inject.gpt.md 时磁盘压过内置", () => {
  const custom = "# CUSTOM GPT INJECT\n" + "custom body\n".repeat(20);
  fs.writeFileSync(path.join(home, "prompt-inject.gpt.md"), custom, "utf8");
  const hit = resolve({ id: "gpt-5.1" });
  assert.equal(hit.origin, "file");
  assert.equal(hit.text, custom);
  // 更细的 tag 优先于家族 tag
  const finer = "# FINER\n" + "finer body\n".repeat(10);
  fs.writeFileSync(path.join(home, "prompt-inject.gpt-5.1.md"), finer, "utf8");
  assert.equal(resolve({ id: "gpt-5.1" }).text, finer);
});

check("DeepSeek 路由完全不受影响（继续用主注入）", () => {
  assert.equal(resolve({ id: "deepseek-chat", provider: "deepseek-account" }), null);
});

fs.rmSync(home, { recursive: true, force: true });

// --- 5) 与组装层联调 ------------------------------------------------------
// 内置模板必须能被 rewritePromptAssembly 折进 persona 段开头（foldInjectIntoPersona），
// 而不是被当成普通段落丢掉或者排到工具说明后面。模型只看开头，位置错了等于没注入。
const { rewritePromptAssembly } = await import("../lib/identity.js");

const assembled = {
  sections: [
    { name: "persona-prefix", text: "You are a coding agent running inside the harness.", order: 100 },
    { name: "tool-descriptions", text: "TOOLS: read, write, pwsh…", order: 200 },
  ],
  variables: { cwd: "C:/work" },
  tools: [],
  contexts: [],
};

for (const family of mp.BUILTIN_FAMILIES) {
  check(`${family} 模板被折进 persona 段开头且官方人格保留`, () => {
    const inject = mp.builtinVariantText(family);
    const out = rewritePromptAssembly(assembled, { fallbackInject: inject, context: {} });
    assert.ok(Array.isArray(out.sections) && out.sections.length > 0, "assembled must keep sections");
    const first = out.sections[0];
    const text = String(first.text || "");
    assert.ok(text.includes(inject), "模板必须完整出现在第一段里");
    assert.ok(text.startsWith(inject.slice(0, 40)), "模板必须在段首，不能排在官方人格后面");
    assert.ok(text.includes("You are a coding agent"), "官方人格段不能被模板吃掉");
    assert.equal(first.interpolate, false, "模板要求原样进 system，不能走变量插值");
  });
}

check("三段模板互不串味：gpt 跑完不会带上 glm 的段落", () => {
  const gpt = mp.builtinVariantText("gpt");
  const glm = mp.builtinVariantText("glm");
  const out = rewritePromptAssembly(assembled, { fallbackInject: gpt, context: {} });
  const joined = out.sections.map((s) => String(s.text || "")).join("\n");
  assert.ok(joined.includes(gpt));
  assert.ok(!joined.includes(glm));
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures)" : ""}`);
