// 예열 뽑기 — 전부 브라우저 안에서 끝납니다. 저장도 전송도 없습니다.

const $ = (id) => document.getElementById(id);

const el = {
  baseRate: $("baseRate"), hardPity: $("hardPity"), budget: $("budget"),
  softStart: $("softStart"), softInc: $("softInc"), softOn: $("softOn"),
  summaryNow: $("summaryNow"), setupBox: $("setupBox"),
  evOut: $("evOut"), medianOut: $("medianOut"), cdfOut: $("cdfOut"), cdfFoot: $("cdfFoot"),
  pullCount: $("pullCount"), pityText: $("pityText"), orbs: $("orbs"),
  pull1: $("pull1"), pull10: $("pull10"), pullAuto: $("pullAuto"), reset: $("reset"),
  verdict: $("verdict"), verdictHead: $("verdictHead"), verdictRank: $("verdictRank"),
  verdictOmen: $("verdictOmen"), verdictNote: $("verdictNote"), copyBtn: $("copyBtn"),
  saved: $("saved"), savedCount: $("savedCount"),
  chart: $("chart"), chartLegend: $("chartLegend"),
};

let cfg = null;      // 현재 확률 설정
let dist = null;     // 뽑기 횟수의 확률분포
let samples = null;  // 만 명 시뮬레이션 결과
let pulls = 0;       // 현재 연속 시행에서 뽑은 횟수
let sessionTotal = 0;
let myResult = null; // 성공한 회차
let busy = false;

/* ---------- 설정 읽기 ---------- */
function readConfig() {
  const clamp = (v, lo, hi, fb) => (Number.isFinite(v) && v >= lo && v <= hi ? v : fb);
  const base = clamp(parseFloat(el.baseRate.value) / 100, 0.0001, 1, 0.006);
  const pity = clamp(parseInt(el.hardPity.value, 10), 1, 1000, 90);
  return {
    base,
    pity,
    budget: clamp(parseInt(el.budget.value, 10), 0, 1000, 0),
    softOn: el.softOn.checked,
    softStart: clamp(parseInt(el.softStart.value, 10), 1, 1000, pity),
    softInc: clamp(parseFloat(el.softInc.value) / 100, 0, 1, 0),
  };
}

// i번째 뽑기의 성공 확률 (1-indexed)
function rateAt(i, c) {
  if (i >= c.pity) return 1;
  if (c.softOn && i >= c.softStart) {
    return Math.min(1, c.base + (i - c.softStart + 1) * c.softInc);
  }
  return c.base;
}

/* ---------- 분포 계산 ---------- */
function buildDist(c) {
  const pmf = new Float64Array(c.pity + 1); // pmf[i] = i번째에 처음 성공할 확률
  const cdf = new Float64Array(c.pity + 1);
  let survive = 1, acc = 0, ev = 0, median = c.pity;
  let medianFound = false;

  for (let i = 1; i <= c.pity; i++) {
    const p = rateAt(i, c);
    pmf[i] = survive * p;
    survive *= (1 - p);
    acc += pmf[i];
    cdf[i] = acc;
    ev += i * pmf[i];
    if (!medianFound && acc >= 0.5) { median = i; medianFound = true; }
  }
  return { pmf, cdf, ev, median };
}

// k번째에 뽑은 사람보다 운이 좋은(= 더 빨리 뽑은) 사람의 비율 → 상위 몇 %
function percentileOf(k) {
  return (k <= 1 ? 0 : dist.cdf[k - 1]) * 100;
}

/* ---------- 만 명 시뮬레이션 ---------- */
function simulateCrowd(c, n = 10000) {
  const out = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    let k = c.pity;
    for (let i = 1; i <= c.pity; i++) {
      if (Math.random() < rateAt(i, c)) { k = i; break; }
    }
    out[s] = k;
  }
  return out;
}

/* ---------- 화면 갱신 ---------- */
function refresh() {
  cfg = readConfig();
  dist = buildDist(cfg);
  samples = simulateCrowd(cfg);

  el.summaryNow.textContent = `${(cfg.base * 100).toFixed(2)}% · 천장 ${cfg.pity}회`;
  el.evOut.textContent = dist.ev.toFixed(1);
  el.medianOut.textContent = dist.median;

  const within = cfg.budget >= cfg.pity ? 1 : dist.cdf[cfg.budget] || 0;
  el.cdfOut.textContent = `${(within * 100).toFixed(1)}%`;
  el.cdfFoot.textContent = `보유 ${cfg.budget}회 기준`;

  updatePity();
  drawChart();
}

function updatePity() {
  const left = Math.max(0, cfg.pity - pulls);
  el.pityText.textContent = left === 0 ? "천장 도달" : `천장까지 ${left}회`;
  el.pityText.classList.toggle("close", left <= 10);
  el.pullCount.textContent = pulls;
}

/* ---------- 뽑기 ---------- */
function addOrb(hit) {
  if (el.orbs.querySelector(".empty-msg")) el.orbs.innerHTML = "";
  const o = document.createElement("div");
  o.className = hit ? "orb hit" : "orb";
  el.orbs.appendChild(o);
  el.orbs.scrollTop = el.orbs.scrollHeight;
}

// 한 번 굴린다. 성공하면 true.
function rollOnce() {
  pulls += 1;
  sessionTotal += 1;
  const hit = Math.random() < rateAt(pulls, cfg);
  addOrb(hit);
  updatePity();
  el.savedCount.textContent = sessionTotal;
  el.saved.hidden = false;
  if (hit) succeed(pulls);
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runPulls(n) {
  if (busy) return;
  busy = true;
  setButtons(false);
  for (let i = 0; i < n; i++) {
    if (rollOnce()) break;
    if (pulls >= cfg.pity) break;
    await sleep(n > 20 ? 12 : 85);
  }
  busy = false;
  setButtons(true);
}

async function runUntilHit() {
  if (busy) return;
  busy = true;
  setButtons(false);
  while (pulls < cfg.pity) {
    if (rollOnce()) break;
    await sleep(pulls > 30 ? 8 : 40);
  }
  busy = false;
  setButtons(true);
}

function setButtons(on) {
  [el.pull1, el.pull10, el.pullAuto].forEach((b) => (b.disabled = !on));
}

/* ---------- 판정 ---------- */
const TIERS = [
  { max: 1,   rank: "대운",       omen: "지금 지르세요.",            note: "이 정도로 빨리 뽑는 사람은 100명 중 1명입니다." },
  { max: 10,  rank: "상위권",     omen: "흐름이 좋습니다.",          note: "평균보다 확실히 앞서 있습니다." },
  { max: 35,  rank: "평균 이상",  omen: "나쁘지 않습니다.",          note: "무난하게 잘 풀린 편입니다." },
  { max: 65,  rank: "평범",       omen: "딱 보통입니다.",            note: "가장 흔한 구간에 들어왔습니다." },
  { max: 90,  rank: "평균 이하",  omen: "오늘은 좀 미지근합니다.",   note: "절반 이상이 당신보다 빨리 뽑았습니다." },
  { max: 100, rank: "최하위권",   omen: "오늘은 참으시죠.",          note: "10명 중 9명이 당신보다 운이 좋았습니다." },
];

function succeed(k) {
  myResult = k;
  const pct = percentileOf(k);
  const tier = TIERS.find((t) => pct <= t.max);

  el.verdictHead.textContent = `${k}회 만에 뽑았습니다`;
  el.verdictRank.textContent = `상위 ${pct < 0.1 ? pct.toFixed(2) : pct.toFixed(1)}% — ${tier.rank}`;
  el.verdictOmen.textContent = tier.omen;
  el.verdictNote.textContent = tier.note;
  el.verdict.hidden = false;

  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 500);

  drawChart();
  el.chartLegend.textContent = `10,000명 중 당신보다 빨리 뽑은 사람: 약 ${Math.round(pct * 100)}명`;
}

/* ---------- 차트 ---------- */
function drawChart() {
  const cv = el.chart;
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 900;
  const h = 240;
  cv.width = w * dpr;
  cv.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const binCount = Math.min(60, cfg.pity);
  const binSize = cfg.pity / binCount;
  const bins = new Array(binCount).fill(0);
  for (const v of samples) {
    const b = Math.min(binCount - 1, Math.floor((v - 1) / binSize));
    bins[b] += 1;
  }
  const peak = Math.max(...bins) || 1;

  const padX = 14, padY = 18;
  const bw = (w - padX * 2) / binCount;

  for (let i = 0; i < binCount; i++) {
    const bh = (bins[i] / peak) * (h - padY * 2);
    const x = padX + i * bw;
    const y = h - padY - bh;
    const g = ctx.createLinearGradient(0, y, 0, h - padY);
    g.addColorStop(0, "rgba(255, 201, 92, 0.95)");
    g.addColorStop(1, "rgba(124, 108, 255, 0.35)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, Math.max(1, bw - 1.5), bh);
  }

  if (myResult) {
    const x = padX + ((myResult - 1) / cfg.pity) * (w - padX * 2);
    ctx.strokeStyle = "#ff4d6d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, padY - 8);
    ctx.lineTo(x, h - padY);
    ctx.stroke();
    ctx.fillStyle = "#ff4d6d";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = x > w - 60 ? "right" : "left";
    ctx.fillText(`나 (${myResult}회)`, x > w - 60 ? x - 6 : x + 6, padY - 2);
  }
}

/* ---------- 리셋 ---------- */
function resetRun() {
  pulls = 0;
  myResult = null;
  el.orbs.innerHTML = '<div class="empty-msg">버튼을 누르면 여기서 뽑힙니다. 결제는 일어나지 않습니다.</div>';
  el.verdict.hidden = true;
  el.chartLegend.textContent = "한 번 성공시키면 내 위치가 표시됩니다.";
  refresh();
}

/* ---------- 이벤트 ---------- */
[el.baseRate, el.hardPity, el.budget, el.softStart, el.softInc, el.softOn].forEach((input) => {
  input.addEventListener("change", resetRun);
});

el.pull1.addEventListener("click", () => runPulls(1));
el.pull10.addEventListener("click", () => runPulls(10));
el.pullAuto.addEventListener("click", runUntilHit);
el.reset.addEventListener("click", resetRun);

el.copyBtn.addEventListener("click", async () => {
  const text = `예열 뽑기 결과: ${myResult}회 만에 뽑음 (${el.verdictRank.textContent})\n${location.href}`;
  try {
    await navigator.clipboard.writeText(text);
    el.copyBtn.textContent = "복사했습니다";
    setTimeout(() => (el.copyBtn.textContent = "결과 복사하기"), 1600);
  } catch {
    el.copyBtn.textContent = "복사 실패";
    setTimeout(() => (el.copyBtn.textContent = "결과 복사하기"), 1600);
  }
});

window.addEventListener("resize", () => drawChart());

refresh();
