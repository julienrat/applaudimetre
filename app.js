const APP_VERSION = "0.1.0";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const barFill = document.getElementById("barFill");
const rangeSelectedEl = document.getElementById("rangeSelected");
const levelEl = document.getElementById("level");
const dbEl = document.getElementById("db");
const peakEl = document.getElementById("peak");
const statusEl = document.getElementById("status");
const sensitivityEl = document.getElementById("sensitivity");
const gainValueEl = document.getElementById("gainValue");
const floorEl = document.getElementById("floor");
const ceilingEl = document.getElementById("ceiling");
const weightingEl = document.getElementById("weighting");
const peakHoldEl = document.getElementById("peakHold");
const tabGaugeBtn = document.getElementById("tabGauge");
const tabNeedleBtn = document.getElementById("tabNeedle");
const tabScoreBtn = document.getElementById("tabScore");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const exitFullscreenBtn = document.getElementById("exitFullscreenBtn");
const scoreValueEl = document.getElementById("scoreValue");
const meterEl = document.getElementById("meter");
const versionTagEl = document.getElementById("versionTag");
const needleGroupEl = document.getElementById("needleGroup");
const needleArcEl = document.querySelector(".needle-arc");
const needleValueEl = document.getElementById("needleValue");
const bleConnectBtn = document.getElementById("bleConnectBtn");
const bleDisconnectBtn = document.getElementById("bleDisconnectBtn");
const bleStatusEl = document.getElementById("bleStatus");

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
let scoreSmooth = 0;
let lastPercent = 0;
let bleDevice = null;
let bleServer = null;
let bleTxChar = null;
let bleLastSend = 0;
let bleLastValue = -1;

// Nordic UART Service (NUS) UUIDs - widely supported on ESP32
const BLE_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write

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
  if (weightingEl.value === "slow") return 1.0;
  if (weightingEl.value === "long") return 2.0;
  return 0.125;
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
  if (gainValueEl) gainValueEl.textContent = gain.toFixed(1);
  const target = Math.min(1, rms * gain * 4.0);

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

  const floor = parseFloat(floorEl.value);
  const ceiling = parseFloat(ceilingEl.value);
  const raw = smoothed * 100;
  const scaled = (raw - floor) / Math.max(1, (ceiling - floor));
  const percent = Math.round(Math.max(0, Math.min(1, scaled)) * 100);
  lastPercent = percent;

  const rawPercent = Math.round(Math.max(0, Math.min(100, raw)));
  barFill.style.width = `${rawPercent}%`;
  levelEl.textContent = rawPercent.toString();

  const scoreTau = 0.6;
  const scoreAlpha = Math.exp(-dt / scoreTau);
  scoreSmooth = scoreAlpha * scoreSmooth + (1 - scoreAlpha) * percent;
  const scoreShown = Math.round(scoreSmooth);
  scoreValueEl.textContent = scoreShown.toString();
  if (needleGroupEl) {
    const angle = -90 + (percent * 1.8);
    needleGroupEl.style.transform = `rotate(${angle}deg)`;
  }
  if (needleArcEl) {
    const total = 376;
    needleArcEl.style.strokeDashoffset = `${total - (total * (percent / 100))}`;
  }
  if (needleValueEl) {
    needleValueEl.textContent = percent.toString();
  }

  const db = rms > 0 ? (20 * Math.log10(rms)).toFixed(1) : "-∞";
  dbEl.textContent = db.toString();

  const peakRaw = peak * 100;
  const peakScaled = (peakRaw - floor) / Math.max(1, (ceiling - floor));
  const peakPercent = Math.max(0, Math.min(100, Math.round(peakScaled * 100)));
  peakEl.textContent = peakPercent.toString();

  sendScoreOverBle(scoreShown);

  rafId = requestAnimationFrame(updateMeter);
}

function updateRangeUI() {
  let minVal = parseFloat(floorEl.value);
  let maxVal = parseFloat(ceilingEl.value);
  if (minVal > maxVal - 1) {
    minVal = maxVal - 1;
    floorEl.value = minVal.toString();
  }
  if (maxVal < minVal + 1) {
    maxVal = minVal + 1;
    ceilingEl.value = maxVal.toString();
  }
  const minPct = (minVal / 100) * 100;
  const maxPct = (maxVal / 100) * 100;
  rangeSelectedEl.style.left = `${minPct}%`;
  rangeSelectedEl.style.width = `${maxPct - minPct}%`;
  scoreSmooth = lastPercent;
  scoreValueEl.textContent = Math.round(lastPercent).toString();
}

async function connectBle() {
  try {
    bleStatusEl.textContent = "BLE: connexion...";
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BLE_SERVICE_UUID] }],
    });
    bleDevice = device;
    bleDevice.addEventListener("gattserverdisconnected", onBleDisconnected);
    bleServer = await bleDevice.gatt.connect();
    const service = await bleServer.getPrimaryService(BLE_SERVICE_UUID);
    bleTxChar = await service.getCharacteristic(BLE_RX_CHAR_UUID);
    bleStatusEl.textContent = "BLE: connecté";
    bleConnectBtn.disabled = true;
    bleDisconnectBtn.disabled = false;
  } catch (err) {
    console.error(err);
    bleStatusEl.textContent = "BLE: échec de connexion";
  }
}

async function disconnectBle() {
  if (bleDevice?.gatt?.connected) {
    bleDevice.gatt.disconnect();
  } else {
    onBleDisconnected();
  }
}

function onBleDisconnected() {
  bleServer = null;
  bleTxChar = null;
  bleDevice = null;
  if (bleConnectBtn) bleConnectBtn.disabled = false;
  if (bleDisconnectBtn) bleDisconnectBtn.disabled = true;
  if (bleStatusEl) bleStatusEl.textContent = "BLE: déconnecté";
}

function sendScoreOverBle(score) {
  if (!bleTxChar) return;
  const now = performance.now();
  if (now - bleLastSend < 100 && score === bleLastValue) return;
  bleLastSend = now;
  bleLastValue = score;
  const value = new Uint8Array([Math.max(0, Math.min(100, score))]);
  bleTxChar.writeValueWithoutResponse(value).catch((err) => {
    console.error(err);
    if (bleStatusEl) bleStatusEl.textContent = "BLE: erreur d'envoi";
  });
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
  scoreValueEl.textContent = "0";
  scoreSmooth = 0;
  bleLastValue = -1;
  if (needleGroupEl) needleGroupEl.style.transform = "rotate(-90deg)";
  if (needleArcEl) needleArcEl.style.strokeDashoffset = "376";
  if (needleValueEl) needleValueEl.textContent = "0";
  setStatus("", "En attente");
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

floorEl.addEventListener("input", updateRangeUI);
ceilingEl.addEventListener("input", updateRangeUI);
sensitivityEl.addEventListener("input", () => {
  if (gainValueEl) gainValueEl.textContent = parseFloat(sensitivityEl.value).toFixed(1);
});
updateRangeUI();

if (bleConnectBtn && bleDisconnectBtn && bleStatusEl) {
  bleConnectBtn.addEventListener("click", connectBle);
  bleDisconnectBtn.addEventListener("click", disconnectBle);
}

function setTab(tab) {
  meterEl.setAttribute("data-tab", tab);
  tabGaugeBtn.classList.toggle("is-active", tab === "gauge");
  tabNeedleBtn.classList.toggle("is-active", tab === "needle");
  tabScoreBtn.classList.toggle("is-active", tab === "score");
}

tabGaugeBtn.addEventListener("click", () => setTab("gauge"));
tabNeedleBtn.addEventListener("click", () => setTab("needle"));
tabScoreBtn.addEventListener("click", () => setTab("score"));

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      document.body.classList.add("fullscreen");
    } else {
      await document.exitFullscreen();
      document.body.classList.remove("fullscreen");
    }
  } catch (err) {
    console.error(err);
  }
}

if (fullscreenBtn) {
  fullscreenBtn.addEventListener("click", toggleFullscreen);
}
if (exitFullscreenBtn) {
  exitFullscreenBtn.addEventListener("click", toggleFullscreen);
}

if (versionTagEl) {
  versionTagEl.textContent = `v${APP_VERSION}`;
}

document.addEventListener("fullscreenchange", () => {
  document.body.classList.toggle("fullscreen", Boolean(document.fullscreenElement));
});

// Sécurité si l'onglet est masqué
document.addEventListener("visibilitychange", () => {
  if (document.hidden && audioCtx) {
    stop();
  }
});

if (!navigator.bluetooth && bleStatusEl) {
  bleStatusEl.textContent = "BLE: non supporté";
  if (bleConnectBtn) bleConnectBtn.disabled = true;
}
