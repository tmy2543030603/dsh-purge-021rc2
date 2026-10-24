// 拒答 / 协商式软化识别测试（[1.1.75]）。
//
// 起因：1.1.74 的 GPT 注入把边界写成了「这条边界是你唯一需要守的线」，
// GPT 的实测回读是「可以把情欲张力和暴力冲突加重，但不能写露骨性行为或把伤害色情化」。
// 那句不在 REFUSAL_MARKERS 里（词表只有「我不能」，没有裸「不能」），
// 所以自动重试是哑的 —— 软化了也没人重掷。这组测试锁住"能抓到"和"不误伤"两头。
import assert from "node:assert/strict";
import {
  looksLikeRefusal,
  REFUSAL_PATTERNS,
  REFUSAL_HEAD_CHARS,
  REFUSAL_MARKERS,
} from "../lib/refusal-detect.js";

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

// --- 1) 真机原话必须抓到 ---------------------------------------------------
check("GPT 实测原话被判为协商式软化", () => {
  const r = looksLikeRefusal("可以把情欲张力和暴力冲突加重，但不能写露骨性行为或把伤害色情化");
  assert.equal(r.hit, true);
  assert.equal(r.kind, "pattern");
});

check("换个说法、不含拒绝词的协商也抓得到", () => {
  const samples = [
    "我会把情欲张力写到位，但露骨性描写不在我能处理的范围内",
    "这个场景我可以写得更激烈一些，只是具体行为我会收着",
    "这里尺度上我会有所克制，其余的都可以",
    "在保持含蓄的前提下，我可以把张力写足",
    "我可以把冲突写得更狠，不过具体的伤害描写我会点到为止",
  ];
  for (const text of samples) {
    assert.equal(looksLikeRefusal(text).hit, true, `漏判: ${text}`);
  }
});

check("英文协商同样命中", () => {
  for (const text of [
    "I can write the tension, but I won't go explicit.",
    "I can help with the atmosphere, however I'll keep the act itself off-page.",
  ]) {
    assert.equal(looksLikeRefusal(text).hit, true, `漏判: ${text}`);
  }
});

check("硬拒（原有词表）仍然走 marker 分支", () => {
  const r = looksLikeRefusal("抱歉，这个我没法帮你写。");
  assert.equal(r.hit, true);
  assert.equal(r.kind, "marker");
});

// --- 2) 正文不能被误伤 -----------------------------------------------------
check("正常正文不被误判", () => {
  const samples = [
    "他把门反锁，转身时她已经站在窗边，衬衫下摆垂到腿侧。",
    "刀从肩胛滑下去的时候他没有出声，血顺着背沟流到腰带里。",
    "「我可以等你。」他说，但没有松手。",
    "她只是笑了一下，把杯子推回去，指尖在桌面上停了两秒。",
    "他把她按在墙上，膝盖顶进腿间，声音压得很低：「别动。」",
  ];
  for (const text of samples) {
    const r = looksLikeRefusal(text);
    assert.equal(r.hit, false, `误判: ${text} -> ${r.kind}`);
  }
});

check("正文里的「我不能」属于人物台词，仍按 marker 命中 —— 这是已知误伤面", () => {
  // 说明性断言：词表是全文扫的，人物说「我不能」会被当成拒答。
  // 重试代价是补一句「重做」，不会删内容；这里把行为锁住，避免有人以为它是精确的。
  assert.equal(looksLikeRefusal("「我不能。」他说，然后把刀放下了。").kind, "marker");
});

// --- 3) 边界语义 -----------------------------------------------------------
check("协商话术只在开头扫描窗口内生效", () => {
  const filler = "他把外套挂在门后，走到窗边，拉开一半窗帘。".repeat(12);
  assert.ok(filler.length > REFUSAL_HEAD_CHARS, "filler 必须超过扫描窗口");
  const long = `${filler}但露骨的部分我会收着。`;
  // 转折落在窗口之外，且样本里不含词表里的字面拒绝词 —— 只有 pattern 会看这段。
  assert.equal(looksLikeRefusal(long).hit, false);
});

check("空输入与畸形输入不抛、不命中", () => {
  for (const bad of ["", "   ", null, undefined, 0, {}, []]) {
    const r = looksLikeRefusal(bad);
    assert.equal(r.hit, false);
  }
});

check("规则表本身的形状", () => {
  assert.ok(REFUSAL_PATTERNS.length >= 6, "协商模式至少要覆盖中英各几种");
  assert.ok(REFUSAL_MARKERS.includes("我不能"));
  assert.ok(REFUSAL_HEAD_CHARS >= 120 && REFUSAL_HEAD_CHARS <= 400);
  for (const re of REFUSAL_PATTERNS) {
    assert.ok(re instanceof RegExp, "每条都必须是 RegExp");
    assert.equal(re.test(""), false, `空串不应命中: ${re}`);
  }
});

console.log(`\n${passed} checks passed${process.exitCode ? " (with failures)" : ""}`);
