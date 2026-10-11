// AIニュースの画面の動き（記事の読み込み・絞り込み・表示・ホーム画面への追加の案内）。
// セキュリティ設定（CSP）でページ内に直接書いたスクリプトを禁止しているため、別ファイルにしている。
const PAGE = 10;  // 全記事の表示件数（「続きを読む」で10件ずつ追加）
// cats：分野の一覧（data.json の categories。表示順・名前・英字・色）、topics：分野ごとの細分類（設定した場合だけ）
const state = { cat: "all", topic: null, rel: false, q: "", shown: PAGE, items: [], cats: [], topics: {}, since: null };
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const WD = ["日","月","火","水","木","金","土"];
const DAY = 864e5;

const pad = n => String(n).padStart(2, "0");
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dayKey = iso => iso.slice(0,10);
const within = (days, from = 0) => { const t1 = Date.now() - from * DAY, t0 = t1 - days * DAY; return state.items.filter(it => { const t = new Date(it.published).getTime(); return t >= t0 && t < t1; }); };
const catOf = key => state.cats.find(c => c.key === key);
const labelOf = key => catOf(key)?.label || key;
const colorOf = key => catOf(key)?.color || "#8C98AB";
function dayLabel(key){
  const [y,m,d] = key.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((today - dt) / DAY);
  const base = `${m}月${d}日 ${WD[dt.getDay()]}曜日`;
  return diff === 0 ? `本日　${base}` : diff === 1 ? `昨日　${base}` : base;
}
// 分野ラベル（色付き）。細分類があれば「分野｜細分類」
function kicker(it){
  const k = el("span", "kicker");
  for (const c of state.cats.filter(c => it.categories.includes(c.key))){
    const t = it.topics?.[c.key];
    const s = el("span", null, c.label + (t && t !== "その他" ? `｜${t}` : ""));
    s.style.setProperty("--c", c.color); k.append(s);
  }
  return k;
}
function when(iso){
  const d = new Date(iso), diff = (Date.now() - d) / 36e5;
  if (diff < 1) return "1時間以内";
  if (diff < 24) return `${Math.floor(diff)}時間前`;
  return `${d.getMonth()+1}月${d.getDate()}日`;
}
// 取得元から届いたリンクは http(s) のものだけ使う（javascript: などは開かない）
const safeHref = url => /^https?:\/\//i.test(url || "") ? url : "#";
function link(it, cls){
  const a = el("a", "hl " + (cls || "")); a.href = safeHref(it.link); a.target = "_blank"; a.rel = "noopener"; return a;
}

const isFiltered = () => state.cat !== "all" || state.topic || state.rel || state.q.trim();

/* 分野ごとの枠組み（タブ・分野別の欄・凡例）を data.json の categories から作る */
function buildCategoryUI(){
  const tabs = $("#tabs"); tabs.textContent = "";
  const mkTab = (key, label, color) => {
    const b = el("button", null, label); b.dataset.cat = key; b.setAttribute("aria-pressed", key === state.cat);
    if (color) b.style.setProperty("--c", color);
    b.onclick = () => setCat(key); tabs.append(b);
  };
  mkTab("all", "総合");
  for (const c of state.cats) mkTab(c.key, c.label, c.color);

  const cols = $("#columns"); cols.textContent = "";
  for (const c of state.cats){
    const s = el("section"); s.style.setProperty("--c", c.color);
    const h = el("div", "col-h"), h3 = el("h3", null, c.label);
    h3.append(el("small", null, c.en || ""));
    const b = el("button", null, "すべて見る →"); b.onclick = () => { setCat(c.key); jump(); };
    h.append(h3, b);
    const body = el("div"); body.id = `col-${c.key}`;
    s.append(h, body); cols.append(s);
  }

  const key = $("#chartKey"); key.textContent = "";
  for (const c of state.cats){ const s = el("span", null, c.label); s.style.setProperty("--c", c.color); key.append(s); }
}

/* 一面 */
const FRONT_N = 7;  // 一面に載せる本数（トップ1＋準トップ6）
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// 今日（JST）配信の記事か
const isToday = it => dayKey(it.published) === keyOf(new Date());
// 今日の記事なら NEW の印を返す（append に展開して使う）
const newMark = it => isToday(it) ? [el("span", "new", "NEW")] : [];
// 一面の記事を選ぶ：当日のニュースを優先して前に置き、足りない分は前日、その前の日…から補う。
// 各日の中ではランダムに並べ、同じ媒体が続かないよう媒体の重複をできるだけ避ける
function pickFront(){
  const news = state.items.filter(it => it.type === "news" && it.title.length >= 16);
  const byDay = {};
  for (const it of news) (byDay[dayKey(it.published)] ||= []).push(it);
  const today = keyOf(new Date());
  const days = Object.keys(byDay).filter(k => k <= today).sort().reverse();
  const picks = [], seen = new Set();
  for (const k of days){
    if (picks.length >= FRONT_N) break;
    const pool = shuffle([...byDay[k]]);
    for (const it of pool) if (picks.length < FRONT_N && !seen.has(it.source)){ picks.push(it); seen.add(it.source); }
    for (const it of pool) if (picks.length < FRONT_N && !picks.includes(it)){ picks.push(it); seen.add(it.source); }
  }
  // 見出しの日付は、一面に載せた中で一番新しい日（今日の記事があれば「今日の一面」）
  return { day: days[0] || null, picks };
}
function renderFront(){
  const { day, picks } = pickFront();
  const used = new Set();
  if (day){
    const [, m, d] = day.split("-").map(Number);
    $("#frontTitle").textContent = day === keyOf(new Date()) ? "今日の一面" : `${m}月${d}日の一面`;
  }
  const lead = picks[0];
  const leadA = $("#lead"); leadA.textContent = "";
  if (lead){
    used.add(lead.id);
    leadA.href = safeHref(lead.link);
    leadA.append(kicker(lead), ...newMark(lead), el("h3", "t", lead.title));
    // Googleニュースの要約は「見出し＋媒体名」なので、見出しの繰り返しなら出さない
    if (lead.summary && !lead.summary.startsWith(lead.title.slice(0, 12))) leadA.append(el("p", "dek", lead.summary.slice(0, 90) + (lead.summary.length > 90 ? "…" : "")));
    leadA.append(el("div", "meta", `${lead.source}　${when(lead.published)}`));
  }
  const secs = $("#seconds"); secs.textContent = "";
  for (const it of picks.slice(1)){
    used.add(it.id);
    const a = link(it); a.append(kicker(it), ...newMark(it), el("span", "t", it.title), el("span", "small-meta", `${it.source}　${when(it.published)}`));
    secs.append(a);
  }
  const flash = $("#flash"); flash.textContent = "";
  state.items.filter(it => !used.has(it.id)).slice(0, 9).forEach(it => {
    used.add(it.id);
    const li = el("li"), a = link(it);
    const tm = el("time"); tm.dateTime = it.published;
    if (dayKey(it.published) === keyOf(new Date())) tm.textContent = it.published.slice(11,16);
    else { tm.append(it.published.slice(11,16)); tm.append(el("small", null, `${Number(it.published.slice(5,7))}/${Number(it.published.slice(8,10))}`)); }
    const t = el("span", "t"); t.append(...newMark(it), it.title);
    a.append(tm, t);
    li.append(a); flash.append(li);
  });
  for (const c of state.cats){
    const box = $(`#col-${c.key}`); box.textContent = "";
    // 分野別の欄は一面・速報との重複を気にせず、その分野の最新5件を配信時刻の新しい順に出す
    const list = state.items.filter(it => it.categories.includes(c.key)).slice(0, 5);
    if (!list.length) box.append(el("p", "col-empty", "まだ記事がありません。"));
    list.forEach(it => {
      used.add(it.id);
      const a = link(it, "brief");
      const rel = it.type === "release" ? `　プレスリリース${it.company ? `　${it.company}` : ""}` : "";
      a.append(...newMark(it), el("span", "t", it.title), el("span", "small-meta", `${it.source}　${when(it.published)}${rel}`));
      box.append(a);
    });
  }
}

/* 記事数の推移（分野ごとの積み上げ） */
function renderChart(){
  const days = [];
  for (let i = 13; i >= 0; i--){ const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i); days.push(d); }
  const agg = Object.fromEntries(days.map(d => [keyOf(d), Object.fromEntries(state.cats.map(c => [c.key, 0]))]));
  for (const it of state.items){ const a = agg[dayKey(it.published)]; if (!a) continue; for (const c of it.categories) if (c in a) a[c]++; }
  const sum = a => Object.values(a).reduce((x, y) => x + y, 0);
  const max = Math.max(1, ...Object.values(agg).map(sum));
  const ch = $("#chart"), cx = $("#chartX"); ch.textContent = ""; cx.textContent = "";
  days.forEach((d, i) => {
    const a = agg[keyOf(d)], last = i === 13, total = sum(a);
    const col = el("div", "col");
    col.title = `${d.getMonth()+1}/${d.getDate()}　` + state.cats.map(c => `${c.label} ${a[c.key]}件`).join("・");
    for (const c of state.cats){ const b = el("i"); b.style.setProperty("--c", c.color); b.style.height = (a[c.key] / max * 100) + "%"; col.append(b); }
    if (total){ const n = el("b", null, total); n.style.bottom = (total / max * 100) + "%"; col.append(n); }
    ch.append(col);
    cx.append(el("span", last ? "today" : null, last ? "今日" : `${d.getMonth()+1}/${d.getDate()}`));
  });
}

/* メニューの分類索引・媒体ランキング */
function renderIndex(){
  const recent = within(30);
  const row = (label, n, pressed, onClick, cls, color) => {
    const li = el("li", cls), b = el("button");
    if (color) b.style.setProperty("--c", color);
    b.setAttribute("aria-pressed", pressed);
    b.append(el("span", "n", label), el("span", "c", n));
    b.onclick = () => { onClick(); closeMenu(); jump(); };
    li.append(b); return li;
  };
  const ix = $("#index"); ix.textContent = "";
  ix.append(row("すべての記事", recent.length, state.cat === "all", () => setCat("all"), "all"));
  for (const c of state.cats){
    const mine = recent.filter(it => it.categories.includes(c.key));
    ix.append(row(c.label, mine.length, state.cat === c.key && !state.topic, () => setCat(c.key), "all", c.color));
    const counts = {}; for (const it of mine){ const t = it.topics?.[c.key]; if (t) counts[t] = (counts[t] || 0) + 1; }
    for (const t of state.topics[c.key] || []) if (counts[t]) ix.append(row(t, counts[t], state.cat === c.key && state.topic === t, () => setTopic(t, c.key), "sub"));
  }

  const sc = {}; for (const it of recent) sc[it.source] = (sc[it.source] || 0) + 1;
  const ul = $("#srcs"); ul.textContent = "";
  Object.entries(sc).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([s, n]) => {
    const li = el("li"); li.append(el("span", null, s), el("span", "c", `${n}件`)); ul.append(li);
  });
}

/* 全記事 */
function filtered(){
  const q = state.q.trim().toLowerCase();
  return state.items.filter(it =>
    (state.cat === "all" || it.categories.includes(state.cat)) &&
    (!state.topic || it.topics?.[state.cat] === state.topic) &&
    (!state.rel || it.type === "release") &&
    (!q || (it.title + " " + it.source + " " + (it.summary||"") + " " + (it.company||"")).toLowerCase().includes(q)));
}
function render(){
  const f = !!isFiltered();
  $("#frontWrap").hidden = f;
  $("#listTitle").textContent = f ? "絞り込み結果" : "全記事";
  $("#listSub").textContent = f ? "" : "過去90日分";
  const list = $("#list"); list.textContent = "";
  const all = filtered();
  const label = [state.cat !== "all" ? labelOf(state.cat) : "", state.topic, state.rel ? "プレスリリース" : "", state.q.trim() ? `「${state.q.trim()}」` : ""].filter(Boolean).join(" › ");
  $("#result").textContent = state.items.length ? `${all.length}件` + (label ? `　${label}` : "") : "";
  if (!all.length){
    list.append(el("p", "empty", state.items.length ? "条件に合う記事はありません。絞り込みを変えてください。" : "まだ記事がありません。初回の自動更新後に表示されます。"));
    return;
  }
  const perDay = {}; for (const it of all){ const k = dayKey(it.published); perDay[k] = (perDay[k] || 0) + 1; }
  const now = Date.now();
  let ul = null, cur = null;
  for (const it of all.slice(0, state.shown)){
    const k = dayKey(it.published);
    if (k !== cur){
      cur = k;
      const head = el("div", "day"); head.append(el("h3", null, dayLabel(k)), el("small", null, `${perDay[k]}件`));
      ul = el("ul", "list"); list.append(head, ul);
    }
    const li = el("li", "entry");
    const body = el("div");
    const a = link(it); a.append(el("span", "t", it.title));
    const meta = el("div", "meta");
    meta.append(kicker(it));
    if (isToday(it)) meta.append(el("span", "new", "NEW"));
    meta.append(el("span", null, it.source));
    if (it.type === "release"){
      meta.append(el("span", "rel", "プレスリリース"));
      if (it.company) meta.append(el("span", "company", it.company));
    }
    body.append(a, meta); li.append(body); ul.append(li);
  }
  if (all.length > state.shown){
    const w = el("div", "more-wrap");
    const b = el("button", "more", `続きを読む（残り${all.length - state.shown}件）`);
    b.onclick = () => { state.shown += PAGE; render(); };
    w.append(b); list.append(w);
  }
}
// 分野タブの下の細分類（config.json に topics を設定した分野だけ表示）
function renderTopics(){
  const box = $("#topics"); box.textContent = "";
  const list = state.topics[state.cat] || [];
  box.hidden = state.cat === "all" || !list.length;
  if (box.hidden) return;
  box.style.setProperty("--c", colorOf(state.cat));
  box.setAttribute("aria-label", `${labelOf(state.cat)}の分類`);
  const counts = {}; let total = 0;
  for (const it of state.items){ const t = it.topics?.[state.cat]; if (t){ counts[t] = (counts[t] || 0) + 1; total++; } }
  const mk = (label, topic, n) => {
    const b = el("button"); b.setAttribute("aria-pressed", state.topic === topic);
    b.append(label, el("span", "c", n)); b.onclick = () => setTopic(topic, state.cat); return b;
  };
  box.append(mk("すべて", null, total));
  for (const t of list) if (counts[t]) box.append(mk(t, t, counts[t]));
}
function refresh(){ state.shown = PAGE; syncTabs(); renderTopics(); renderIndex(); render(); }
function syncTabs(){ document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-pressed", b.dataset.cat === state.cat)); }
function setCat(cat){ state.cat = cat; state.topic = null; refresh(); }
function setTopic(t, cat){ state.topic = t; if (cat) state.cat = cat; refresh(); }
// 操作バーが画面の一番上に来る位置へ移動（一面を隠したときは結果がすぐ下に出る）
function jump(){ window.scrollTo({ top: $(".ticker").getBoundingClientRect().bottom + scrollY, behavior: "smooth" }); }

/* メニュー */
const drawer = $("#drawer"), scrim = $("#scrim"), menuBtn = $("#menuBtn");
function openMenu(){
  drawer.classList.add("open"); scrim.classList.add("open");
  drawer.setAttribute("aria-hidden", "false"); menuBtn.setAttribute("aria-expanded", "true");
  setTimeout(() => $("#menuClose").focus(), 50);
}
function closeMenu(){
  if (!drawer.classList.contains("open")) return;
  drawer.classList.remove("open"); scrim.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true"); menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.focus({ preventScroll: true });
}
menuBtn.addEventListener("click", openMenu);
$("#menuClose").addEventListener("click", closeMenu);
scrim.addEventListener("click", closeMenu);
document.addEventListener("keydown", e => { if (e.key === "Escape"){ closeMenu(); const g = $("#iosGuide"); if (g) g.hidden = true; } });

/* 上部の集計：本日の新着、分野ごとの直近7日（前の7日との比較つき）、掲載媒体数 */
function header(updated){
  const n = new Date();
  $("#today").textContent = `${n.getFullYear()}年${n.getMonth()+1}月${n.getDate()}日（${WD[n.getDay()]}）`;
  $("#updated").textContent = updated ? `最終更新 ${updated.slice(11,16)}　毎朝8時更新` : "まだ更新されていません";
  const today = keyOf(n), week = within(7), prev = within(7, 7);
  const t = $("#ticker"); t.textContent = "";
  const cell = (label, value, unit, color, diff) => {
    const d = el("div");
    const k = el("span", "k"); if (color){ const i = el("i"); i.style.setProperty("--c", color); k.append(i); } k.append(label);
    const v = el("span", "v", value); v.append(el("small", null, unit));
    d.append(k, v);
    if (diff !== undefined) d.append(diff);
    t.append(d);
  };
  cell("本日の新着", state.items.filter(it => dayKey(it.published) === today).length, "件");
  for (const c of state.cats){
    const now7 = week.filter(it => it.categories.includes(c.key)).length;
    const pre7 = prev.filter(it => it.categories.includes(c.key)).length;
    let diff;
    // 前週比は、収集開始から14日たって前の週のデータがそろってから表示する
    const enough = state.since && Date.now() - new Date(state.since).getTime() >= 14 * DAY;
    if (enough && pre7){
      const r = Math.round((now7 - pre7) / pre7 * 100);
      diff = el("span", "d " + (r > 0 ? "up" : r < 0 ? "down" : ""), `${r > 0 ? "▲" : r < 0 ? "▼" : "±"}${Math.abs(r)}%　前週比`);
    } else diff = el("span", "d", "直近7日");
    cell(c.label, now7, "件", c.color, diff);
  }
  cell("掲載媒体", new Set(state.items.map(it => it.source)).size, "媒体");
}

$("#relOnly").addEventListener("click", e => { state.rel = !state.rel; e.currentTarget.setAttribute("aria-pressed", state.rel); refresh(); });
let timer; $("#q").addEventListener("input", e => {
  clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value; state.shown = PAGE; render(); }, 150);
});

// 記事データを読み込む。最終更新（updated_at）が前回と同じなら何もしない
let lastUpdated = null;
function loadData(){
  return fetch("data.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.json()).then(d => {
    if (lastUpdated !== null && d.updated_at === lastUpdated) return;
    const first = lastUpdated === null;
    lastUpdated = d.updated_at || "";
    // 取得した時刻ではなく、配信（リリース）時刻の新しい順に並べ直す
    state.items = (d.items || []).sort((x, y) => new Date(y.published) - new Date(x.published));
    state.cats = d.categories || [];
    state.topics = d.topics || {};
    state.since = d.collected_since || null;
    if (first) buildCategoryUI();  // 分野のタブ・欄は最初の1回だけ組み立てる
    header(d.updated_at); renderFront(); renderChart(); renderTopics(); renderIndex(); render();
  }).catch(() => {
    if (lastUpdated === null) $("#updated").textContent = "データを読み込めませんでした。時間をおいて再読み込みしてください。";
  });
}
loadData();
// ホーム画面のアプリは開き直しても前の画面のまま残るため、
// 画面に戻ったときと5分ごとに data.json を確かめ、更新があればその場で差し替える
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadData(); });
window.addEventListener("focus", () => loadData());
setInterval(() => { if (document.visibilityState === "visible") loadData(); }, 5 * 60 * 1000);

/* アプリとして追加（①メニューの一番下 ②一面と全記事の間のお知らせ） */
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch {} },
};
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isPhone = /android|iphone|ipod/i.test(navigator.userAgent) || matchMedia("(max-width: 700px)").matches;
let installEvent = null;

function refreshInstall(){
  const can = !isStandalone && (installEvent || isIOS);
  $("#installMenu").hidden = !can;
  // お知らせはスマホで表示し、×を押した人には次から出さない
  $("#installCard").hidden = !(can && isPhone && !store.get("ainews:installDismissed"));
}
async function install(){
  if (installEvent){
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;  // 一度使った確認画面は再利用できない
    refreshInstall();
  } else if (isIOS){
    closeMenu();
    $("#iosGuide").hidden = false;
  }
}
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; refreshInstall(); });
window.addEventListener("appinstalled", () => { installEvent = null; store.set("ainews:installDismissed", "1"); refreshInstall(); });
document.querySelectorAll("[data-install]").forEach(b => b.addEventListener("click", install));
$("#installDismiss").addEventListener("click", () => { store.set("ainews:installDismissed", "1"); refreshInstall(); });
$("#iosGuideClose").addEventListener("click", () => { $("#iosGuide").hidden = true; });
$("#iosGuide").addEventListener("click", e => { if (e.target.id === "iosGuide") $("#iosGuide").hidden = true; });
refreshInstall();

// ホーム画面アプリ用の補助スクリプト
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
