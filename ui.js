import { els } from "./dom.js";

export function showToast(message, type = "ok") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = message;
  els.toastHost.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

export function setError(element, message = "") {
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}
