const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const miniMapCanvas = document.getElementById("miniMapCanvas");
const miniCtx = miniMapCanvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const muteBtn = document.getElementById("muteBtn");
const rightHandBtn = document.getElementById("rightHandBtn");
const leftHandBtn = document.getElementById("leftHandBtn");
const rightPanel = document.querySelector(".rightPanel");

const scoreEl = document.getElementById("scoreEl");
const pitchesEl = document.getElementById("pitchesEl");
const hitsEl = document.getElementById("hitsEl");
const missesEl = document.getElementById("missesEl");
const veloEl = document.getElementById("veloEl");
const instructionChip = document.getElementById("instructionChip");

const pitchSpeedSlider = document.getElementById("pitchSpeed");
const swingThresholdSlider = document.getElementById("swingThreshold");
const pitchDelaySlider = document.getElementById("pitchDelay");

const pitchSpeedVal = document.getElementById("pitchSpeedVal");
const swingThresholdVal = document.getElementById("swingThresholdVal");
const pitchDelayVal = document.getElementById("pitchDelayVal");

pitchSpeedSlider.oninput = () => pitchSpeedVal.textContent = pitchSpeedSlider.value;
swingThresholdSlider.oninput = () => swingThresholdVal.textContent = swingThresholdSlider.value;
pitchDelaySlider.oninput = () => pitchDelayVal.textContent = `${pitchDelaySlider.value}s`;

let detector = null;
let animationId = null;
let gameState = "start"; // start | countdown | playing | paused | end
let battingSide = "right";

let score = 0;
let hits = 0;
let misses = 0;
let bestExitVelo = 0;
let pitchesLeft = 10;
const roundPitches = 10;

let prevBatPoint = null;
let batVelocity = { x: 0, y: 0, speed: 0 };

let ball = null;
let hitText = "";
let hitTextTimer = 0;
let flashTimer = 0;
let confetti = [];
let floatingStars = [];
let homerBursts = [];
let homerTrailParticles = [];
let batTrail = [];
let pitchTimer = null;
let screenShakeTimer = 0;
let screenShakeAmount = 0;

let countdownActive = false;
let countdownValue = 5;
let countdownTimer = null;

const BALL_RADIUS = 14;
const GRAVITY = 0.44;
const CONTACT_DISTANCE = 68;
const BAT_LENGTH = 132;

const SKELETON_SCALE = 0.68;
const SKELETON_OFFSET_Y = 100;
const SKELETON_OFFSET_X = 0;

// ---------- AUDIO ----------
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioCtx = new AudioCtx();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function tone(freq, duration, type = "sine", gainValue = 0.12, startTime = 0) {
  if (!soundEnabled || !audioCtx) return;

  const now = audioCtx.currentTime + startTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.03);
}

function playStartSound() {
  tone(523.25, 0.10, "triangle", 0.14, 0);
  tone(659.25, 0.12, "triangle", 0.14, 0.08);
  tone(783.99, 0.16, "triangle", 0.14, 0.16);
}

function playPitchSound() {
  tone(240, 0.08, "sawtooth", 0.09, 0);
  tone(180, 0.08, "sawtooth", 0.07, 0.05);
}

function playMissSound() {
  tone(220, 0.08, "square", 0.08, 0);
  tone(170, 0.10, "square", 0.06, 0.06);
}

function playHitSound() {
  tone(180, 0.03, "square", 0.14, 0);
  tone(320, 0.08, "triangle", 0.10, 0.015);
}

function playBigHitSound() {
  tone(220, 0.04, "square", 0.15, 0);
  tone(440, 0.08, "triangle", 0.12, 0.03);
  tone(660, 0.12, "triangle", 0.10, 0.08);
}

function playHomeRunSound() {
  tone(392, 0.10, "triangle", 0.14, 0);
  tone(523.25, 0.10, "triangle", 0.14, 0.08);
  tone(659.25, 0.12, "triangle", 0.14, 0.16);
  tone(783.99, 0.18, "triangle", 0.14, 0.26);
  tone(1046.5, 0.20, "triangle", 0.12, 0.42);
}

function playCountdownBeep(num) {
  const f = num > 1 ? 660 : 880;
  tone(f, 0.10, "triangle", 0.11, 0);
}

function playGoSound() {
  tone(880, 0.08, "triangle", 0.12, 0);
  tone(1174.66, 0.12, "triangle", 0.12, 0.08);
}

// ---------- HELPERS ----------
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getKeypoint(pose, name, minScore = 0.28) {
  return pose?.keypoints?.find(k => k.name === name && (k.score ?? 0) > minScore) || null;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

window.addEventListener("resize", resizeCanvas);

function updateHud() {
  scoreEl.textContent = score;
  pitchesEl.textContent = pitchesLeft;
  hitsEl.textContent = hits;
  missesEl.textContent = misses;
  veloEl.textContent = Math.round(bestExitVelo);
}

function clearPitchTimer() {
  if (pitchTimer) {
    clearTimeout(pitchTimer);
    pitchTimer = null;
  }
}

function clearCountdownTimer() {
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
}

function showControlsPanel() {
  if (!rightPanel) return;
  rightPanel.style.transition = "opacity 500ms ease";
  rightPanel.style.opacity = "1";
  rightPanel.style.pointerEvents = "auto";
}

function hideControlsPanel() {
  if (!rightPanel) return;
  rightPanel.style.transition = "opacity 700ms ease";
  rightPanel.style.opacity = "0.08";
  rightPanel.style.pointerEvents = "none";
}

function scheduleNextPitch() {
  clearPitchTimer();

  if (pitchesLeft <= 0) return;
  if (gameState !== "playing") return;

  const delayMs = Math.round(parseFloat(pitchDelaySlider.value) * 1000);

  instructionChip.textContent = "Get ready for the next pitch...";
  pitchTimer = setTimeout(() => {
    if (gameState === "playing" && !ball) {
      createPitch();
      instructionChip.textContent = "Swing across your body to meet the ball.";
    }
  }, delayMs);
}

function resetRound() {
  clearPitchTimer();
  clearCountdownTimer();
  score = 0;
  hits = 0;
  misses = 0;
  bestExitVelo = 0;
  pitchesLeft = roundPitches;
  prevBatPoint = null;
  batVelocity = { x: 0, y: 0, speed: 0 };
  ball = null;
  hitText = "";
  hitTextTimer = 0;
  flashTimer = 0;
  confetti = [];
  floatingStars = [];
  homerBursts = [];
  homerTrailParticles = [];
  batTrail = [];
  screenShakeTimer = 0;
  screenShakeAmount = 0;
  countdownActive = false;
  countdownValue = 5;
  updateHud();
  instructionChip.textContent = "Big upward swings can turn doubles into triples. Home runs trigger a giant celebration.";
  showControlsPanel();
}

// ---------- CAMERA / MODEL ----------
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });

  video.srcObject = stream;

  await new Promise(resolve => {
    video.onloadedmetadata = () => resolve();
  });

  await video.play();
  resizeCanvas();
}

async function loadModel() {
  await tf.ready();
  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
    }
  );
}

// ---------- BACKGROUND ----------
function drawRoundedRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawInteriorWindows(yTop, yBottom) {
  const cols = 11;
  const pad = canvas.width * 0.008;
  const usableW = canvas.width - pad * 2;
  const colW = usableW / cols;

  for (let i = 0; i < cols; i++) {
    const x = pad + i * colW;

    ctx.fillStyle = "#51637a";
    ctx.fillRect(x, yTop, colW - 6, yBottom - yTop);

    const innerPad = 6;
    const ix = x + innerPad;
    const iy = yTop + innerPad;
    const iw = colW - 6 - innerPad * 2;
    const ih = yBottom - yTop - innerPad * 2;

    const winGrad = ctx.createLinearGradient(0, iy, 0, iy + ih);
    winGrad.addColorStop(0, "#eef7ff");
    winGrad.addColorStop(1, "#d8e7f0");
    ctx.fillStyle = winGrad;
    ctx.fillRect(ix, iy, iw, ih);

    ctx.strokeStyle = "rgba(90,110,130,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ix + iw * 0.5, iy);
    ctx.lineTo(ix + iw * 0.5, iy + ih);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ix, iy + ih * 0.52);
    ctx.lineTo(ix + iw, iy + ih * 0.52);
    ctx.stroke();

    ctx.fillStyle = "rgba(90,102,120,0.28)";
    const baseY = iy + ih;
    for (let b = 0; b < 4; b++) {
      const bx = ix + b * (iw / 4) + 2;
      const bw = iw / 6;
      const bh = ih * (0.25 + ((b + i) % 3) * 0.12);
      ctx.fillRect(bx, baseY - bh, bw, bh);
    }
  }
}

function drawRoofAndLights() {
  const roofGrad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.18);
  roofGrad.addColorStop(0, "#22324a");
  roofGrad.addColorStop(1, "#36475f");
  ctx.fillStyle = roofGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height * 0.16);

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height * 0.07);
  ctx.quadraticCurveTo(canvas.width * 0.5, canvas.height * 0.02, canvas.width, canvas.height * 0.07);
  ctx.stroke();

  const lightW = canvas.width * 0.12;
  const lightH = canvas.height * 0.06;

  function drawLightBank(x, y) {
    ctx.save();
    ctx.fillStyle = "#4d5a6d";
    drawRoundedRectPath(x, y, lightW, lightH, 8);
    ctx.fill();
    ctx.strokeStyle = "#2a3442";
    ctx.lineWidth = 3;
    ctx.stroke();

    const cols = 7;
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = x + 14 + c * ((lightW - 28) / (cols - 1));
        const cy = y + 14 + r * ((lightH - 28) / (rows - 1));
        ctx.fillStyle = "#fff8d2";
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawLightBank(canvas.width * 0.18, canvas.height * 0.02);
  drawLightBank(canvas.width * 0.70, canvas.height * 0.02);
}

function drawScoreboardCenter() {
  const cx = canvas.width * 0.51;
  const top = canvas.height * 0.08;
  const boardW = canvas.width * 0.20;
  const boardH = canvas.height * 0.18;

  ctx.save();
  ctx.fillStyle = "#243b73";
  drawRoundedRectPath(cx - boardW * 0.16, top - 10, boardW * 0.32, boardH * 0.25, 18);
  ctx.fill();
  ctx.strokeStyle = "#1a2947";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${Math.max(28, canvas.width * 0.03)}px serif`;
  ctx.textAlign = "center";
  ctx.fillText("NY", cx, top + boardH * 0.13);

  const bodyY = top + boardH * 0.18;
  ctx.fillStyle = "#223a73";
  drawRoundedRectPath(cx - boardW / 2, bodyY, boardW, boardH, 18);
  ctx.fill();
  ctx.strokeStyle = "#142544";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = "#102446";
  drawRoundedRectPath(cx - boardW * 0.42, bodyY + boardH * 0.10, boardW * 0.84, boardH * 0.34, 12);
  ctx.fill();

  ctx.fillStyle = "#e53a37";
  drawRoundedRectPath(cx - boardW * 0.36, bodyY + boardH * 0.58, boardW * 0.72, boardH * 0.18, 10);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${Math.max(18, canvas.width * 0.016)}px "Nunito", sans-serif`;
  ctx.fillText("BRONX CHILDREN'S", cx, bodyY + boardH * 0.23);

  ctx.fillStyle = "#ffcc33";
  ctx.font = `900 ${Math.max(24, canvas.width * 0.022)}px "Baloo 2", sans-serif`;
  ctx.fillText("MUSEUM", cx, bodyY + boardH * 0.41);

  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${Math.max(14, canvas.width * 0.014)}px "Nunito", sans-serif`;
  ctx.fillText("HOME RUN ZONE", cx, bodyY + boardH * 0.705);

  function circleBadge(x, y, r) {
    ctx.fillStyle = "#f0f5ff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b94e4b";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#cc4b4b";
    ctx.font = `900 ${Math.max(12, r * 0.9)}px serif`;
    ctx.fillText("Y", x, y + 5);
  }

  circleBadge(cx - boardW * 0.52, bodyY + boardH * 0.48, boardW * 0.10);
  circleBadge(cx + boardW * 0.34, bodyY + boardH * 0.35, boardW * 0.06);

  ctx.fillStyle = "#1d2f4f";
  drawRoundedRectPath(cx - boardW * 0.20, bodyY + boardH * 0.82, boardW * 0.40, boardH * 0.40, 10);
  ctx.fill();
  ctx.strokeStyle = "#12233b";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

function drawFenceWall(yTop) {
  const fenceY = yTop;
  const wallY = yTop + canvas.height * 0.08;
  const wallH = canvas.height * 0.12;

  ctx.strokeStyle = "#5f6c7d";
  ctx.lineWidth = 2;
  for (let x = 0; x < canvas.width; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, fenceY);
    ctx.lineTo(x + 20, wallY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 20, fenceY);
    ctx.lineTo(x, wallY);
    ctx.stroke();
  }

  for (let x = 0; x < canvas.width; x += canvas.width / 10) {
    ctx.strokeStyle = "#445365";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, fenceY - 6);
    ctx.lineTo(x, wallY);
    ctx.stroke();
  }

  const wallGrad = ctx.createLinearGradient(0, wallY, 0, wallY + wallH);
  wallGrad.addColorStop(0, "#304d8a");
  wallGrad.addColorStop(1, "#223b71");
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, wallY, canvas.width, wallH);

  ctx.strokeStyle = "#5b78ad";
  ctx.lineWidth = 2;
  for (let x = 0; x < canvas.width; x += canvas.width / 12) {
    ctx.beginPath();
    ctx.moveTo(x, wallY);
    ctx.lineTo(x, wallY + wallH);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `900 ${Math.max(26, canvas.width * 0.028)}px serif`;
  ctx.textAlign = "center";
  ctx.fillText("NY", canvas.width * 0.04, wallY + wallH * 0.45);
  ctx.fillText("NY", canvas.width * 0.96, wallY + wallH * 0.45);
  ctx.fillText("NY", canvas.width * 0.50, wallY + wallH * 0.45);
}

function drawIndoorField() {
  const fieldTop = canvas.height * 0.60;

  const turfGrad = ctx.createLinearGradient(0, fieldTop, 0, canvas.height);
  turfGrad.addColorStop(0, "#65b84f");
  turfGrad.addColorStop(1, "#4d9c3e");
  ctx.fillStyle = turfGrad;
  ctx.fillRect(0, fieldTop, canvas.width, canvas.height - fieldTop);

  const stripeH = (canvas.height - fieldTop) / 6;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(0, fieldTop + i * stripeH, canvas.width, stripeH);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.10, canvas.height * 0.83);
  ctx.lineTo(canvas.width * 0.60, canvas.height * 0.66);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.38, canvas.height * 0.84);
  ctx.lineTo(canvas.width * 0.94, canvas.height * 0.66);
  ctx.stroke();

  ctx.fillStyle = "#c97342";
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.00, canvas.height * 0.78);
  ctx.lineTo(canvas.width * 0.18, canvas.height * 0.76);
  ctx.lineTo(canvas.width * 0.28, canvas.height * 0.92);
  ctx.lineTo(canvas.width * 0.00, canvas.height * 0.97);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.05, canvas.height * 0.86);
  ctx.lineTo(canvas.width * 0.17, canvas.height * 0.86);
  ctx.lineTo(canvas.width * 0.26, canvas.height * 0.97);
  ctx.lineTo(canvas.width * 0.14, canvas.height * 0.97);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.07, canvas.height * 0.82);
  ctx.lineTo(canvas.width * 0.19, canvas.height * 0.82);
  ctx.lineTo(canvas.width * 0.28, canvas.height * 0.93);
  ctx.lineTo(canvas.width * 0.16, canvas.height * 0.93);
  ctx.closePath();
  ctx.stroke();

  const px = canvas.width * 0.12;
  const py = canvas.height * 0.87;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(px - 18, py);
  ctx.lineTo(px + 6, py);
  ctx.lineTo(px + 16, py + 8);
  ctx.lineTo(px - 2, py + 18);
  ctx.lineTo(px - 22, py + 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#c26b3d";
  ctx.beginPath();
  ctx.ellipse(canvas.width * 0.78, canvas.height * 0.86, canvas.width * 0.12, canvas.height * 0.08, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f1e9d8";
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.83, canvas.height * 0.79);
  ctx.lineTo(canvas.width * 0.85, canvas.height * 0.785);
  ctx.lineTo(canvas.width * 0.86, canvas.height * 0.80);
  ctx.lineTo(canvas.width * 0.84, canvas.height * 0.815);
  ctx.lineTo(canvas.width * 0.825, canvas.height * 0.805);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(canvas.width * 0.52, canvas.height * 0.70);
  ctx.rotate(-0.03);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `900 ${Math.max(18, canvas.width * 0.022)}px "Baloo 2", sans-serif`;
  ctx.fillText("HOME RUN ZONE", 0, 0);
  ctx.restore();
}

function drawBackground() {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.55);
  skyGrad.addColorStop(0, "#2c3d57");
  skyGrad.addColorStop(1, "#b8c8d6");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawRoofAndLights();
  drawInteriorWindows(canvas.height * 0.16, canvas.height * 0.55);
  drawScoreboardCenter();
  drawFenceWall(canvas.height * 0.48);
  drawIndoorField();

  const haze = ctx.createLinearGradient(0, 0, 0, canvas.height);
  haze.addColorStop(0, "rgba(255,255,255,0.06)");
  haze.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ---------- SKELETON SCALING ----------
function scalePoint(p, center, scale) {
  if (!p) return null;
  return {
    x: center.x + (p.x - center.x) * scale + SKELETON_OFFSET_X,
    y: center.y + (p.y - center.y) * scale + SKELETON_OFFSET_Y
  };
}

function getPoseCenter(points) {
  const valid = points.filter(Boolean);
  if (!valid.length) return null;
  return {
    x: valid.reduce((s, p) => s + p.x, 0) / valid.length,
    y: valid.reduce((s, p) => s + p.y, 0) / valid.length
  };
}

// ---------- SHORTER STICK FIGURE / SINGLE TORSO LINE ----------
function drawStickBone(a, b, color, width = 6, glow = 8) {
  if (!a || !b) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.shadowBlur = glow;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawStickJoint(p, radius = 5, color = "#ffffff", glow = 6) {
  if (!p) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowBlur = glow;
  ctx.shadowColor = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function midPoint(a, b, t = 0.5) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function drawBatTrail() {
  if (batTrail.length < 2) return;

  for (let i = 1; i < batTrail.length; i++) {
    const a = batTrail[i - 1];
    const b = batTrail[i];
    const alpha = i / batTrail.length;

    ctx.save();
    ctx.strokeStyle = `rgba(${a.color.r}, ${a.color.g}, ${a.color.b}, ${alpha * 0.55})`;
    ctx.lineWidth = 4 + alpha * 8;
    ctx.lineCap = "round";
    ctx.shadowBlur = 10;
    ctx.shadowColor = `rgba(${a.color.r}, ${a.color.g}, ${a.color.b}, 0.8)`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
}

function updateBatTrail(batTip) {
  if (!batTip) return;

  const strong = batVelocity.speed > 520;
  const color = strong
    ? { r: 255, g: 208, b: 70 }
    : { r: 88, g: 225, b: 255 };

  batTrail.push({
    x: batTip.x,
    y: batTip.y,
    life: 10,
    color
  });

  if (batTrail.length > 12) batTrail.shift();
}

function tickBatTrail() {
  for (let i = batTrail.length - 1; i >= 0; i--) {
    batTrail[i].life--;
    if (batTrail[i].life <= 0) batTrail.splice(i, 1);
  }
}

function drawStickFigure(pose) {
  let ls = getKeypoint(pose, "left_shoulder");
  let rs = getKeypoint(pose, "right_shoulder");
  let le = getKeypoint(pose, "left_elbow");
  let re = getKeypoint(pose, "right_elbow");
  let lw = getKeypoint(pose, "left_wrist");
  let rw = getKeypoint(pose, "right_wrist");
  let lh = getKeypoint(pose, "left_hip");
  let rh = getKeypoint(pose, "right_hip");
  let lk = getKeypoint(pose, "left_knee");
  let rk = getKeypoint(pose, "right_knee");
  let la = getKeypoint(pose, "left_ankle");
  let ra = getKeypoint(pose, "right_ankle");
  let nose = getKeypoint(pose, "nose");
  let leye = getKeypoint(pose, "left_eye", 0.2);
  let reye = getKeypoint(pose, "right_eye", 0.2);

  const center = getPoseCenter([ls, rs, le, re, lw, rw, lh, rh, lk, rk, la, ra, nose]);
  if (!center) return { rw: null, re: null, lw: null, le: null };

  ls = scalePoint(ls, center, SKELETON_SCALE);
  rs = scalePoint(rs, center, SKELETON_SCALE);
  le = scalePoint(le, center, SKELETON_SCALE);
  re = scalePoint(re, center, SKELETON_SCALE);
  lw = scalePoint(lw, center, SKELETON_SCALE);
  rw = scalePoint(rw, center, SKELETON_SCALE);
  lh = scalePoint(lh, center, SKELETON_SCALE);
  rh = scalePoint(rh, center, SKELETON_SCALE);
  lk = scalePoint(lk, center, SKELETON_SCALE);
  rk = scalePoint(rk, center, SKELETON_SCALE);
  la = scalePoint(la, center, SKELETON_SCALE);
  ra = scalePoint(ra, center, SKELETON_SCALE);
  nose = scalePoint(nose, center, SKELETON_SCALE);
  leye = scalePoint(leye, center, SKELETON_SCALE);
  reye = scalePoint(reye, center, SKELETON_SCALE);

  const armColor = "#58e1ff";
  const legColor = "#8df55f";
  const coreColor = "#ffd54f";
  const headColor = "#ffb86c";

  const shoulderMid = (ls && rs) ? midPoint(ls, rs, 0.5) : null;
  const hipMid = (lh && rh) ? midPoint(lh, rh, 0.5) : null;

  if (shoulderMid && hipMid) {
    const shortHip = midPoint(shoulderMid, hipMid, 0.62);
    drawStickBone(shoulderMid, shortHip, coreColor, 7);
  }

  if (ls && rs) drawStickBone(ls, rs, coreColor, 5);

  drawStickBone(ls, le, armColor, 6);
  drawStickBone(le, lw, armColor, 6);
  drawStickBone(rs, re, armColor, 6);
  drawStickBone(re, rw, armColor, 6);

  if (hipMid && lk) drawStickBone(hipMid, lk, legColor, 6);
  if (lk && la) drawStickBone(lk, la, legColor, 6);
  if (hipMid && rk) drawStickBone(hipMid, rk, legColor, 6);
  if (rk && ra) drawStickBone(rk, ra, legColor, 6);

  if (nose && shoulderMid) {
    drawStickBone(shoulderMid, nose, headColor, 5);
  }

  if (nose && leye && reye) {
    const headR = Math.max(10, Math.abs(leye.x - reye.x) * 0.95);
    ctx.save();
    ctx.strokeStyle = headColor;
    ctx.lineWidth = 4;
    ctx.shadowBlur = 8;
    ctx.shadowColor = headColor;
    ctx.beginPath();
    ctx.arc(nose.x, nose.y + 3, headR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  [ls, rs, le, re, lw, rw, lk, rk, la, ra].forEach(p => drawStickJoint(p, 4, "#ffffff", 5));
  if (shoulderMid) drawStickJoint(shoulderMid, 3, "#ffffff", 4);
  if (hipMid) drawStickJoint(hipMid, 3, "#ffffff", 4);

  return { rw, re, lw, le };
}

function getBattingArm(points) {
  if (battingSide === "right") {
    return (points.rw && points.re) ? { wrist: points.rw, elbow: points.re } : null;
  }
  return (points.lw && points.le) ? { wrist: points.lw, elbow: points.le } : null;
}

function drawBatFromSide(wrist, elbow) {
  if (!wrist || !elbow) return null;

  const dx = wrist.x - elbow.x;
  const dy = wrist.y - elbow.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;

  const batTip = {
    x: wrist.x + nx * BAT_LENGTH,
    y: wrist.y + ny * BAT_LENGTH
  };

  const handleEnd = {
    x: wrist.x - nx * 26,
    y: wrist.y - ny * 26
  };

  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = "#5d4037";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(handleEnd.x, handleEnd.y);
  ctx.lineTo(batTip.x, batTip.y);
  ctx.stroke();

  ctx.strokeStyle = "#ffca28";
  ctx.lineWidth = 8;
  ctx.shadowBlur = 16;
  ctx.shadowColor = "#ffca28";
  ctx.beginPath();
  ctx.moveTo(wrist.x, wrist.y);
  ctx.lineTo(batTip.x, batTip.y);
  ctx.stroke();

  ctx.restore();

  return batTip;
}

function updateBatVelocity(point) {
  const now = performance.now();

  if (!prevBatPoint) {
    prevBatPoint = { ...point, t: now };
    batVelocity = { x: 0, y: 0, speed: 0 };
    return;
  }

  const dt = Math.max((now - prevBatPoint.t) / 1000, 0.001);
  const vx = (point.x - prevBatPoint.x) / dt;
  const vy = (point.y - prevBatPoint.y) / dt;

  batVelocity = {
    x: vx,
    y: vy,
    speed: Math.hypot(vx, vy)
  };

  prevBatPoint = { ...point, t: now };
}

// ---------- BALL / HITS ----------
function createPitch() {
  if (pitchesLeft <= 0) return;
  if (gameState !== "playing") return;
  if (ball) return;

  ball = {
    x: canvas.width + 30,
    y: canvas.height * (0.62 + Math.random() * 0.06),
    vx: -parseFloat(pitchSpeedSlider.value) - Math.random() * 1.2,
    vy: (Math.random() - 0.5) * 0.18,
    hit: false,
    active: true,
    trail: [],
    result: ""
  };

  playPitchSound();
}

function classifyHit(power, upwardSwing) {
  if (power > 1.9 && upwardSwing > 0.6) {
    return { label: "HOME RUN!", points: 80, confettiCount: 42, launchBoost: 1.28 };
  }
  if (power > 1.5 && upwardSwing > 0.25) {
    return { label: "TRIPLE!", points: 45, confettiCount: 24, launchBoost: 1.02 };
  }
  if (power > 1.08) {
    return { label: "DOUBLE!", points: 28, confettiCount: 16, launchBoost: 0.88 };
  }
  if (power > 0.66) {
    return { label: "SINGLE!", points: 16, confettiCount: 10, launchBoost: 0.72 };
  }
  return { label: "FOUL TIP!", points: 8, confettiCount: 6, launchBoost: 0.54 };
}

function triggerHomeRunCelebration(x, y) {
  screenShakeTimer = 28;
  screenShakeAmount = 14;
  flashTimer = 14;

  for (let i = 0; i < 4; i++) {
    homerBursts.push({
      x: x + (Math.random() - 0.5) * 120,
      y: y + (Math.random() - 0.5) * 80,
      radius: 10,
      life: 26 + i * 4,
      color: ["#ffd54f", "#42a5f5", "#ff7043", "#66bb6a"][i % 4]
    });
  }

  spawnConfetti(x, y, 100);
  spawnStars(x, y, "HOME RUN!");
  spawnStars(x + 80, y - 40, "HOME RUN!");
  spawnStars(x - 80, y - 20, "HOME RUN!");
}

function tryHit(batTip) {
  if (!ball || !ball.active || ball.hit) return;

  const d = Math.hypot(ball.x - batTip.x, ball.y - batTip.y);
  if (d > CONTACT_DISTANCE) return;
  if (batVelocity.speed < parseFloat(swingThresholdSlider.value)) return;

  ball.hit = true;

  const power = clamp(batVelocity.speed / 700, 0.35, 2.1);
  const upwardSwing = clamp((-batVelocity.y) / 700, -0.4, 1.0);

  let lateral;
  if (battingSide === "right") {
    lateral = batVelocity.x >= 0 ? 1 : -1;
  } else {
    lateral = batVelocity.x <= 0 ? -1 : 1;
  }

  const result = classifyHit(power, upwardSwing);

  const baseVX = 9 + power * 8;
  const baseVY = -(4 + Math.max(0, upwardSwing) * 7 + power * 2.2);

  ball.vx = lateral * baseVX * result.launchBoost + (Math.random() - 0.5) * 1.4;
  ball.vy = baseVY * result.launchBoost + (Math.random() - 0.5) * 1.0;
  ball.result = result.label;

  score += result.points;
  hits++;
  bestExitVelo = Math.max(bestExitVelo, power * 100);
  pitchesLeft--;

  showHitText(result.label);
  spawnConfetti(ball.x, ball.y, result.confettiCount);
  spawnStars(ball.x, ball.y, result.label);
  updateHud();

  if (result.label === "HOME RUN!") {
    playHomeRunSound();
    triggerHomeRunCelebration(ball.x, ball.y);
    instructionChip.textContent = "HOME RUN! BIG celebration!";
  } else if (result.label === "TRIPLE!" || result.label === "DOUBLE!") {
    playBigHitSound();
    instructionChip.textContent = result.label;
  } else {
    playHitSound();
    instructionChip.textContent = result.label;
  }
}

function resolveMiss() {
  misses++;
  pitchesLeft--;
  ball = null;
  updateHud();
  playMissSound();
  instructionChip.textContent = "Miss! Reset and get ready.";
  scheduleNextPitch();
}

function resolveFinishedHit() {
  ball = null;
  instructionChip.textContent = "Nice! Get ready for the next pitch.";
  scheduleNextPitch();
}

function spawnHomeRunTrail() {
  if (!ball || ball.result !== "HOME RUN!") return;

  homerTrailParticles.push({
    x: ball.x,
    y: ball.y,
    vx: (Math.random() - 0.5) * 1.5,
    vy: (Math.random() - 0.5) * 1.5,
    life: 18 + Math.random() * 8,
    size: 4 + Math.random() * 5,
    color: ["#ffd54f", "#ffffff", "#42a5f5", "#ff7043"][Math.floor(Math.random() * 4)]
  });
}

function updateBall() {
  if (!ball || !ball.active) return;
  if (gameState !== "playing") return;

  if (!ball.hit) {
    ball.x += ball.vx;
    ball.y += ball.vy;

    ball.trail.push({ x: ball.x, y: ball.y, a: 0.16 });
    if (ball.trail.length > 7) ball.trail.shift();

    if (ball.x < -40) {
      resolveMiss();
    }
  } else {
    ball.vy += GRAVITY;
    ball.vx *= 0.992;
    ball.vy *= 0.996;

    ball.x += ball.vx;
    ball.y += ball.vy;

    ball.trail.push({ x: ball.x, y: ball.y, a: 0.24 });
    if (ball.trail.length > 16) ball.trail.shift();

    if (ball.result === "HOME RUN!") {
      spawnHomeRunTrail();
      spawnHomeRunTrail();
    }

    if (ball.y > canvas.height + 60 || ball.x < -90 || ball.x > canvas.width + 90) {
      resolveFinishedHit();
    }
  }
}

function drawBall() {
  if (!ball || !ball.active) return;

  for (let i = 0; i < ball.trail.length; i++) {
    const p = ball.trail[i];
    const alpha = ((i + 1) / ball.trail.length) * p.a;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, BALL_RADIUS * 0.58, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.shadowBlur = ball.result === "HOME RUN!" ? 24 : 14;
  ctx.shadowColor = ball.result === "HOME RUN!" ? "#ffd54f" : "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#cfd8dc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS - 2, 0.4, 2.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS - 2, 3.6, 5.7);
  ctx.stroke();
  ctx.restore();
}

// ---------- MINIMAP ----------
function drawMiniMap() {
  miniCtx.clearRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

  miniCtx.fillStyle = "#0b2343";
  miniCtx.fillRect(0, 0, miniMapCanvas.width, miniMapCanvas.height);

  miniCtx.strokeStyle = "rgba(255,255,255,0.18)";
  miniCtx.lineWidth = 2;
  miniCtx.strokeRect(1, 1, miniMapCanvas.width - 2, miniMapCanvas.height - 2);

  miniCtx.fillStyle = "rgba(255,255,255,0.06)";
  miniCtx.fillRect(18, 55, miniMapCanvas.width - 36, 40);

  miniCtx.strokeStyle = "rgba(255,255,255,0.30)";
  miniCtx.lineWidth = 4;
  miniCtx.beginPath();
  miniCtx.moveTo(miniMapCanvas.width - 24, 75);
  miniCtx.lineTo(34, 75);
  miniCtx.stroke();

  miniCtx.fillStyle = "#ffffff";
  miniCtx.beginPath();
  miniCtx.moveTo(20, 75);
  miniCtx.lineTo(28, 66);
  miniCtx.lineTo(38, 75);
  miniCtx.lineTo(34, 86);
  miniCtx.lineTo(24, 86);
  miniCtx.closePath();
  miniCtx.fill();

  miniCtx.fillStyle = "#ffd54f";
  miniCtx.beginPath();
  miniCtx.arc(miniMapCanvas.width - 24, 75, 7, 0, Math.PI * 2);
  miniCtx.fill();

  if (ball) {
    const bx = clamp((ball.x / canvas.width) * miniMapCanvas.width, 10, miniMapCanvas.width - 10);
    const by = clamp((ball.y / canvas.height) * miniMapCanvas.height, 18, miniMapCanvas.height - 18);

    miniCtx.fillStyle = "#ffffff";
    miniCtx.beginPath();
    miniCtx.arc(bx, by, 7, 0, Math.PI * 2);
    miniCtx.fill();
  }

  miniCtx.fillStyle = "#dbeaff";
  miniCtx.font = '900 12px "Nunito", sans-serif';
  miniCtx.textAlign = "left";
  miniCtx.fillText(battingSide === "right" ? "Right-handed" : "Left-handed", 12, 18);
}

// ---------- FX ----------
function showHitText(text) {
  hitText = text;
  hitTextTimer = 34;
  flashTimer = text === "HOME RUN!" ? 9 : 4;
}

function spawnConfetti(x, y, count) {
  for (let i = 0; i < count; i++) {
    confetti.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 8 - 1.5,
      size: 4 + Math.random() * 7,
      life: 22 + Math.random() * 24,
      color: ["#ff5252", "#ffd54f", "#66bb6a", "#42a5f5", "#ab47bc", "#ff7043"][i % 6]
    });
  }
}

function spawnStars(x, y, label) {
  const count = label === "HOME RUN!" ? 8 : 4;
  for (let i = 0; i < count; i++) {
    floatingStars.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vy: -1 - Math.random() * 1.2,
      life: 24 + Math.random() * 10,
      size: 10 + Math.random() * 10
    });
  }
}

function updateAndDrawConfetti() {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.20;
    p.life--;

    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size * 0.7);

    if (p.life <= 0) confetti.splice(i, 1);
  }
}

function drawStar(x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();

  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const sx = Math.cos(a) * r;
    const sy = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
    const a2 = a + Math.PI / 5;
    ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
  }

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function updateAndDrawStars() {
  for (let i = floatingStars.length - 1; i >= 0; i--) {
    const s = floatingStars[i];
    s.y += s.vy;
    s.life--;
    drawStar(s.x, s.y, s.size * 0.5, "rgba(255, 213, 79, 0.9)");
    if (s.life <= 0) floatingStars.splice(i, 1);
  }
}

function updateAndDrawHomerBursts() {
  for (let i = homerBursts.length - 1; i >= 0; i--) {
    const b = homerBursts[i];
    b.radius += 10;
    b.life--;

    ctx.save();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 6;
    ctx.globalAlpha = Math.max(b.life / 30, 0);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (b.life <= 0) homerBursts.splice(i, 1);
  }
}

function updateAndDrawHomerTrailParticles() {
  for (let i = homerTrailParticles.length - 1; i >= 0; i--) {
    const p = homerTrailParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;

    ctx.save();
    ctx.globalAlpha = Math.max(p.life / 24, 0);
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (p.life <= 0) homerTrailParticles.splice(i, 1);
  }
}

function drawHitOverlay() {
  if (hitTextTimer > 0) {
    const scale = 1 + Math.sin((34 - hitTextTimer) * 0.3) * 0.08;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height * 0.23);
    ctx.scale(scale, scale);

    ctx.textAlign = "center";
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#14304b";
    ctx.fillStyle = hitText === "HOME RUN!" ? "#ffd54f" : "#ffffff";
    ctx.font = hitText.length > 8
      ? '900 56px "Baloo 2", sans-serif'
      : '900 66px "Baloo 2", sans-serif';

    ctx.strokeText(hitText, 0, 0);
    ctx.fillText(hitText, 0, 0);
    ctx.restore();

    hitTextTimer--;
  }

  if (flashTimer > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashTimer * 0.022})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    flashTimer--;
  }
}

function getShakeOffset() {
  if (screenShakeTimer <= 0) return { x: 0, y: 0 };
  screenShakeTimer--;
  return {
    x: (Math.random() - 0.5) * screenShakeAmount,
    y: (Math.random() - 0.5) * screenShakeAmount
  };
}

function drawPauseOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd54f";
  ctx.font = '900 64px "Baloo 2", sans-serif';
  ctx.fillText("PAUSED", canvas.width / 2, canvas.height * 0.35);

  ctx.fillStyle = "#ffffff";
  ctx.font = '900 28px "Nunito", sans-serif';
  ctx.fillText("Press Pause Game again to resume.", canvas.width / 2, canvas.height * 0.43);
}

function drawStartOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd54f";
  ctx.font = '900 60px "Baloo 2", sans-serif';
  ctx.fillText("PRESS START", canvas.width / 2, canvas.height * 0.33);

  ctx.fillStyle = "#ffffff";
  ctx.font = '900 28px "Nunito", sans-serif';
  ctx.fillText("Choose left or right handed play.", canvas.width / 2, canvas.height * 0.41);
  ctx.fillText("The bat stays on that side until you change it.", canvas.width / 2, canvas.height * 0.47);
}

function drawEndOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd54f";
  ctx.font = '900 56px "Baloo 2", sans-serif';
  ctx.fillText("ROUND OVER!", canvas.width / 2, canvas.height * 0.34);

  ctx.fillStyle = "#ffffff";
  ctx.font = '900 28px "Nunito", sans-serif';
  ctx.fillText(`Final Score: ${score}`, canvas.width / 2, canvas.height * 0.43);
  ctx.fillText(`Hits: ${hits}   |   Best EV: ${Math.round(bestExitVelo)}`, canvas.width / 2, canvas.height * 0.50);
}

function drawCountdownOverlay() {
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd54f";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#14304b";

  if (countdownValue > 0) {
    ctx.font = '900 120px "Baloo 2", sans-serif';
    ctx.strokeText(String(countdownValue), canvas.width / 2, canvas.height * 0.45);
    ctx.fillText(String(countdownValue), canvas.width / 2, canvas.height * 0.45);

    ctx.fillStyle = "#ffffff";
    ctx.font = '900 28px "Nunito", sans-serif';
    ctx.fillText("Get set...", canvas.width / 2, canvas.height * 0.55);
  } else {
    ctx.font = '900 90px "Baloo 2", sans-serif';
    ctx.strokeText("SWING!", canvas.width / 2, canvas.height * 0.45);
    ctx.fillText("SWING!", canvas.width / 2, canvas.height * 0.45);
  }
}

// ---------- COUNTDOWN ----------
function startCountdown() {
  clearCountdownTimer();
  countdownActive = true;
  countdownValue = 5;
  gameState = "countdown";
  instructionChip.textContent = "Get set...";
  hideControlsPanel();

  const tick = () => {
    if (!countdownActive) return;

    if (countdownValue > 0) {
      playCountdownBeep(countdownValue);
      instructionChip.textContent = `Starting in ${countdownValue}...`;
      countdownValue--;
      countdownTimer = setTimeout(tick, 1000);
    } else {
      playGoSound();
      instructionChip.textContent = "Swing!";
      countdownActive = false;
      gameState = "playing";
      createPitch();
    }
  };

  tick();
}

// ---------- SIDE SELECT ----------
function updateSideButtons() {
  if (battingSide === "right") {
    rightHandBtn.classList.add("active");
    leftHandBtn.classList.remove("active");
  } else {
    leftHandBtn.classList.add("active");
    rightHandBtn.classList.remove("active");
  }
}

rightHandBtn.onclick = () => {
  battingSide = "right";
  prevBatPoint = null;
  updateSideButtons();
};

leftHandBtn.onclick = () => {
  battingSide = "left";
  prevBatPoint = null;
  updateSideButtons();
};

// ---------- MAIN LOOP ----------
async function loop() {
  const shake = getShakeOffset();

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(shake.x, shake.y);

  drawBackground();
  drawMiniMap();

  let pose = null;

  if (detector && (gameState === "playing" || gameState === "countdown")) {
    const poses = await detector.estimatePoses(video, { flipHorizontal: true });
    pose = poses[0] || null;
  }

  if (pose) {
    const points = drawStickFigure(pose);
    const battingArm = getBattingArm(points);

    if (battingArm) {
      const batTip = drawBatFromSide(battingArm.wrist, battingArm.elbow);
      if (batTip) {
        updateBatVelocity(batTip);
        updateBatTrail(batTip);

        if (gameState === "playing") {
          tryHit(batTip);
        }
      }
    }
  }

  drawBatTrail();

  if (gameState === "playing") {
    updateBall();
    drawBall();
    updateAndDrawConfetti();
    updateAndDrawStars();
    updateAndDrawHomerBursts();
    updateAndDrawHomerTrailParticles();
    drawHitOverlay();

    if (pitchesLeft <= 0 && !ball) {
      gameState = "end";
      showControlsPanel();
      instructionChip.textContent = "Round over. Press Start Game to play again.";
    }
  } else {
    updateAndDrawConfetti();
    updateAndDrawStars();
    updateAndDrawHomerBursts();
    updateAndDrawHomerTrailParticles();
    drawHitOverlay();
  }

  tickBatTrail();

  if (gameState === "start") {
    drawStartOverlay();
  }

  if (gameState === "countdown") {
    drawCountdownOverlay();
  }

  if (gameState === "paused") {
    drawPauseOverlay();
  }

  if (gameState === "end") {
    drawEndOverlay();
  }

  ctx.restore();
  animationId = requestAnimationFrame(loop);
}

// ---------- BUTTONS ----------
async function startOrResumeGame() {
  initAudio();

  if (!detector) {
    await setupCamera();
    await loadModel();
  }

  if (gameState === "paused") {
    gameState = "playing";
    pauseBtn.textContent = "Pause Game";
    instructionChip.textContent = "Game resumed.";
    hideControlsPanel();
    if (!ball) scheduleNextPitch();
    playStartSound();
    if (!animationId) loop();
    return;
  }

  resetRound();
  pauseBtn.textContent = "Pause Game";
  playStartSound();
  startCountdown();

  if (!animationId) {
    loop();
  }
}

function togglePause() {
  if (gameState === "playing") {
    gameState = "paused";
    pauseBtn.textContent = "Resume Game";
    clearPitchTimer();
    clearCountdownTimer();
    showControlsPanel();
    instructionChip.textContent = "Game paused.";
    return;
  }

  if (gameState === "countdown") {
    gameState = "paused";
    countdownActive = false;
    clearCountdownTimer();
    pauseBtn.textContent = "Resume Game";
    showControlsPanel();
    instructionChip.textContent = "Game paused.";
    return;
  }

  if (gameState === "paused") {
    pauseBtn.textContent = "Pause Game";

    if (!ball && hits === 0 && misses === 0 && pitchesLeft === roundPitches) {
      startCountdown();
    } else {
      gameState = "playing";
      hideControlsPanel();
      instructionChip.textContent = "Game resumed.";
      if (!ball) scheduleNextPitch();
      playStartSound();
    }
  }
}

function resetGame() {
  clearPitchTimer();
  clearCountdownTimer();
  resetRound();
  gameState = "start";
  pauseBtn.textContent = "Pause Game";
  showControlsPanel();
  instructionChip.textContent = "Big upward swings can turn doubles into triples. Home runs trigger a giant celebration.";
}

startBtn.onclick = startOrResumeGame;
pauseBtn.onclick = togglePause;
resetBtn.onclick = resetGame;

muteBtn.onclick = async () => {
  soundEnabled = !soundEnabled;

  if (soundEnabled) {
    initAudio();
    muteBtn.textContent = "Sound: On";
    playStartSound();
  } else {
    muteBtn.textContent = "Sound: Off";
  }
};

updateSideButtons();
updateHud();
resizeCanvas();
pitchDelayVal.textContent = `${pitchDelaySlider.value}s`;
showControlsPanel();
