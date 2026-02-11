const fwSelect = document.getElementById("fwSelect");
const installBtn = document.getElementById("installBtn");
const flashStatus = document.getElementById("flashStatus");

fwSelect.addEventListener("change", () => {
  installBtn.setAttribute("manifest", fwSelect.value);
  flashStatus.textContent = "Flash: --";
});

installBtn.addEventListener("error", (e) => {
  console.error(e);
  flashStatus.textContent = "Flash: erreur";
});

installBtn.addEventListener("success", () => {
  flashStatus.textContent = "Flash: termine";
});
