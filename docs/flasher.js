import { ESPLoader, Transport } from "https://esm.sh/esptool-js@0.5.4";

const fwSelect = document.getElementById("fwSelect");
const btnConnect = document.getElementById("btnConnect");
const btnFlash = document.getElementById("btnFlash");
const flashStatus = document.getElementById("flashStatus");

let port = null;
let transport = null;
let esp = null;
let firmwareBin = null;
let connecting = false;

if (!("serial" in navigator)) {
  flashStatus.textContent = "Flash: WebSerial indisponible (Chrome/Edge requis)";
  btnConnect.disabled = true;
}

async function loadFirmware() {
  const url = fwSelect.value;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Firmware ${res.status}`);
  firmwareBin = await res.arrayBuffer();
  btnFlash.disabled = !port;
}

async function connectPort() {
  try {
    if (connecting) return;
    connecting = true;
    if (port && port.readable) {
      flashStatus.textContent = "Flash: port deja ouvert";
      return;
    }
    port = await navigator.serial.requestPort();
    transport = new Transport(port);
    const terminal = {
      clean: () => {},
      write: () => {},
      writeLine: () => {},
    };
    esp = new ESPLoader({
      transport,
      baudrate: 115200,
      romBaudrate: 115200,
      terminal,
    });
    await esp.main();
    flashStatus.textContent = "Flash: connecte";
    if (!firmwareBin) await loadFirmware();
    btnFlash.disabled = !firmwareBin;
  } catch (err) {
    console.error(err);
    flashStatus.textContent = "Flash: erreur";
  } finally {
    connecting = false;
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
