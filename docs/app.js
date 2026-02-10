const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const barFill = document.getElementById("barFill");
const peakMark = document.getElementById("peakMark");
const levelEl = document.getElementById("level");
const dbEl = document.getElementById("db");
const peakEl = document.getElementById("peak");
const statusEl = document.getElementById("status");
const sensitivityEl = document.getElementById("sensitivity");
const weightingEl = document.getElementById("weighting");
const peakHoldEl = document.getElementById("peakHold");

let audioCtx = null;
let analyser = null;
let dataArray = null;
let source = null;
let rafId = null;
let stream = null;
let lastTime = 0;
let smoothed = 0;
let peak = 0;
let peakTimer = 0;
let useFloat = true;

function setStatus(text, strongText) {
  statusEl.innerHTML = `Statut: <strong>${strongText}</strong> ${text ? "- " + text : ""}`;
}

function rmsFromTimeDomain(buffer, isFloat) {
  let sum = 0;
  if (isFloat) {
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i];
      sum += v * v;
    }
  } else {
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128;
      sum += v * v;
    }
  }
  return Math.sqrt(sum / buffer.length);
}

function timeConstant() {
  return weightingEl.value === "slow" ? 1.0 : 0.125;
}

function updateMeter() {
  const now = performance.now();
  const dt = lastTime ? (now - lastTime) / 1000 : 0.016;
  lastTime = now;

  if (useFloat) {
    analyser.getFloatTimeDomainData(dataArray);
  } else {
    analyser.getByteTimeDomainData(dataArray);
  }

  const rms = rmsFromTimeDomain(dataArray, useFloat);
  const gain = parseFloat(sensitivityEl.value);
  const target = Math.min(1, rms * gain * 2.0);

  const tau = timeConstant();
  const alpha = Math.exp(-dt / tau);
  smoothed = alpha * smoothed + (1 - alpha) * target;

  if (smoothed > peak) {
    peak = smoothed;
    peakTimer = 0;
  } else {
    peakTimer += dt;
    const hold = parseFloat(peakHoldEl.value);
    if (peakTimer > hold) {
      // Decay peak slowly after hold
      peak = Math.max(smoothed, peak - dt * 0.6);
    }
  }
  peak = Math.min(1, Math.max(0, peak));

  const percent = Math.round(smoothed * 100);
  barFill.style.width = `${percent}%`;
  levelEl.textContent = percent.toString();

  const db = rms > 0 ? (20 * Math.log10(rms)).toFixed(1) : "-∞";
  dbEl.textContent = db.toString();

  const peakPercent = Math.max(0, Math.min(100, Math.round(peak * 100)));
  peakEl.textContent = peakPercent.toString();
  peakMark.style.left = `calc(${peakPercent}% - 1px)`;

  rafId = requestAnimationFrame(updateMeter);
}

async function start() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    if (typeof analyser.getFloatTimeDomainData === "function") {
      dataArray = new Float32Array(analyser.fftSize);
      useFloat = true;
    } else {
      dataArray = new Uint8Array(analyser.fftSize);
      useFloat = false;
    }
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    setStatus("Micro actif", "En cours");
    startBtn.disabled = true;
    stopBtn.disabled = false;
    lastTime = 0;
    smoothed = 0;
    peak = 0;
    peakTimer = 0;

    updateMeter();
  } catch (err) {
    console.error(err);
    setStatus("Autorise le micro dans le navigateur.", "Erreur");
  }
}

function stop() {
  if (rafId) cancelAnimationFrame(rafId);
  if (source) source.disconnect();
  if (audioCtx) audioCtx.close();
  if (stream) stream.getTracks().forEach(t => t.stop());

  audioCtx = null;
  analyser = null;
  dataArray = null;
  source = null;
  stream = null;
  lastTime = 0;
  smoothed = 0;
  peak = 0;
  peakTimer = 0;
  barFill.style.width = "0%";
  levelEl.textContent = "0";
  dbEl.textContent = "-∞";
  peakEl.textContent = "0";
  peakMark.style.left = "0%";
  setStatus("", "En attente");
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

// Sécurité si l'onglet est masqué
document.addEventListener("visibilitychange", () => {
  if (document.hidden && audioCtx) {
    stop();
  }
});
