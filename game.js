const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = document.getElementById('song');

const playBtn = document.getElementById('playBtn');
const editorBtn = document.getElementById('editorBtn');
const saveBtn = document.getElementById('saveBtn');
const loadBtn = document.getElementById('loadBtn');
const chartInput = document.getElementById('chart-input');
const chartOutput = document.getElementById('chart-output');
const clearOut = document.getElementById('clearOut');
const copyOut = document.getElementById('copyOut');

const fpsEl = document.getElementById('fps');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const accEl = document.getElementById('acc');
const rankEl = document.getElementById('rank');
const modeEl = document.getElementById('mode');

const results = document.getElementById('results');
const resRank = document.getElementById('res-rank');
const resAcc = document.getElementById('res-acc');
const resMax = document.getElementById('res-maxcombo');
const resScore = document.getElementById('res-score');
const resultsClose = document.getElementById('resultsClose');
const resultsReplay = document.getElementById('resultsReplay');

// Game config
const laneKeys = ['d', 'f', 'j', 'k'];
const laneX = [210, 420, 620, 810];
const hitY = 520;
const NOTE_RADIUS = 20;
const TARGET_RADIUS = 32;
const SPEED = 600;
const HIT_WINDOWS = [
  { name: 'Perfect', ms: 30, score: 1000 },
  { name: 'Great',   ms: 60, score: 600  },
  { name: 'Good',    ms: 100, score: 300 }
];

// Game state
let chart = {
  offset: 0.0,
  lanes: 4,
  notes: [
    { t: 1.0, lane: 0 }, { t: 1.5, lane: 1 }, { t: 2.0, lane: 2 },
    { t: 2.5, lane: 3 }, { t: 3.0, lane: 0 }, { t: 3.5, lane: 1 },
    { t: 4.0, lane: 2 }, { t: 4.5, lane: 3 }
  ]
};

let notes = [], particles = [], judgments = [];
let score = 0, combo = 0, maxCombo = 0;
let totalJudged = 0, hits = 0;
let songStart = 0, running = false, inEditor = false;
let pressed = new Set();
let recordedNotes = [];
let lastFrame = performance.now();
// Event bindings
playBtn.onclick = startGame;
editorBtn.onclick = startEditor;
saveBtn.onclick = saveChart;
loadBtn.onclick = loadChart;
clearOut.onclick = () => chartOutput.value = '';
copyOut.onclick = () => {
  chartOutput.select();
  document.execCommand('copy');
};

resultsClose.onclick = () => results.style.display = 'none';
resultsReplay.onclick = () => {
  results.style.display = 'none';
  startGame();
};

// Input handling
window.onkeydown = e => {
  if (!laneKeys.includes(e.key)) return;
  pressed.add(e.key);
  const lane = laneKeys.indexOf(e.key);
  if (!running) return;

  if (inEditor) {
    const t = (performance.now() - songStart) / 1000;
    recordedNotes.push({ t: parseFloat(t.toFixed(3)), lane });
    notes.push({ t, lane, hit: false, missed: false });
  } else {
    handleHit(lane);
  }
};

window.onkeyup = e => pressed.delete(e.key);

// Game modes
function startGame() {
  inEditor = false;
  modeEl.textContent = 'Play';
  resetState();
  audio.currentTime = 0;
  audio.play();
  songStart = performance.now() - audio.currentTime * 1000;
  running = true;
  requestAnimationFrame(loop);
}

function startEditor() {
  inEditor = true;
  modeEl.textContent = 'Editor';
  recordedNotes = [];
  resetState();
  notes = [];
  audio.currentTime = 0;
  audio.play();
  songStart = performance.now() - audio.currentTime * 1000;
  running = true;
  requestAnimationFrame(loop);
}

function saveChart() {
  const data = inEditor
    ? { offset: chart.offset, lanes: chart.lanes, notes: recordedNotes }
    : chart;
  chartOutput.value = JSON.stringify(data, null, 2);
}

function loadChart() {
  try {
    const parsed = JSON.parse(chartInput.value);
    if (!Array.isArray(parsed.notes)) throw new Error("Invalid chart format");
    chart = parsed;
    modeEl.textContent = 'Play (loaded)';
    resetState();
    audio.currentTime = 0;
    audio.play();
    songStart = performance.now() - audio.currentTime * 1000;
    running = true;
    inEditor = false;
    requestAnimationFrame(loop);
  } catch (err) {
    alert("Failed to load chart: " + err.message);
  }
}

function resetState() {
  notes = chart.notes.map(n => ({ ...n, hit: false, missed: false }));
  particles = [];
  judgments = [];
  score = 0;
  combo = 0;
  maxCombo = 0;
  totalJudged = 0;
  hits = 0;
}
// Hit detection
function handleHit(lane) {
  const songTime = (performance.now() - songStart) / 1000;
  let cand = null, bestDelta = Infinity;

  for (const n of notes) {
    if (n.lane !== lane || n.hit || n.missed) continue;
    const delta = Math.abs(n.t - songTime);
    if (delta < bestDelta) {
      bestDelta = delta;
      cand = n;
    }
  }

  if (!cand || bestDelta * 1000 > 120) return;

  cand.hit = true;
  totalJudged++;

  let judge = "Good", points = 300, color = "#ffd166";
  if (bestDelta * 1000 <= 30) { judge = "Perfect"; points = 1000; hits++; color = "#06d6a0"; }
  else if (bestDelta * 1000 <= 60) { judge = "Great"; points = 600; hits++; color = "#4cc9f0"; }

  score += points;
  combo++;
  maxCombo = Math.max(maxCombo, combo);
  judgments.push({ text: judge, t: songTime * 1000, lane });
  spawnParticles(lane, color);
}

function spawnParticles(lane, color) {
  const x = laneX[lane], y = hitY;
  for (let i = 0; i < 12; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 100 + Math.random() * 200;
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 400,
      color
    });
  }
}

function getAccuracy() {
  return totalJudged === 0 ? 0 : Math.round((hits / totalJudged) * 100);
}

function getRank(acc) {
  if (acc >= 95) return "S";
  if (acc >= 85) return "A";
  if (acc >= 70) return "B";
  if (acc >= 50) return "C";
  return "F";
}

// Main loop
function loop() {
  const nowPerf = performance.now();
  const songTime = (nowPerf - songStart) / 1000;
  fps = Math.round(1000 / (nowPerf - lastFrame));
  lastFrame = nowPerf;

  // Miss detection
  for (const n of notes) {
    if (!n.hit && !n.missed && songTime - n.t > 0.12) {
      n.missed = true;
      combo = 0;
      totalJudged++;
      judgments.push({ text: "Miss", t: songTime * 1000, lane: n.lane });
    }
  }

  // Update particles
  particles = particles.filter(p => (p.life -= 16) > 0);
  for (const p of particles) {
    p.x += p.vx * 0.016;
    p.y += p.vy * 0.016;
    p.vx *= 0.98;
    p.vy *= 0.98;
  }

  // Render
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, "#060606");
  g.addColorStop(1, "#0c0c0c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Lanes and target rings
  for (let i = 0; i < chart.lanes; i++) {
    ctx.fillStyle = "#141414";
    ctx.fillRect(laneX[i] - 50, 0, 100, canvas.height);

    ctx.save();
    ctx.shadowBlur = pressed.has(laneKeys[i]) ? 16 : 10;
    ctx.shadowColor = pressed.has(laneKeys[i]) ? "#ffffff" : "#7a7a7a";
    ctx.strokeStyle = pressed.has(laneKeys[i]) ? "#ffffff" : "#888";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(laneX[i], hitY, TARGET_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Notes
  for (const n of notes) {
    if (n.hit || n.missed) continue;
    const dy = (n.t - songTime) * SPEED;
    const y = hitY - dy;
    if (y < -NOTE_RADIUS || y > canvas.height + NOTE_RADIUS) continue;

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#4fd1c5";
    ctx.fillStyle = "#4fd1c5";
    ctx.beginPath();
    ctx.arc(laneX[n.lane], y, NOTE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Particles
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / 400);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Judgments
  ctx.fillStyle = "#fff";
  ctx.font = "18px sans-serif";
  judgments = judgments.filter(j => songTime * 1000 - j.t < 600);
  for (const j of judgments) {
    const age = (songTime * 1000 - j.t) / 600;
    ctx.globalAlpha = 1 - age;
    ctx.fillText(j.text, laneX[j.lane] - 32, hitY - 70 - age * 30);
    ctx.globalAlpha = 1;
  }

  // HUD
  const acc = getAccuracy();
  const rank = getRank(acc);
  fpsEl.textContent = fps;
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  accEl.textContent = acc + "%";
  rankEl.textContent = rank;

  // End screen
  if (audio.ended) {
    running = false;
    resRank.textContent = rank;
    resAcc.textContent = acc + "%";
    resMax.textContent = maxCombo;
    resScore.textContent = score;
    results.style.display = "grid";
  } else {
    requestAnimationFrame(loop);
  }
}
