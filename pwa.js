let installPrompt = null;

const installBtn = document.getElementById("installBtn");
const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

function updateInstallButton() {
  if (!installBtn) return;
  installBtn.classList.toggle("hidden", isInstalled());
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  updateInstallButton();
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installBtn?.classList.add("hidden");
});

installBtn?.addEventListener("click", async () => {
  if (isInstalled()) {
    installBtn.classList.add("hidden");
    return;
  }

  if (installPrompt) {
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") installBtn.classList.add("hidden");
    installPrompt = null;
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS) {
    alert('No Safari, toque em "Compartilhar" e depois em "Adicionar à Tela de Início".');
  } else {
    alert('Se o navegador não abrir a instalação, use o menu do navegador e escolha "Instalar app" ou "Adicionar à tela inicial".');
  }
});

updateInstallButton();
