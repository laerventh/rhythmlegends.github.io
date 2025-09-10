// Elements
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = document.getElementById('song');
const songSelect = document.getElementById('songSelect');

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

const globalFlash = document.getElementById('globalFlash');

// Config
const laneKeys = ['d', 'f', 'j', 'k'];
const laneX = [210, 420, 620, 810];
const hitY = 520;
const NOTE_RADIUS = 20;
const TARGET_RADIUS = 32;
const SPEED = 600;
const HIT_WINDOWS = [
  { name: 'Perfect', ms: 30, score: 1000, color: getCss('--perfect') },
  { name: 'Great',   ms: 60, score: 600,  color: getCss('--great') },
  { name: 'Good',    ms: 100, score: 300, color: getCss('--good') },
];
const MISS_COLOR = getCss('--miss');

function getCss(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// State
let chart = { offset: 0.0, lanes: 4, notes: [] };

let notes = [];
let particles = [];
let judgments = [];
let score = 0, combo = 0, maxCombo = 0;
let totalJudged = 0, hits = 0;
let songStart = 0, running = false, inEditor = false;
let pressed = new Set();
let recordedNotes = [];
let lastFrame = performance.now();
let fps = 0;

// Fever
let feverMeter = 0;      // 0..100
let feverActive = false; // doubles points for 10s

// Ghost preview when idle
let previewTime = 0; // seconds
let lastPreviewUpdate = performance.now();
let haveUserGesture = false;

// Load chart by song selection
songSelect.addEventListener('change', () => {
  loadChartForSong(songSelect.value);
});

// Buttons
playBtn.onclick = () => startGame();
editorBtn.onclick = () => startEditor();
saveBtn.onclick = () => saveChart();
loadBtn.onclick = () => loadChartFromText();

clearOut.onclick = () => chartOutput.value = '';
copyOut.onclick = () => {
  chartOutput.select();
  document.execCommand('copy');
};

resultsClose.onclick = () => results.style.display = 'none';
resultsReplay.onclick = () => { results.style.display = 'none'; startGame(); };

// Capture first user gesture to allow audio play
['click','keydown','pointerdown','touchstart'].forEach(ev =>
  window.addEventListener(ev, () => { haveUserGesture = true; }, { once: true })
);

// Input
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && feverMeter >= 100 && !feverActive) {
    feverActive = true;
    feverMeter = 0;
    flash();
    setTimeout(() => { feverActive = false; }, 10000);
    return;
  }
  if (!laneKeys.includes(e.key)) return;
  pressed.add(e.key);
  const lane = laneKeys.indexOf(e.key);
  if (!running) return;

  if (inEditor) {
    const t = (performance.now() - songStart) / 1000;
    const snapT = parseFloat(t.toFixed(3));
    recordedNotes.push({ t: snapT, lane });
    // live preview
    notes.push({ t: snapT, lane, hit: false, missed: false });
  } else {
    handleHit(lane);
  }
});
window.addEventListener('keyup', (e) => pressed.delete(e.key));

// Initial load of first song
loadChartForSong(songSelect.value);

// Core modes
function startGame() {
  inEditor = false;
  modeEl.textContent = 'Play';
  resetStateFromChart();
  startAudioAndLoop();
}

function startEditor() {
  inEditor = true;
  modeEl.textContent = 'Editor';
  recordedNotes = [];
  // Start empty note list so you see only what you record
  notes = [];
  resetHudState();
  startAudioAndLoop();
}

function startAudioAndLoop() {
  audio.src = songSelect.value;
  audio.currentTime = 0;

  // Must be triggered by a user gesture; handle rejections gracefully
  const p = audio.play();
  if (p && typeof p.then === 'function') {
    p.then(() => {
      songStart = performance.now() - audio.currentTime * 1000;
      running = true;
      requestAnimationFrame(loop);
    }).catch(err => {
      console.warn('Audio play blocked or failed:', err);
      alert('Click a button to start audio (browser blocked autoplay). Then press Play/Editor again.');
    });
  } else {
    songStart = performance.now() - audio.currentTime * 1000;
    running = true;
    requestAnimationFrame(loop);
  }
}

function resetStateFromChart() {
  // Apply offset to note times, validate lanes, sort by time
  const valid = [];
  for (const n of (chart.notes || [])) {
    if (typeof n.t !== 'number' || typeof n.lane !== 'number') continue;
    if (n.lane < 0 || n.lane >= (chart.lanes || 4)) continue;
    valid.push({ t: n.t + (chart.offset || 0), lane: n.lane, hit: false, missed: false });
  }
  valid.sort((a, b) => a.t - b.t);
  notes = valid;

  particles = [];
  judgments = [];
  resetHudState();

  if (notes.length === 0) {
    console.warn('Chart loaded but has zero valid notes. You will see nothing in Play mode.');
  }
}

function resetHudState() {
  score = 0; combo = 0; maxCombo = 0;
  totalJudged = 0; hits = 0;
  feverMeter = 0; feverActive = false;
}

// Chart saving/loading
function saveChart() {
  const data = inEditor
    ? { offset: chart.offset || 0, lanes: chart.lanes || 4, notes: recordedNotes }
    : chart;

  if (!data.notes || data.notes.length === 0) {
    alert('No notes to save. Record notes in Editor first.');
    return;
  }

  // Show in panel
  const json = JSON.stringify(data, null, 2);
  chartOutput.value = json;

  // Auto-download convenience
  const base = songSelect.value.replace('.mp3', '.json');
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = base;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadChartFromText() {
  try {
    const parsed = JSON.parse(chartInput.value);
    const validated = validateChart(parsed);
    chart = validated;
    modeEl.textContent = 'Play (loaded)';
    console.log('Loaded chart from panel:', chart);
    // Prepare preview notes (ghost) by resetting preview time
    previewTime = 0;
  } catch (err) {
    alert('Failed to load chart: ' + err.message);
  }
}

// Fetch chart matching the selected mp3
function loadChartForSong(songFile) {
  const chartFile = songFile.replace('.mp3', '.json');
  fetch(chartFile, { cache: 'no-cache' })
    .then(res => {
      if (!res.ok) throw new Error(`Chart not found: ${chartFile}`);
      return res.json();
    })
    .then(data => {
      chart = validateChart(data);
      modeEl.textContent = `Ready: ${songFile}`;
      console.log(`Loaded chart for ${songFile}:`, chart);
      previewTime = 0;
    })
    .catch(err => {
      console.warn(`Could not load ${chartFile}:`, err.message);
      // Fallback: simple demo chart so preview shows something
      chart = {
        offset: 0,
        lanes: 4,
        notes: [
          { t: 1.0, lane: 0 }, { t: 1.5, lane: 1 }, { t: 2.0, lane: 2 }, { t: 2.5, lane: 3 },
          { t: 3.0, lane: 0 }, { t: 3.5, lane: 1 }, { t: 4.0, lane: 2 }, { t: 4.5, lane: 3 }
        ]
      };
      modeEl.textContent = `Ready (fallback): ${songFile}`;
      previewTime = 0;
    });
}

function validateChart(data) {
  if (!data || typeof data !== 'object') throw new Error('Chart is not an object');
  const lanes = (typeof data.lanes === 'number' && data.lanes >= 1) ? data.lanes : 4;
  const offset = typeof data.offset === 'number' ? data.offset : 0;
  const notes = Array.isArray(data.notes) ? data.notes : [];
  const filtered = notes.filter(n =>
    n && typeof n.t === 'number' && typeof n.lane === 'number' && n.lane >= 0 && n.lane < lanes
  ).sort((a, b) => a.t - b.t);
  if (filtered.length === 0) {
    console.warn('Chart has zero valid notes after validation.');
  }
  return { lanes, offset, notes: filtered };
}

// Judging helpers
function handleHit(lane) {
  const songTime = (performance.now() - songStart) / 1000;
  let cand = null, bestDelta = Infinity;

  for (const n of notes) {
    if (n.lane !== lane || n.hit || n.missed) continue;
    const delta = Math.abs(n.t - songTime);
    if (delta < bestDelta) { bestDelta = delta; cand = n; }
  }
  if (!cand || bestDelta * 1000 > 120) return;

  cand.hit = true;
  totalJudged++;

  let judge = 'Good', points = 300, color = getCss('--good');
  if (bestDelta * 1000 <= 30) { judge = 'Perfect'; points = 1000; hits++; color = getCss('--perfect'); }
  else if (bestDelta * 1000 <= 60) { judge = 'Great'; points = 600; hits++; color = getCss('--great'); }

  if (feverActive) points *= 2;
  score += points;
  combo++;
  maxCombo = Math.max(maxCombo, combo);

  judgments.push({ text: judge, t: songTime * 1000, lane });
  spawnHitParticles(lane, color, judge);

  if (judge === 'Perfect' || judge === 'Great') feverMeter = Math.min(100, feverMeter + 5);

  if ([50, 100, 200].includes(combo)) {
    flash();
    spawnMilestoneParticles();
  }
}

function spawnHitParticles(lane, color, judge) {
  const x = laneX[lane], y = hitY;
  const count = judge === 'Perfect' ? 18 : judge === 'Great' ? 14 : 10;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 140 + Math.random() * 220;
    const r = judge === 'Perfect' ? 3.5 : judge === 'Great' ? 3 : 2.5;
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 450,
      radius: r,
      color
    });
  }
}

function spawnMissParticles(lane) {
  const x = laneX[lane], y = hitY;
  for (let i = 0; i < 12; i++) {
    const ang = (Math.random() * 0.6 - 0.3) + Math.PI; // mostly downward
    const spd = 120 + Math.random() * 160;
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 350,
      radius: 2.5,
      color: MISS_COLOR
    });
  }
}

function spawnMilestoneParticles() {
  const cx = canvas.width / 2, cy = hitY;
  for (let i = 0; i < 36; i++) {
    const ang = (i / 36) * Math.PI * 2;
    const spd = 200 + Math.random() * 120;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 500,
      radius: 3,
      color: getCss('--accent')
    });
  }
}

function flash() {
  globalFlash.classList.add('active');
  setTimeout(() => globalFlash.classList.remove('active'), 120);
}

function getAccuracy() {
  return totalJudged === 0 ? 0 : Math.round((hits / totalJudged) * 100);
}

function getRank(acc) {
  if (acc >= 95) return 'S';
  if (acc >= 85) return 'A';
  if (acc >= 70) return 'B';
  if (acc >= 50) return 'C';
  return 'F';
}

// Main render/update loop
function loop() {
  const nowPerf = performance.now();
  const dt = nowPerf - lastFrame;
  lastFrame = nowPerf;
  fps = Math.round(1000 / Math.max(dt, 0.001));

  // Update preview clock even when not running
  if (!running) {
    const pdt = (nowPerf - lastPreviewUpdate) / 1000;
    lastPreviewUpdate = nowPerf;
    previewTime = (previewTime + pdt) % 6.0; // loop a few seconds worth of notes
  }

  // Update when running
  let songTime = 0;
  if (running) {
    songTime = (nowPerf - songStart) / 1000;

    // Miss detection
    for (const n of notes) {
      if (!n.hit && !n.missed && songTime - n.t > 0.12) {
        n.missed = true;
        combo = 0;
        totalJudged++;
        judgments.push({ text: 'Miss', t: songTime * 1000, lane: n.lane });
        spawnMissParticles(n.lane);
      }
    }

    // Update particles
    particles = particles.filter(p => (p.life -= dt) > 0);
    const sec = dt / 1000;
    for (const p of particles) {
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.vx *= 0.985;
      p.vy *= 0.985;
    }
  } else {
    // Idle particles fade out slowly
    particles = particles.filter(p => (p.life -= dt * 0.6) > 0);
  }

  // Render
  drawBackground(songTime);
  drawLanes();
  drawNotes(running ? songTime : previewTime, !running); // ghost when idle
  drawParticles();
  drawJudgments();

  // HUD
  const acc = getAccuracy();
  const rank = getRank(acc);
  fpsEl.textContent = fps;
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  accEl.textContent = acc + '%';
  rankEl.textContent = rank;

  // End screen
  if (running && audio.ended) {
    running = false;
    resRank.textContent = rank;
    resAcc.textContent = acc + '%';
    resMax.textContent = maxCombo;
    resScore.textContent = score;
    results.style.display = 'grid';
  }

  requestAnimationFrame(loop);
}

// Drawing
function drawBackground(songTime) {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  const pulse = feverActive ? (0.5 + 0.5 * Math.sin(songTime * 6.28)) * 0.1 : 0;
  g.addColorStop(0, `rgba(6,6,6,1)`);
  g.addColorStop(1, `rgba(12,12,12,${1 - pulse})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawLanes() {
  for (let i = 0; i < (chart.lanes || 4); i++) {
    // Lane background
    ctx.fillStyle = '#141414';
    ctx.fillRect(laneX[i] - 50, 0, 100, canvas.height);

    // Target ring with press glow
    ctx.save();
    const pressedNow = pressed.has(laneKeys[i]);
    ctx.shadowBlur = pressedNow ? 16 : 10;
    ctx.shadowColor = pressedNow ? '#ffffff' : '#7a7a7a';
    ctx.strokeStyle = pressedNow ? '#ffffff' : '#888';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(laneX[i], hitY, TARGET_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawNotes(time, ghost=false) {
  const showNotes = ghost
    ? (chart.notes || []).map(n => ({ t: n.t + (chart.offset || 0), lane: n.lane }))
    : notes.filter(n => !n.hit && !n.missed);

  ctx.save();
  for (const n of showNotes) {
    const dy = (n.t - time) * SPEED;
    const y = hitY - dy;
    if (y < -NOTE_RADIUS || y > canvas.height + NOTE_RADIUS) continue;

    ctx.shadowBlur = 18;
    const color = ghost ? 'rgba(79,209,197,0.35)' : '#4fd1c5';
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(laneX[n.lane], y, NOTE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / 500);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius || 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawJudgments() {
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  const nowMs = running ? (performance.now() - songStart) : performance.now();
  judgments = judgments.filter(j => (nowMs - j.t) < 600);
  for (const j of judgments) {
    const age = (nowMs - j.t) / 600;
    ctx.globalAlpha = 1 - age;
    ctx.fillText(j.text, laneX[j.lane] - 32, hitY - 70 - age * 30);
    ctx.globalAlpha = 1;
  }
}
