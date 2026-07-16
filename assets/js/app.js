/* =====================================================================
   成语故事 · 小初成语学习手册 · 前端逻辑（原生 JS，零依赖）
   视图：首页 / 成语手册（按主题分层）/ 收藏 / 我的学习 / 历史回看
   全部数据存 localStorage，完全离线
   ===================================================================== */
(function () {
  "use strict";

  const state = {
    all: [],
    premium: [],
    byWord: new Map(),
    byId: new Map(),
    cats: [],            // [{name, count}]
    initials: [],
    view: "home",        // home | handbook | favorites | mine | history
    tag: "",             // 手册主题筛选
    alpha: "",           // 首字母筛选
    q: "",               // 搜索词（手册内）
  };

  // -------------------------- 本地存储 --------------------------
  const LS = { fav: "idiom.fav", known: "idiom.known", tolearn: "idiom.tolearn" };
  function loadSet(key) { try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch (e) { return new Set(); } }
  function saveSet(key, set) { try { localStorage.setItem(key, JSON.stringify([...set])); } catch (e) {} }
  const store = { fav: loadSet(LS.fav), known: loadSet(LS.known), tolearn: loadSet(LS.tolearn) };
  function toggle(setName, id) {
    const s = store[setName];
    if (s.has(id)) s.delete(id); else s.add(id);
    if (setName === "known" && s.has(id)) store.tolearn.delete(id);
    if (setName === "tolearn" && s.has(id)) store.known.delete(id);
    saveSet(LS.fav, store.fav); saveSet(LS.known, store.known); saveSet(LS.tolearn, store.tolearn);
    return s.has(id);
  }

  // -------------------------- 工具 --------------------------
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function dateKey(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function pickForDate(d) {
    const pool = state.premium.length ? state.premium : state.all;
    if (!pool.length) return null;
    return pool[hashStr(dateKey(d)) % pool.length];
  }
  function fmtDateCN(d) {
    const wk = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${wk}`;
  }
  const CAT_EMOJI = { "寓言": "🦊", "历史": "📜", "品质": "🌟", "劝诫": "💡", "自然": "🌿", "人物": "🧑", "学习": "📘", "智慧": "🧠", "情感": "💗", "励志": "🔥", "诚信": "🤝", "谦虚": "🙇", "军事": "⚔️", "艺术": "🎨", "数字": "🔢" };
  const catEmoji = (t) => CAT_EMOJI[t] || "📖";

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 1600);
  }

  // -------------------------- 朗读 --------------------------
  const speech = {
    supported: "speechSynthesis" in window, speaking: false, btn: null,
    stop() { if (this.supported) window.speechSynthesis.cancel(); this.speaking = false; if (this.btn) { this.btn.classList.remove("reading"); this.setLabel(this.btn, false); } },
    setLabel(btn, on) { if (!btn) return; btn.querySelector(".txt").textContent = on ? "停止" : "朗读"; btn.querySelector(".ico").textContent = on ? "⏹" : "🔊"; },
    read(text, btn) {
      if (!this.supported) { toast("当前浏览器不支持朗读"); return; }
      if (this.speaking) { this.stop(); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = "zh-CN"; u.rate = 0.92; u.pitch = 1.05;
      const zh = window.speechSynthesis.getVoices().find(v => /zh|Chinese|中文/i.test(v.lang + v.name));
      if (zh) u.voice = zh;
      u.onend = u.onerror = () => this.stop();
      this.btn = btn; this.speaking = true;
      if (btn) { btn.classList.add("reading"); this.setLabel(btn, true); }
      window.speechSynthesis.speak(u);
    },
  };
  if (speech.supported) window.speechSynthesis.onvoiceschanged = () => {};

  // -------------------------- 渲染：成语卡片 HTML --------------------------
  function synAntHTML(item) {
    const syn = (item.synonym || []).map(w => `<span class="word-tag" data-jump="${esc(w)}">${esc(w)}</span>`).join("");
    const ant = (item.antonym || []).map(w => `<span class="word-tag ant" data-jump="${esc(w)}">${esc(w)}</span>`).join("");
    if (!syn && !ant) return "";
    return `<div class="sec"><p class="sec-title">近义 / 反义</p><div class="syn-ant">
      <div class="col"><span class="lab">近义词</span>${syn || '<span class="lab">—</span>'}</div>
      <div class="col"><span class="lab">反义词</span>${ant || '<span class="lab">—</span>'}</div></div></div>`;
  }

  function heroHTML(item, isToday) {
    const id = item.id, fav = store.fav.has(id), known = store.known.has(id), tolearn = store.tolearn.has(id);
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
        ${item.source ? `<div class="sec"><p class="sec-title">出处</p><div class="sec-body">${esc(item.source)}</div></div>` : ""}
        ${item.story ? `<div class="sec story"><p class="sec-title">典故故事</p><div class="sec-body">${esc(item.story)}</div></div>` : ""}
        ${item.example ? `<div class="sec example"><p class="sec-title">例句</p><div class="sec-body">${esc(item.example)}</div></div>` : ""}
        ${synAntHTML(item)}
      </div>
      <div class="hero-actions">
        <button class="btn" id="actRead"><span class="ico">🔊</span><span class="txt">朗读</span></button>
        <button class="btn primary" id="actShuffle"><span class="ico">🎲</span><span class="txt">换一个</span></button>
        <button class="btn ${fav ? "is-on" : ""}" id="actFav" aria-pressed="${fav}"><span class="ico">${fav ? "★" : "☆"}</span><span class="txt">${fav ? "已收藏" : "收藏"}</span></button>
        <button class="btn ${known ? "is-on known" : ""}" id="actKnown" aria-pressed="${known}"><span class="ico">✅</span><span class="txt">${known ? "已认识" : "认识了"}</span></button>
        <button class="btn ${tolearn ? "is-on" : ""}" id="actToLearn" aria-pressed="${tolearn}"><span class="ico">📌</span><span class="txt">${tolearn ? "待学习中" : "待学习"}</span></button>
        <button class="btn" id="actCopy"><span class="ico">📋</span><span class="txt">复制</span></button>
      </div>`;
  }

  function plainText(item) {
    return [
      `${item.word}（${item.pinyin}）`, `释义：${item.explanation}`,
      item.source ? `出处：${item.source}` : "", item.story ? `典故：${item.story}` : "",
      item.example ? `例句：${item.example}` : "",
      (item.synonym && item.synonym.length) ? `近义：${item.synonym.join("、")}` : "",
      (item.antonym && item.antonym.length) ? `反义：${item.antonym.join("、")}` : "",
    ].filter(Boolean).join("\n");
  }

  function bindHeroActions(item) {
    const card = $("#heroCard");
    $("#actShuffle", card).addEventListener("click", () => {
      const pool = state.all; let next = item;
      if (pool.length > 1) while (next.id === item.id) next = pool[Math.floor(Math.random() * pool.length)];
      renderHero(next, false); window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("#actRead", card).addEventListener("click", (e) => speech.read(`${item.word}。${item.explanation}。${item.story || ""}`, e.currentTarget));
    $("#actFav", card).addEventListener("click", (e) => {
      const on = toggle("fav", item.id); e.currentTarget.classList.toggle("is-on", on);
      $(".ico", e.currentTarget).textContent = on ? "★" : "☆"; $(".txt", e.currentTarget).textContent = on ? "已收藏" : "收藏";
      toast(on ? "已加入收藏夹" : "已取消收藏"); refreshStats();
    });
    $("#actKnown", card).addEventListener("click", (e) => {
      const on = toggle("known", item.id); e.currentTarget.classList.toggle("is-on", on); e.currentTarget.classList.toggle("known", on);
      $(".txt", e.currentTarget).textContent = on ? "已认识" : "认识了";
      const tl = $("#actToLearn", card); tl.classList.toggle("is-on", store.tolearn.has(item.id));
      $(".txt", tl).textContent = store.tolearn.has(item.id) ? "待学习中" : "待学习";
      toast(on ? "标记为「认识了」" : "已取消标记"); refreshStats();
    });
    $("#actToLearn", card).addEventListener("click", (e) => {
      const on = toggle("tolearn", item.id); e.currentTarget.classList.toggle("is-on", on);
      $(".txt", e.currentTarget).textContent = on ? "待学习中" : "待学习";
      const kn = $("#actKnown", card); kn.classList.toggle("is-on", store.known.has(item.id)); kn.classList.toggle("known", store.known.has(item.id));
      $(".txt", kn).textContent = store.known.has(item.id) ? "已认识" : "认识了";
      toast(on ? "加入「待学习」" : "已移出待学习"); refreshStats();
    });
    $("#actCopy", card).addEventListener("click", () => {
      const text = plainText(item);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast("已复制"), () => fallbackCopy(text));
      else fallbackCopy(text);
    });
    $$(".word-tag[data-jump]", card).forEach(el => el.addEventListener("click", () => {
      const w = el.getAttribute("data-jump"); const t = state.byWord.get(w);
      if (t) openDetail(t); else { state.q = w; setView("handbook"); toast(`在手册中搜索「${w}」`); }
    }));
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("已复制到剪贴板"); } catch (e) { toast("复制失败，请手动选择"); }
    document.body.removeChild(ta);
  }

  function renderHero(item, isToday) {
    speech.stop(); state.hero = item;
    const card = $("#heroCard"); card.innerHTML = heroHTML(item, isToday); bindHeroActions(item);
  }

  function cardHTML(item, extra) {
    const flags = [store.fav.has(item.id) ? "★" : "", store.known.has(item.id) ? "✅" : "", store.tolearn.has(item.id) ? "📌" : ""].filter(Boolean).join(" ");
    const tags = (item.tags || []).slice(0, 3).map(t => `<span class="mini-tag">${esc(t)}</span>`).join("");
    return `<article class="card" data-id="${item.id}" tabindex="0">
      ${flags ? `<div class="card-flags">${flags}</div>` : ""}
      <div class="card-word">${esc(item.word)}</div>
      <div class="card-pinyin">${esc(item.pinyin)}</div>
      <div class="card-explain">${esc(item.explanation)}</div>
      <div class="card-tags">${tags}</div>${extra || ""}</article>`;
  }

  // -------------------------- 详情弹层 --------------------------
  function openDetail(item) {
    const modal = $("#detailModal"), body = $("#modalBody");
    body.innerHTML = `<button class="modal-close" data-close aria-label="关闭">✕</button>` + heroHTML(item, false);
    modal.classList.add("is-open"); document.body.style.overflow = "hidden";
    // hero 卡片在弹层里，手动绑定（兼容「换一个」在弹层内打开新详情）
    bindHeroActionsIn(body, item);
    const sh = $("#actShuffle", body);
    if (sh) { const clone = sh.cloneNode(true); sh.replaceWith(clone);
      clone.addEventListener("click", () => { let next = item; const pool = state.all; if (pool.length > 1) while (next.id === item.id) next = pool[Math.floor(Math.random() * pool.length)]; openDetail(next); });
    }
  }
  // 弹层内 hero 的按钮绑定（复用 bindHeroActions 逻辑，但作用域在 body）
  function bindHeroActionsIn(body, item) {
    $("#actRead", body).addEventListener("click", (e) => speech.read(`${item.word}。${item.explanation}。${item.story || ""}`, e.currentTarget));
    $("#actFav", body).addEventListener("click", (e) => {
      const on = toggle("fav", item.id); e.currentTarget.classList.toggle("is-on", on);
      $(".ico", e.currentTarget).textContent = on ? "★" : "☆"; $(".txt", e.currentTarget).textContent = on ? "已收藏" : "收藏";
      toast(on ? "已加入收藏夹" : "已取消收藏"); refreshStats();
    });
    $("#actKnown", body).addEventListener("click", (e) => {
      const on = toggle("known", item.id); e.currentTarget.classList.toggle("is-on", on); e.currentTarget.classList.toggle("known", on);
      $(".txt", e.currentTarget).textContent = on ? "已认识" : "认识了";
      const tl = $("#actToLearn", body); tl.classList.toggle("is-on", store.tolearn.has(item.id)); $(".txt", tl).textContent = store.tolearn.has(item.id) ? "待学习中" : "待学习";
      toast(on ? "标记为「认识了」" : "已取消标记"); refreshStats();
    });
    $("#actToLearn", body).addEventListener("click", (e) => {
      const on = toggle("tolearn", item.id); e.currentTarget.classList.toggle("is-on", on); $(".txt", e.currentTarget).textContent = on ? "待学习中" : "待学习";
      const kn = $("#actKnown", body); kn.classList.toggle("is-on", store.known.has(item.id)); kn.classList.toggle("known", store.known.has(item.id));
      $(".txt", kn).textContent = store.known.has(item.id) ? "已认识" : "认识了";
      toast(on ? "加入「待学习」" : "已移出待学习"); refreshStats();
    });
    $("#actCopy", body).addEventListener("click", () => {
      const text = plainText(item);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast("已复制"), () => fallbackCopy(text)); else fallbackCopy(text);
    });
    $$(".word-tag[data-jump]", body).forEach(el => el.addEventListener("click", () => {
      const w = el.getAttribute("data-jump"); const t = state.byWord.get(w);
      if (t) openDetail(t); else { state.q = w; setView("handbook"); toast(`在手册中搜索「${w}」`); }
    }));
  }
  function closeDetail() {
    speech.stop(); $("#detailModal").classList.remove("is-open"); document.body.style.overflow = "";
    renderView(); // 关闭后刷新底层视图（收藏/学习列表可能已变化）
  }

  // -------------------------- 视图：首页 --------------------------
  function renderHome() {
    const today = pickForDate(new Date());
    const f = store.fav.size, k = store.known.size, t = store.tolearn.size;
    return `<section class="view view-home">
      <section class="hero-section"><article id="heroCard" class="hero-card scroll-deco">${heroHTML(today, true)}</article></section>
      <div class="stats">
        <div class="stat"><span class="num">收藏</span><span class="big" id="stFav">${f}</span></div>
        <div class="stat jade"><span class="num">已认识</span><span class="big" id="stKnown">${k}</span></div>
        <div class="stat"><span class="num">待学习</span><span class="big" id="stTo">${t}</span></div>
      </div>
      <div class="quick">
        <button class="quick-btn" data-go="handbook"><span class="q-ico">📚</span><span><span class="q-t">成语手册</span><br><span class="q-s">按主题分层浏览全部成语</span></span></button>
        <button class="quick-btn" data-go="favorites"><span class="q-ico">⭐</span><span><span class="q-t">我的收藏</span><br><span class="q-s">${f} 条已收藏</span></span></button>
        <button class="quick-btn" data-go="mine"><span class="q-ico">📖</span><span><span class="q-t">我的学习</span><br><span class="q-s">认识 ${k} · 待学 ${t}</span></span></button>
        <button class="quick-btn" data-go="history"><span class="q-ico">📅</span><span><span class="q-t">历史回看</span><br><span class="q-s">近 30 天每日成语</span></span></button>
      </div>
    </section>`;
  }
  function refreshStats() {
    const f = $("#stFav"), k = $("#stKnown"), t = $("#stTo");
    if (f) { f.textContent = store.fav.size; k.textContent = store.known.size; t.textContent = store.tolearn.size; }
    // 快捷入口里的数字也同步
    const qf = $('.quick-btn[data-go="favorites"] .q-s'); if (qf) qf.textContent = `${store.fav.size} 条已收藏`;
    const qm = $('.quick-btn[data-go="mine"] .q-s'); if (qm) qm.textContent = `认识 ${store.known.size} · 待学 ${store.tolearn.size}`;
  }

  // -------------------------- 视图：成语手册（分层） --------------------------
  function buildCats() {
    const m = new Map();
    state.all.forEach(x => (x.tags || []).forEach(t => m.set(t, (m.get(t) || 0) + 1)));
    state.cats = [...m.entries()].sort((a, b) => b[1] - a[1]).map(e => ({ name: e[0], count: e[1] }));
    state.initials = [...new Set(state.all.map(x => x.initial))].sort();
  }
  function renderHandbook() {
    return `<section class="view view-handbook">
      <h2 class="view-title">成语手册</h2>
      <p class="view-desc">共 ${state.all.length} 条成语，按主题分层。点卡片看详情，可朗读、收藏、标记。</p>
      <div class="hb-toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input id="hbSearch" type="search" inputmode="search" autocomplete="off" placeholder="搜索成语 / 释义 / 故事……" aria-label="搜索成语" />
          <button id="hbClear" class="clear-btn" aria-label="清除" hidden>✕</button>
        </div>
        <div class="filter-group"><span class="filter-label">主题</span><div class="chips" id="catChips"></div></div>
        <div class="filter-group"><span class="filter-label">首字母</span><div class="chips alpha" id="alphaChips"></div></div>
      </div>
      <div class="hb-list" id="hbList"></div>
    </section>`;
  }
  function fillHandbookFilters() {
    const catWrap = $("#catChips");
    catWrap.innerHTML = `<span class="chip is-active" data-tag="">全部</span>` +
      state.cats.map(c => `<span class="chip" data-tag="${esc(c.name)}">${esc(c.name)}<span class="cnt">${c.count}</span></span>`).join("");
    $$(".chip", catWrap).forEach(c => c.addEventListener("click", () => {
      state.tag = c.dataset.tag; $$(".chip", catWrap).forEach(x => x.classList.toggle("is-active", x === c));
      renderGroups(); $("#hbList").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    const aWrap = $("#alphaChips");
    aWrap.innerHTML = `<span class="chip is-active" data-alpha="">全部</span>` +
      state.initials.map(a => `<span class="chip" data-alpha="${esc(a)}">${esc(a)}</span>`).join("");
    $$(".chip", aWrap).forEach(c => c.addEventListener("click", () => {
      state.alpha = c.dataset.alpha; $$(".chip", aWrap).forEach(x => x.classList.toggle("is-active", x === c)); renderGroups();
    }));
    const input = $("#hbSearch"), clear = $("#hbClear");
    let timer = null;
    input.addEventListener("input", () => { clear.hidden = !input.value; clearTimeout(timer); timer = setTimeout(() => { state.q = input.value; renderGroups(); }, 140); });
    clear.addEventListener("click", () => { input.value = ""; state.q = ""; clear.hidden = true; renderGroups(); input.focus(); });
  }
  function matchItems(items) {
    const q = state.q.trim().toLowerCase();
    let list = items;
    if (state.alpha) list = list.filter(x => x.initial === state.alpha);
    if (q) list = list.filter(x => x.word.includes(q) || (x.pinyin || "").toLowerCase().includes(q) || (x.explanation || "").includes(q) || (x.story || "").includes(q));
    return list;
  }
  function renderGroups() {
    const root = $("#hbList"); if (!root) return;
    let html = "";
    for (const c of state.cats) {
      if (state.tag && state.tag !== c.name) continue;
      const items = matchItems(state.all.filter(x => (x.tags || []).includes(c.name)));
      if (!items.length) continue;
      html += `<section class="hb-group" id="grp-${esc(c.name)}">
        <h3 class="hb-group-title"><span class="g-emoji">${catEmoji(c.name)}</span>${esc(c.name)}<span class="g-count">${items.length} 个</span></h3>
        <div class="results-grid">${items.map(x => cardHTML(x)).join("")}</div></section>`;
    }
    if (!html) root.innerHTML = `<div class="empty-hint"><span class="eh-ico">🔍</span>没有匹配的成语，换个主题或关键词试试～</div>`;
    else root.innerHTML = html;
  }

  // -------------------------- 视图：收藏 / 我的学习 / 历史 --------------------------
  function gridHTML(list, emptyIco, emptyText) {
    if (!list.length) return `<div class="empty-hint"><span class="eh-ico">${emptyIco}</span>${emptyText}</div>`;
    return `<div class="results-grid">${list.map(x => cardHTML(x)).join("")}</div>`;
  }
  function renderFavorites() {
    const list = state.all.filter(x => store.fav.has(x.id));
    return `<section class="view view-fav">
      <h2 class="view-title">我的收藏</h2>
      <p class="view-desc">${list.length ? `已收藏 ${list.length} 条成语` : "把喜欢的成语收进来，随时复习"}</p>
      ${gridHTML(list, "⭐", "还没有收藏的成语，去首页或手册点「收藏」吧～")}
    </section>`;
  }
  function renderMine() {
    const known = state.all.filter(x => store.known.has(x.id));
    const tolearn = state.all.filter(x => store.tolearn.has(x.id));
    const done = known.length, total = state.all.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    return `<section class="view view-mine">
      <h2 class="view-title">我的学习</h2>
      <div class="progress-wrap">
        <div class="progress-label">已掌握 <b>${done}</b> / 全部 ${total} 条（${pct}%）</div>
        <div class="progress-bar"><i style="width:${pct}%"></i></div>
      </div>
      <div class="learn-block"><h3>已认识<span class="lb-count">${known.length} 条</span></h3>
        ${gridHTML(known, "✅", "还没有标记「认识了」的成语～")}</div>
      <div class="learn-block"><h3>待学习<span class="lb-count">${tolearn.length} 条</span></h3>
        ${gridHTML(tolearn, "📌", "还没有加入「待学习」的成语～")}</div>
    </section>`;
  }
  function renderHistory() {
    const items = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const it = pickForDate(d); if (!it) continue;
      items.push({ ...it, _d: d, _isToday: i === 0 });
    }
    const tl = items.map(it => `<div class="tl-item ${it._isToday ? "today" : ""}">
      <div class="tl-card" data-id="${it.id}">
        <div class="tl-date">${it._isToday ? "今天 · " : ""}${fmtDateCN(it._d)}</div>
        <div class="tl-word">${esc(it.word)}</div>
        <div class="card-explain">${esc(it.explanation)}</div>
      </div></div>`).join("");
    return `<section class="view view-hist">
      <h2 class="view-title">历史回看</h2>
      <p class="view-desc">过去 30 天的「今日成语」，点任意一条查看详情</p>
      <div class="timeline">${tl}</div>
    </section>`;
  }

  // -------------------------- 路由 --------------------------
  function renderView() {
    const root = $("#viewRoot");
    let html = "";
    switch (state.view) {
      case "handbook": html = renderHandbook(); break;
      case "favorites": html = renderFavorites(); break;
      case "mine": html = renderMine(); break;
      case "history": html = renderHistory(); break;
      default: html = renderHome();
    }
    root.innerHTML = html;
    if (state.view === "home") bindHeroActions(state.hero || pickForDate(new Date()));
    if (state.view === "handbook") { fillHandbookFilters(); renderGroups(); }
  }
  function setView(v) {
    if (!["home", "handbook", "favorites", "mine", "history"].includes(v)) v = "home";
    state.view = v;
    $$("#topnav .navlink, #tabbar .tabitem").forEach(b => b.classList.toggle("is-active", b.dataset.view === v));
    renderView(); window.scrollTo({ top: 0, behavior: "smooth" });
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
      data.forEach(x => { state.byWord.set(x.word, x); state.byId.set(x.id, x); });
      buildCats();
    } catch (e) {
      $("#viewRoot").innerHTML = `<div class="empty-hint"><span class="eh-ico">⚠️</span>数据加载失败：${esc(e.message)}<br>请通过本地服务器或线上地址访问（不要直接双击打开 index.html）。</div>`;
      return;
    }
    renderView();

    // 导航（顶部 + 底部）
    $$("#topnav .navlink, #tabbar .tabitem").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
    // 首页快捷入口
    $("#viewRoot").addEventListener("click", (e) => {
      const go = e.target.closest("[data-go]"); if (go) { setView(go.dataset.go); return; }
      const card = e.target.closest(".card[data-id], .tl-card[data-id]"); if (card) { const it = state.byId.get(card.dataset.id) || state.byWord.get(card.dataset.id); if (it) openDetail(it); }
    });
    // 弹层关闭
    $("#detailModal").addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeDetail(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#detailModal").classList.contains("is-open")) closeDetail(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
