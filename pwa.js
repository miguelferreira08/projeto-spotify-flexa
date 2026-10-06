const installBtn = document.getElementById("installBtn");
let installPrompt = null;

const APP_SCOPE = "/projeto-spotify-flexa/";
const SW_URL = `${APP_SCOPE}service-worker.js`;

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function hideInstallButton() {
  installBtn?.classList.add("hidden");
}

function showInstallButton() {
  if (!isInstalled()) installBtn?.classList.remove("hidden");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register(SW_URL, {
        scope: APP_SCOPE,
      });
      await navigator.serviceWorker.ready;
    } catch (error) {
      console.error("Falha ao registrar o Service Worker:", error);
    }
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  showInstallButton();
});

installBtn?.addEventListener("click", async () => {
  if (!installPrompt) return;

  installPrompt.prompt();
  const choice = await installPrompt.userChoice;

  if (choice.outcome === "accepted") {
    hideInstallButton();
  }

  installPrompt = null;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  hideInstallButton();
});

if (isInstalled()) hideInstallButton();
