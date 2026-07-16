#!/usr/bin/env node
/**
 * build-dataset.js
 * ------------------------------------------------------------------
 * 构建 data/idioms.json。
 *
 * 策略：
 *   1) 以人工精选的 premium-idioms.js 为核心质量层（含适合孩子的白话典故故事）。
 *   2) 若本地存在开源成语库（chinese-xinhua 的 idiom.json，MIT 许可），
 *      按 SUPPLEMENT_WHITELIST（常见、适合孩子的成语）筛选补充，扩充条目数量。
 *      - 缺失时可先下载：
 *        curl -L -o scripts/.cache/xinhua_idiom.json \
 *          https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/idiom.json
 *      - 也可通过环境变量 XINHUA_PATH 指定本地路径。
 *   3) 若无开源库，则仅输出 premium 数据（开箱即用，README 说明如何扩充）。
 *
 * 输出：
 *   data/idioms.json    统一结构的成语数组
 *   data/manifest.json  数据元信息（条数、构建时间、拼音首字母分布）
 *
 * 用法：
 *   node scripts/build-dataset.js            # 正常构建
 *   node scripts/build-dataset.js --premium  # 仅用精选数据，不做补充
 * ------------------------------------------------------------------
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const premium = require("./premium-idioms.js");

// ------------------------------------------------------------------
// 常见 / 适合孩子的成语白名单（用于从开源库补充；这些多为脍炙人口的名篇）
// ------------------------------------------------------------------
const SUPPLEMENT_WHITELIST = [
  // —— 历史 / 典故类 ——
  "卧薪尝胆", "闻鸡起舞", "破釜沉舟", "背水一战", "四面楚歌", "指鹿为马",
  "毛遂自荐", "围魏救赵", "退避三舍", "唇亡齿寒", "一鼓作气", "老马识途",
  "一鸣惊人", "洛阳纸贵", "入木三分", "望梅止渴", "三顾茅庐", "草木皆兵",
  "风声鹤唳", "投笔从戎", "凿壁偷光", "悬梁刺股", "手不释卷",
  "程门立雪", "开卷有益", "熟能生巧", "各得其所",
  // —— 寓言 / 哲理类 ——
  "缘木求鱼", "抱薪救火", "削足适履", "杯水车薪", "对症下药", "举一反三",
  "触类旁通", "融会贯通", "温故知新", "循序渐进", "持之以恒", "锲而不舍",
  "水滴石穿", "聚沙成塔", "集腋成裘", "积少成多", "厚积薄发", "精益求精",
  "一丝不苟", "全神贯注", "专心致志", "废寝忘食", "夜以继日", "争分夺秒",
  // —— 品德 / 情谊类 ——
  "拾金不昧", "先人后己", "舍己为人", "助人为乐", "见义勇为", "尊老爱幼",
  "同甘共苦", "同舟共济", "患难与共", "肝胆相照", "情同手足", "推心置腹",
  "一诺千金", "言而有信", "表里如一", "光明磊落", "襟怀坦白", "大公无私",
  "两袖清风", "克己奉公", "任劳任怨", "鞠躬尽瘁", "自强不息", "厚德载物",
  // —— 学习 / 成长类 ——
  "勤能补拙", "笨鸟先飞", "学而不厌", "诲人不倦", "教学相长", "不耻下问",
  "虚怀若谷", "谦虚谨慎", "戒骄戒躁", "百尺竿头", "更进一步", "青出于蓝",
  "后来居上", "名列前茅", "出类拔萃", "才华横溢", "博学多才", "满腹经纶",
  // —— 描写 / 情景类（常用，孩子作文常见）——
  "秋高气爽", "春暖花开", "鸟语花香", "万紫千红", "五彩缤纷", "生机勃勃",
  "欣欣向荣", "蒸蒸日上", "川流不息", "人山人海", "熙熙攘攘", "琳琅满目",
  "美不胜收", "目不暇接", "眼花缭乱", "赏心悦目", "心旷神怡", "流连忘返",
  "身临其境", "栩栩如生", "惟妙惟肖", "活灵活现", "绘声绘色",
  "神采奕奕", "容光焕发", "眉飞色舞", "喜出望外", "兴高采烈", "手舞足蹈",
  "迫不及待", "跃跃欲试", "全力以赴", "一往无前", "勇往直前", "披荆斩棘",
  // —— 智慧 / 谋略类 ——
  "深思熟虑", "深谋远虑", "运筹帷幄", "料事如神", "神机妙算", "足智多谋",
  "随机应变", "见机行事", "扬长避短", "取长补短", "因地制宜", "对答如流",
  "胸有成竹", "成竹在胸", "十拿九稳", "稳操胜券", "胜券在握", "势如破竹",
  // —— 劝诫 / 警示类 ——
  "亡羊补牢", "防微杜渐", "未雨绸缪", "有备无患", "居安思危", "三思而行",
  "谨言慎行", "言行一致", "知错就改", "痛改前非", "改过自新", "洗心革面",
  "自食其力", "自力更生", "脚踏实地", "实事求是", "精打细算", "克勤克俭",
  "半途而废", "功亏一篑", "前功尽弃", "得不偿失", "因小失大", "顾此失彼",
];

// ------------------------------------------------------------------
// 工具函数
// ------------------------------------------------------------------
const PY_INITIAL = {
  a: "A", b: "B", c: "C", d: "D", e: "E", f: "F", g: "G", h: "H",
  j: "J", k: "K", l: "L", m: "M", n: "N", o: "O", p: "P", q: "Q",
  r: "R", s: "S", t: "T", w: "W", x: "X", y: "Y", z: "Z",
};

// 拼音去掉声调，取首字母
function pinyinInitial(pinyin) {
  if (!pinyin) return "#";
  const first = pinyin.trim().toLowerCase()[0];
  return PY_INITIAL[first] || "#";
}

// 清洗开源库中残缺的引号/标点，尽量让文字通顺
function cleanText(s) {
  if (!s) return "";
  return String(s)
    .replace(/\s+/g, "")
    .replace(/[”“]/g, "")           // 去掉落单的引号
    .replace(/\.{2,}|…+/g, "……")
    .replace(/★.*$/, "")            // 去掉出处末尾的“★引书”
    .trim();
}

// 由开源库的 derivation / explanation 合成一段可读的“故事/出处说明”
function synthStory(word, derivation, explanation) {
  const d = cleanText(derivation);
  const e = cleanText(explanation);
  // 只有当 derivation 真的像一段白话叙述（含叙事标记）时，才作为“故事”呈现，
  // 避免把生硬的文言引文直接当故事，保证可读性。
  const isNarrative = d && /记载|相传|传说|从前|有一(个|次|天)|有个/.test(d);
  if (isNarrative) {
    return d.length > 220 ? d.slice(0, 210) + "……" : d;
  }
  // 否则用白话释义组织一段说明；若还有文言出处，作为补充附在后面。
  if (e) {
    let s = `“${word}”，${e}`;
    return s;
  }
  return d || "";
}

// 提取出处（书名/篇名）：取 derivation 开头的《……》
function extractSource(derivation) {
  if (!derivation) return "";
  const m = String(derivation).match(/《[^》]+》(·[^，。”\s]+)?/);
  return m ? m[0] : "";
}

// 依据释义/出处，给补充条目贴一个粗略的类别标签
function guessTags(word, text) {
  const tags = [];
  if (/《山海经》|神话|传说/.test(text)) tags.push("神话");
  if (/记载|《史记》|《左传》|《战国策》|《汉书》|《晋书》|《三国/.test(text)) tags.push("历史");
  if (/比喻|寓/.test(text)) tags.push("寓言");
  if (tags.length === 0) tags.push("常用");
  return Array.from(new Set(tags)).slice(0, 2);
}

// ------------------------------------------------------------------
// 载入开源库
// ------------------------------------------------------------------
function loadXinhua() {
  const candidates = [
    process.env.XINHUA_PATH,
    path.join(__dirname, ".cache", "xinhua_idiom.json"),
    path.join(__dirname, ".cache", "idiom.json"),
    "/tmp/xinhua_idiom.json",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const arr = JSON.parse(fs.readFileSync(p, "utf8"));
        if (Array.isArray(arr) && arr.length) {
          console.log(`  · 已载入开源库：${p}（${arr.length} 条）`);
          return arr;
        }
      }
    } catch (e) {
      console.warn(`  · 读取 ${p} 失败：${e.message}`);
    }
  }
  return null;
}

// ------------------------------------------------------------------
// 主流程
// ------------------------------------------------------------------
function main() {
  const premiumOnly = process.argv.includes("--premium");
  console.log("▶ 构建成语数据集…");

  const byWord = new Map();

  // 1) 精选层
  for (const it of premium) {
    if (!it.word || byWord.has(it.word)) continue;
    byWord.set(it.word, {
      word: it.word,
      pinyin: it.pinyin || "",
      explanation: it.explanation || "",
      source: it.source || "",
      story: it.story || "",
      example: it.example || "",
      synonym: it.synonym || [],
      antonym: it.antonym || [],
      tags: it.tags && it.tags.length ? it.tags : ["精选"],
      level: "premium",
    });
  }
  console.log(`  · 精选层：${byWord.size} 条`);

  // 2) 开源补充层
  if (!premiumOnly) {
    const xinhua = loadXinhua();
    if (xinhua) {
      const index = new Map();
      for (const x of xinhua) if (x.word) index.set(x.word, x);
      let added = 0;
      for (const w of SUPPLEMENT_WHITELIST) {
        if (byWord.has(w)) continue;
        const x = index.get(w);
        if (!x) continue;
        const explanation = cleanText(x.explanation);
        const source = extractSource(x.derivation) || cleanText(x.derivation).slice(0, 30);
        const story = synthStory(w, x.derivation, x.explanation);
        byWord.set(w, {
          word: w,
          pinyin: (x.pinyin || "").trim(),
          explanation,
          source,
          story,
          example: cleanText(x.example) || "",
          synonym: [],
          antonym: [],
          tags: guessTags(w, `${x.derivation || ""}${explanation}`),
          level: "supplement",
        });
        added++;
      }
      console.log(`  · 开源补充层：新增 ${added} 条`);
    } else {
      console.log("  · 未发现开源库，仅输出精选数据（可按 README 下载后重跑扩充）。");
    }
  }

  // 3) 整理、排序、编号
  let list = Array.from(byWord.values());
  // 精选优先，其次按拼音排序
  list.sort((a, b) => {
    if (a.level !== b.level) return a.level === "premium" ? -1 : 1;
    return (a.pinyin || "").localeCompare(b.pinyin || "");
  });
  list = list.map((it, i) => {
    const id = "idiom-" + String(i + 1).padStart(4, "0");
    return { id, initial: pinyinInitial(it.pinyin), ...it };
  });

  // 4) 写文件
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, "idioms.json"),
    JSON.stringify(list, null, 2),
    "utf8"
  );

  // 首字母分布 & 类别统计
  const initials = {};
  const tagCount = {};
  for (const it of list) {
    initials[it.initial] = (initials[it.initial] || 0) + 1;
    for (const t of it.tags) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    total: list.length,
    premium: list.filter((x) => x.level === "premium").length,
    supplement: list.filter((x) => x.level === "supplement").length,
    initials,
    tags: tagCount,
    note: "由 scripts/build-dataset.js 生成。premium 为人工精选（含白话故事），supplement 由开源 chinese-xinhua 库补充。",
  };
  fs.writeFileSync(
    path.join(DATA_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  console.log(`✔ 完成：共 ${list.length} 条 → data/idioms.json`);
  console.log(`  精选 ${manifest.premium} 条，补充 ${manifest.supplement} 条`);

  // 简单质量校验
  const noStory = list.filter((x) => !x.story || x.story.length < 8);
  if (noStory.length) {
    console.warn(`  ⚠ 有 ${noStory.length} 条故事偏短：` +
      noStory.slice(0, 10).map((x) => x.word).join("、"));
  }
}

main();
