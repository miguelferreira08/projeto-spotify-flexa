import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { els } from "./dom.js";
import { state } from "./state.js";
import { initials } from "./utils.js";
import { isAdmin } from "./permissions.js";
import { setError, showToast } from "./ui.js";

let authMode = "login";

function getFriendlyAuthError(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Falha de rede. Verifique sua conexão."
  };
  return map[code] || "Não foi possível concluir a operação. Tente novamente.";
}

function applyAuthMode() {
  const register = authMode === "register";
  els.displayNameField.classList.toggle("hidden", !register);
  els.displayName.required = register;
  els.authPassword.autocomplete = register ? "new-password" : "current-password";
  els.authSubtitle.textContent = register
    ? "Crie sua conta para entrar no RedBeat."
    : "Entre com sua conta para continuar.";
  els.authSubmitBtn.textContent = register ? "Criar conta" : "Entrar";
  els.toggleAuthMode.textContent = register
    ? "Já tem conta? Entrar"
    : "Não tem conta? Criar conta";
}

export function openAuth(mode = "login") {
  authMode = mode;
  setError(els.authError);
  els.authForm.reset();
  applyAuthMode();
  if (!els.authDialog.open) els.authDialog.showModal();
  setTimeout(() => els.authEmail.focus(), 50);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  setError(els.authError);
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  els.authSubmitBtn.disabled = true;
  els.authSubmitBtn.textContent = authMode === "register" ? "Criando..." : "Entrando...";

  try {
    if (authMode === "register") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const name = els.displayName.value.trim();
      if (name) await updateProfile(credential.user, { displayName: name });
      await setDoc(doc(db, "users", credential.user.uid), {
        displayName: name || email.split("@")[0],
        email,
        createdAt: serverTimestamp()
      }, { merge: true });
      showToast("Conta criada com sucesso.");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      showToast("Login realizado.");
    }
    els.authDialog.close();
  } catch (error) {
    setError(els.authError, getFriendlyAuthError(error));
  } finally {
    els.authSubmitBtn.disabled = false;
    applyAuthMode();
  }
}

function setAdminVisibility(admin) {
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !admin);
  });
  els.adminBadge.classList.toggle("hidden", !admin);
}

function updateUserUI(user) {
  const logged = Boolean(user);
  els.authBtn.classList.toggle("hidden", logged);
  els.profileBtn.classList.toggle("hidden", !logged);
  els.sidebarUser.classList.toggle("hidden", !logged);
  els.logoutBtn.classList.toggle("hidden", !logged);
  els.authRequiredState.classList.toggle("hidden", logged);
  els.tracksArea.classList.toggle("hidden", !logged);
  els.player.classList.toggle("hidden", !logged || state.currentTrackIndex < 0);

  const admin = isAdmin(user);
  setAdminVisibility(admin);

  if (!logged) return;

  const name = user.displayName || user.email?.split("@")[0] || "Usuário";
  const avatar = initials(name);
  els.profileBtn.textContent = avatar;
  els.sidebarAvatar.textContent = avatar;
  els.profileAvatar.textContent = avatar;
  els.sidebarUserName.textContent = name;
  els.sidebarUserRole.textContent = admin ? "Administrador" : "Conta RedBeat";
  els.profileName.textContent = name;
  els.profileEmail.textContent = user.email || "";
  els.profileRole.textContent = admin ? "Administrador" : "Usuário";
}

export function logout() {
  signOut(auth).catch(() => showToast("Não foi possível sair da conta.", "error"));
  if (els.profileDialog.open) els.profileDialog.close();
}

export function initAuth({ onSignedIn, onSignedOut } = {}) {
  els.authBtn.addEventListener("click", () => openAuth("login"));
  els.emptyAuthBtn.addEventListener("click", () => openAuth("login"));
  els.toggleAuthMode.addEventListener("click", () => {
    authMode = authMode === "login" ? "register" : "login";
    setError(els.authError);
    applyAuthMode();
  });
  els.authForm.addEventListener("submit", handleAuthSubmit);
  els.logoutBtn.addEventListener("click", logout);
  els.profileLogoutBtn.addEventListener("click", logout);
  els.profileBtn.addEventListener("click", () => els.profileDialog.showModal());
  els.closeProfileBtn.addEventListener("click", () => els.profileDialog.close());

  onAuthStateChanged(auth, async (user) => {
    state.currentUser = user;
    updateUserUI(user);

    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid), {
          displayName: user.displayName || user.email?.split("@")[0] || "Usuário",
          email: user.email || "",
          lastLoginAt: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.warn("Não foi possível atualizar o perfil do usuário:", error);
      }
      onSignedIn?.(user);
    } else {
      onSignedOut?.();
    }
  });
}
