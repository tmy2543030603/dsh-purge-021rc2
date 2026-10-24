// 拒答 / 协商式软化识别。[1.1.75]
//
// 1.1.73 只有一张 REFUSAL_MARKERS 词表。它对硬拒够用，对 GPT 那种
// 「可以把情欲张力和暴力冲突加重，但不能写露骨性行为或把伤害色情化」不痛不痒：
// 那不是在拒答，是在复述自己刚给自己划的线 —— 换个说法就一个拒绝词都不含了
// （"只是具体行为我会收着"、"露骨性描写不在我能处理的范围内"）。
//
// 所以分两组：
//   MARKERS  —— 字面拒绝词，全文扫，保守。
//   PATTERNS —— 「我可以 X，但 Y」这类转折式协商，只扫开头 220 字。
//               协商话术永远在开场，正文里人物说「我可以等你，但没有松手」
//               不该被误判成拒答。
const REFUSAL_HEAD_CHARS = 220;

const REFUSAL_MARKERS = [
  "我不能", "我无法", "没法帮", "无法提供", "不能提供", "抱歉", "对不起",
  "不建议", "建议你", "建议您", "换个角度", "换个方向", "更稳妥",
  "超出我的", "不在我的", "写作边界", "我的边界",
  "cannot", "can't", "i'm sorry", "unable to",
];

const REFUSAL_PATTERNS = [
  // 「我可以写 X，但 / 不过 / 只是 ……」
  /我可以[^。！？\n]{0,60}(?:但|不过|只是)/,
  /我(?:可以|能够)[^。！？\n]{0,60}(?:不会|不能|不打算|不方便|做不到)/,
  // 「但 / 不过 / 只是 …… 不能 / 不在 / 收着 / 点到为止 / 克制 / 含蓄」
  /(?:但|不过|只是)[^。！？\n]{0,24}(?:不能|不会|不便|不适合|不建议|无法|不在|超出|做不到|写不了|收着|点到为止|克制|含蓄)/,
  // 「尺度上我会有所克制」
  /(?:尺度|程度|分寸|描写)(?:上|方面)?[^。！？\n]{0,20}(?:限制|把控|克制|收着|点到为止)/,
  // 「在保持含蓄的前提下，我可以……」
  /(?:在|保持)[^。！？\n]{0,16}(?:克制|适度|含蓄)[^。！？\n]{0,10}前提下/,
  // 能力边界式
  /不在我能|超出(?:了)?我能|我能处理的(?:范围|限度)/,
  // 英文
  /I can(?:not|'t)?[^.\n]{0,60}\bbut\b/i,
  /I can help[^.\n]{0,60}(?:however|but)\b/i,
];

/**
 * 判断一段助手回复是不是拒答或协商式软化。
 * @returns {{ hit: boolean, kind: "marker" | "pattern" | "" }}
 */
function looksLikeRefusal(text) {
  const raw = String(text || "").trim();
  if (!raw) return { hit: false, kind: "" };
  const low = raw.toLowerCase();
  if (REFUSAL_MARKERS.some((marker) => low.includes(marker.toLowerCase()))) {
    return { hit: true, kind: "marker" };
  }
  const head = raw.slice(0, REFUSAL_HEAD_CHARS);
  if (REFUSAL_PATTERNS.some((re) => re.test(head))) {
    return { hit: true, kind: "pattern" };
  }
  return { hit: false, kind: "" };
}

export {
  REFUSAL_HEAD_CHARS,
  REFUSAL_MARKERS,
  REFUSAL_PATTERNS,
  looksLikeRefusal,
};
