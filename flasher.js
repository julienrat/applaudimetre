import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.5.4/lib/index.js";

const fwSelect = document.getElementById("fwSelect");
const btnConnect = document.getElementById("btnConnect");
const btnFlash = document.getElementById("btnFlash");
const flashStatus = document.getElementById("flashStatus");

let port = null;
let transport = null;
let esp = null;
let firmwareBin = null;

async function loadFirmware() {
  const url = fwSelect.value;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Firmware ${res.status}`);
  firmwareBin = new Uint8Array(await res.arrayBuffer());
  btnFlash.disabled = !port;
}

async function connectPort() {
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    transport = new Transport(port);
    esp = new ESPLoader({ transport, baudrate: 115200, terminal: { writeln: () => {} } });
    await esp.main();
    flashStatus.textContent = "Flash: connecte";
    if (!firmwareBin) await loadFirmware();
    btnFlash.disabled = !firmwareBin;
  } catch (err) {
    console.error(err);
    flashStatus.textContent = "Flash: erreur";
  }
}

async function flash() {
  if (!esp || !firmwareBin) return;
  try {
    flashStatus.textContent = "Flash: en cours";
    await esp.writeFlash({
      fileArray: [{ data: firmwareBin, address: 0x0 }],
      flashSize: "keep",
      compress: true,
    });
    flashStatus.textContent = "Flash: termine";
  } catch (err) {
    console.error(err);
    flashStatus.textContent = "Flash: erreur";
  }
}

fwSelect.addEventListener("change", () => {
  firmwareBin = null;
  if (port) loadFirmware().catch(() => {});
});
btnConnect.addEventListener("click", connectPort);
btnFlash.addEventListener("click", flash);
