/* =====================================================================
   成语故事 · 前端逻辑（原生 JavaScript，零依赖）
   - fetch data/idioms.json → 今日哈希选成语渲染主卡
   - 检索 / 换一个 / 收藏 / 认识了 / 待学习 / 复制 / 朗读 / 历史回看
   - 所有个人数据存 localStorage，完全离线
   ===================================================================== */
(function () {
  "use strict";

  // -------------------------- 状态 --------------------------
  const state = {
    all: [],            // 全部成语
    premium: [],        // 精选池（今日成语从这里确定性选取，保证故事质量）
    byWord: new Map(),
    view: "all",        // all | fav | known | tolearn | history
    tag: "",            // 类别筛选
    alpha: "",          // 首字母筛选
    q: "",              // 搜索词
    hero: null,         // 当前主卡成语
  };

  // -------------------------- 本地存储 --------------------------
  const LS = {
    fav: "idiom.fav",
    known: "idiom.known",
    tolearn: "idiom.tolearn",
  };
  function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
    catch (e) { return new Set(); }
  }
  function saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) {}
  }
  const store = {
    fav: loadSet(LS.fav),
    known: loadSet(LS.known),
    tolearn: loadSet(LS.tolearn),
  };
  function toggle(setName, id) {
    const s = store[setName];
    if (s.has(id)) s.delete(id); else s.add(id);
    // “认识了 / 待学习”互斥
    if (setName === "known" && s.has(id)) store.tolearn.delete(id);
    if (setName === "tolearn" && s.has(id)) store.known.delete(id);
    saveSet(LS.fav, store.fav);
    saveSet(LS.known, store.known);
    saveSet(LS.tolearn, store.tolearn);
    return s.has(id);
  }

  // -------------------------- 工具 --------------------------
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // 日期 → YYYYMMDD 数字（按本地时区，保证“同一天”直观）
  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }
  // 简单确定性哈希（字符串 → 32bit 无符号整数）
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  // 给定日期，从精选池中确定性选出“今日成语”
  function pickForDate(d) {
    const pool = state.premium.length ? state.premium : state.all;
    if (!pool.length) return null;
    const idx = hashStr(dateKey(d)) % pool.length;
    return pool[idx];
  }
  function fmtDateCN(d) {
    const wk = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${wk}`;
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 1600);
  }

  // -------------------------- 朗读（speechSynthesis） --------------------------
  const speech = {
    supported: "speechSynthesis" in window,
    speaking: false,
    btn: null,
    stop() {
      if (this.supported) window.speechSynthesis.cancel();
      this.speaking = false;
      if (this.btn) { this.btn.classList.remove("reading"); this.setLabel(this.btn, false); }
    },
    setLabel(btn, on) {
      if (!btn) return;
      btn.querySelector(".txt").textContent = on ? "停止" : "朗读";
      btn.querySelector(".ico").textContent = on ? "⏹" : "🔊";
    },
    read(text, btn) {
      if (!this.supported) { toast("当前浏览器不支持朗读"); return; }
      if (this.speaking) { this.stop(); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 0.92;    // 稍慢，方便讲给孩子听
      u.pitch = 1.05;
      const zh = window.speechSynthesis.getVoices().find(v => /zh|Chinese|中文/i.test(v.lang + v.name));
      if (zh) u.voice = zh;
      u.onend = u.onerror = () => this.stop();
      this.btn = btn;
      this.speaking = true;
      if (btn) { btn.classList.add("reading"); this.setLabel(btn, true); }
      window.speechSynthesis.speak(u);
    },
  };
  if (speech.supported) { window.speechSynthesis.onvoiceschanged = () => {}; }

  // -------------------------- 渲染：主卡 --------------------------
  function synAntHTML(item) {
    const syn = (item.synonym || []).map(w =>
      `<span class="word-tag" data-jump="${esc(w)}">${esc(w)}</span>`).join("");
    const ant = (item.antonym || []).map(w =>
      `<span class="word-tag ant" data-jump="${esc(w)}">${esc(w)}</span>`).join("");
    if (!syn && !ant) return "";
    return `<div class="sec">
      <p class="sec-title">近义 / 反义</p>
      <div class="syn-ant">
        <div class="col"><span class="lab">近义词</span>${syn || '<span class="lab">—</span>'}</div>
        <div class="col"><span class="lab">反义词</span>${ant || '<span class="lab">—</span>'}</div>
      </div>
    </div>`;
  }

  function heroHTML(item, isToday) {
    const id = item.id;
    const fav = store.fav.has(id);
    const known = store.known.has(id);
    const tolearn = store.tolearn.has(id);
    return `
      <div class="hero-top">
        <div>
          <p class="hero-pinyin">${esc(item.pinyin)}</p>
          <h2 class="hero-word">${esc(item.word)}</h2>
        </div>
        <div class="hero-stamp">${isToday ? "今日<br>成语" : "成语<br>卡片"}</div>
      </div>
      <p class="hero-explain">${esc(item.explanation)}</p>

      <div class="hero-sections">
        ${item.source ? `<div class="sec">
          <p class="sec-title">出处</p>
          <div class="sec-body">${esc(item.source)}</div>
        </div>` : ""}
        ${item.story ? `<div class="sec story">
          <p class="sec-title">典故故事</p>
          <div class="sec-body">${esc(item.story)}</div>
        </div>` : ""}
        ${item.example ? `<div class="sec example">
          <p class="sec-title">例句</p>
          <div class="sec-body">${esc(item.example)}</div>
        </div>` : ""}
        ${synAntHTML(item)}
      </div>

      <div class="hero-actions">
        <button class="btn" id="actRead" aria-pressed="false">
          <span class="ico">🔊</span><span class="txt">朗读</span>
        </button>
        <button class="btn primary" id="actShuffle"><span class="ico">🎲</span><span class="txt">换一个</span></button>
        <button class="btn ${fav ? "is-on" : ""}" id="actFav" aria-pressed="${fav}">
          <span class="ico">${fav ? "★" : "☆"}</span><span class="txt">${fav ? "已收藏" : "收藏"}</span>
        </button>
        <button class="btn ${known ? "is-on known" : ""}" id="actKnown" aria-pressed="${known}">
          <span class="ico">✅</span><span class="txt">${known ? "已认识" : "认识了"}</span>
        </button>
        <button class="btn ${tolearn ? "is-on" : ""}" id="actToLearn" aria-pressed="${tolearn}">
          <span class="ico">📌</span><span class="txt">${tolearn ? "待学习中" : "待学习"}</span>
        </button>
        <button class="btn" id="actCopy"><span class="ico">📋</span><span class="txt">复制</span></button>
      </div>
    `;
  }

  function renderHero(item, isToday) {
    speech.stop();
    state.hero = item;
    const card = $("#heroCard");
    card.innerHTML = heroHTML(item, isToday);
    bindHeroActions(item);
  }

  function plainText(item) {
    return [
      `${item.word}（${item.pinyin}）`,
      `释义：${item.explanation}`,
      item.source ? `出处：${item.source}` : "",
      item.story ? `典故：${item.story}` : "",
      item.example ? `例句：${item.example}` : "",
      (item.synonym && item.synonym.length) ? `近义：${item.synonym.join("、")}` : "",
      (item.antonym && item.antonym.length) ? `反义：${item.antonym.join("、")}` : "",
    ].filter(Boolean).join("\n");
  }

  function bindHeroActions(item) {
    const card = $("#heroCard");
    $("#actShuffle", card).addEventListener("click", () => {
      const pool = state.all;
      let next = item;
      if (pool.length > 1) { while (next.id === item.id) next = pool[Math.floor(Math.random() * pool.length)]; }
      renderHero(next, false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("#actRead", card).addEventListener("click", (e) => {
      const text = `${item.word}。${item.explanation}。${item.story || ""}`;
      speech.read(text, e.currentTarget);
    });
    $("#actFav", card).addEventListener("click", (e) => {
      const on = toggle("fav", item.id);
      e.currentTarget.classList.toggle("is-on", on);
      $(".ico", e.currentTarget).textContent = on ? "★" : "☆";
      $(".txt", e.currentTarget).textContent = on ? "已收藏" : "收藏";
      toast(on ? "已加入收藏夹" : "已取消收藏");
      if (state.view === "fav") renderResults();
    });
    $("#actKnown", card).addEventListener("click", (e) => {
      const on = toggle("known", item.id);
      e.currentTarget.classList.toggle("is-on", on);
      e.currentTarget.classList.toggle("known", on);
      $(".txt", e.currentTarget).textContent = on ? "已认识" : "认识了";
      // 同步“待学习”按钮
      const tl = $("#actToLearn", card);
      tl.classList.toggle("is-on", store.tolearn.has(item.id));
      $(".txt", tl).textContent = store.tolearn.has(item.id) ? "待学习中" : "待学习";
      toast(on ? "标记为「认识了」" : "已取消标记");
      if (state.view === "known" || state.view === "tolearn") renderResults();
    });
    $("#actToLearn", card).addEventListener("click", (e) => {
      const on = toggle("tolearn", item.id);
      e.currentTarget.classList.toggle("is-on", on);
      $(".txt", e.currentTarget).textContent = on ? "待学习中" : "待学习";
      const kn = $("#actKnown", card);
      kn.classList.toggle("is-on", store.known.has(item.id));
      kn.classList.toggle("known", store.known.has(item.id));
      $(".txt", kn).textContent = store.known.has(item.id) ? "已认识" : "认识了";
      toast(on ? "加入「待学习」" : "已移出待学习");
      if (state.view === "known" || state.view === "tolearn") renderResults();
    });
    $("#actCopy", card).addEventListener("click", () => {
      const text = plainText(item);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast("已复制到剪贴板"), () => fallbackCopy(text));
      } else fallbackCopy(text);
    });
    // 近义/反义词跳转
    $$(".word-tag[data-jump]", card).forEach(el => {
      el.addEventListener("click", () => {
        const w = el.getAttribute("data-jump");
        const target = state.byWord.get(w);
        if (target) { openDetail(target); }
        else { $("#searchInput").value = w; state.q = w; setView("all"); syncSearchClear(); renderResults(); toast(`搜索「${w}」`); }
      });
    });
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("已复制到剪贴板"); }
    catch (e) { toast("复制失败，请手动选择"); }
    document.body.removeChild(ta);
  }

  // -------------------------- 渲染：结果列表 --------------------------
  function cardHTML(item, extra) {
    const flags = [
      store.fav.has(item.id) ? "★" : "",
      store.known.has(item.id) ? "✅" : "",
      store.tolearn.has(item.id) ? "📌" : "",
    ].filter(Boolean).join(" ");
    const tags = (item.tags || []).slice(0, 3).map(t => `<span class="mini-tag">${esc(t)}</span>`).join("");
    return `<article class="card" data-id="${item.id}" tabindex="0">
      ${flags ? `<div class="card-flags">${flags}</div>` : ""}
      <div class="card-word">${esc(item.word)}</div>
      <div class="card-pinyin">${esc(item.pinyin)}</div>
      <div class="card-explain">${esc(item.explanation)}</div>
      <div class="card-tags">${tags}</div>
      ${extra || ""}
    </article>`;
  }

  function currentList() {
    let list;
    if (state.view === "fav") list = state.all.filter(x => store.fav.has(x.id));
    else if (state.view === "known") list = state.all.filter(x => store.known.has(x.id));
    else if (state.view === "tolearn") list = state.all.filter(x => store.tolearn.has(x.id));
    else if (state.view === "history") return historyList();
    else list = state.all.slice();

    if (state.tag) list = list.filter(x => (x.tags || []).includes(state.tag));
    if (state.alpha) list = list.filter(x => x.initial === state.alpha);
    if (state.q) {
      const q = state.q.trim().toLowerCase();
      list = list.filter(x =>
        x.word.includes(q) ||
        (x.pinyin || "").toLowerCase().includes(q) ||
        (x.explanation || "").includes(q) ||
        (x.story || "").includes(q));
    }
    return list;
  }

  // 历史回看：过去 N 天的“今日成语”（按同一确定性规则倒推）
  function historyList() {
    const days = 30;
    const out = [];
    const seen = new Set();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const item = pickForDate(d);
      if (!item) continue;
      out.push({ ...item, _histDate: fmtDateCN(d), _isToday: i === 0 });
    }
    return out;
  }

  function renderResults() {
    const grid = $("#resultsGrid");
    const list = currentList();
    const titleMap = {
      all: "全部成语", fav: "我的收藏夹", known: "认识了",
      tolearn: "待学习", history: "历史回看（近 30 天）",
    };
    $("#resultsTitle").textContent = titleMap[state.view] || "成语列表";
    $("#resultsCount").textContent = list.length ? `共 ${list.length} 条` : "";

    if (!list.length) {
      grid.innerHTML = "";
      const hint = $("#emptyHint");
      hint.hidden = false;
      hint.textContent = state.view === "fav" ? "还没有收藏的成语，点主卡的「收藏」试试～"
        : state.view === "known" ? "还没有标记「认识了」的成语～"
        : state.view === "tolearn" ? "还没有加入「待学习」的成语～"
        : "没有找到符合条件的成语，换个条件试试吧～";
      return;
    }
    $("#emptyHint").hidden = true;
    grid.innerHTML = list.map(it =>
      cardHTML(it, it._histDate ? `<div class="card-hist-date">${it._isToday ? "今天" : it._histDate}</div>` : "")
    ).join("");

    $$(".card", grid).forEach(el => {
      const id = el.getAttribute("data-id");
      const item = state.all.find(x => x.id === id);
      const open = () => item && openDetail(item);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  // -------------------------- 详情弹层 --------------------------
  function openDetail(item) {
    const modal = $("#detailModal");
    const body = $("#modalBody");
    body.innerHTML = `<button class="modal-close" data-close aria-label="关闭">✕</button>` + heroHTML(item, false);
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    bindHeroActions(item);
    // 让弹层里的“换一个”改为打开新的详情，而不是改主卡
    const sh = $("#actShuffle", body);
    if (sh) {
      const clone = sh.cloneNode(true);
      sh.replaceWith(clone);
      clone.addEventListener("click", () => {
        let next = item; const pool = state.all;
        if (pool.length > 1) { while (next.id === item.id) next = pool[Math.floor(Math.random() * pool.length)]; }
        openDetail(next);
      });
    }
  }
  function closeDetail() {
    speech.stop();
    $("#detailModal").classList.remove("is-open");
    document.body.style.overflow = "";
  }

  // -------------------------- 筛选控件 --------------------------
  function setView(v) {
    state.view = v;
    $$("#viewTabs .tab").forEach(t => t.classList.toggle("is-active", t.dataset.view === v));
    renderResults();
  }
  function syncSearchClear() {
    $("#clearSearch").hidden = !$("#searchInput").value;
  }

  function buildFilters() {
    // 类别
    const tagSet = new Map();
    state.all.forEach(x => (x.tags || []).forEach(t => tagSet.set(t, (tagSet.get(t) || 0) + 1)));
    const tags = [...tagSet.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const tagWrap = $("#tagChips");
    tagWrap.innerHTML = `<span class="chip is-active" data-tag="">全部</span>` +
      tags.map(t => `<span class="chip" data-tag="${esc(t)}">${esc(t)}</span>`).join("");
    $$(".chip", tagWrap).forEach(c => c.addEventListener("click", () => {
      state.tag = c.dataset.tag;
      $$(".chip", tagWrap).forEach(x => x.classList.toggle("is-active", x === c));
      renderResults();
    }));

    // 首字母
    const initials = [...new Set(state.all.map(x => x.initial))].sort();
    const alphaWrap = $("#alphaChips");
    alphaWrap.innerHTML = `<span class="chip is-active" data-alpha="">全部</span>` +
      initials.map(a => `<span class="chip" data-alpha="${esc(a)}">${esc(a)}</span>`).join("");
    $$(".chip", alphaWrap).forEach(c => c.addEventListener("click", () => {
      state.alpha = c.dataset.alpha;
      $$(".chip", alphaWrap).forEach(x => x.classList.toggle("is-active", x === c));
      renderResults();
    }));
  }

  function bindGlobal() {
    $$("#viewTabs .tab").forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));

    const input = $("#searchInput");
    let timer = null;
    input.addEventListener("input", () => {
      syncSearchClear();
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = input.value; renderResults(); }, 160);
    });
    $("#clearSearch").addEventListener("click", () => {
      input.value = ""; state.q = ""; syncSearchClear(); renderResults(); input.focus();
    });

    // 弹层关闭
    $("#detailModal").addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close")) closeDetail();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
  }

  // -------------------------- 启动 --------------------------
  async function init() {
    $("#todayDate").textContent = fmtDateCN(new Date());
    try {
      const res = await fetch("data/idioms.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.all = data;
      state.premium = data.filter(x => x.level === "premium");
      data.forEach(x => state.byWord.set(x.word, x));
    } catch (e) {
      $("#heroCard").innerHTML = `<div class="loading">数据加载失败：${esc(e.message)}<br>请通过本地服务器或线上地址访问（不要直接双击打开 index.html）。</div>`;
      return;
    }

    const today = pickForDate(new Date());
    renderHero(today, true);
    buildFilters();
    bindGlobal();
    renderResults();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
