import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  doc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

import { ADMIN_UID, auth, db } from "./firebase.js";

const $ = (id) => document.getElementById(id);

let mode = "login";

const friendly = (error) =>
  ({
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
  })[error?.code] || "Não foi possível concluir a operação.";

function error(text = "") {
  $("authError").textContent = text;
  $("authError").classList.toggle("hidden", !text);
}

function drawMode() {
  const register = mode === "register";

  $("nameField").classList.toggle("hidden", !register);
  $("name").required = register;
  $("authSubmit").textContent = register ? "Criar conta" : "Entrar";
  $("authMode").textContent = register
    ? "Já tem conta? Entrar"
    : "Não tem conta? Criar conta";
}

export function openAuth() {
  mode = "login";

  $("authForm").reset();
  error();
  drawMode();
  $("authDialog").showModal();
}

export function isAdmin(user = auth.currentUser) {
  return user?.uid === ADMIN_UID;
}

export function initAuth(onChange) {
  $("authBtn").onclick = openAuth;
  $("noticeLoginBtn").onclick = openAuth;
  $("logoutBtn").onclick = () => signOut(auth);

  $("authMode").onclick = () => {
    mode = mode === "login" ? "register" : "login";
    error();
    drawMode();
  };

  $("authForm").onsubmit = async (event) => {
    event.preventDefault();
    error();

    const email = $("email").value.trim();
    const password = $("password").value;
    const name = $("name").value.trim();

    $("authSubmit").disabled = true;

    try {
      let user;

      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );

        user = credential.user;

        if (name) {
          await updateProfile(user, {
            displayName: name,
          });
        }
      } else {
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );

        user = credential.user;
      }

      await setDoc(
        doc(db, "users", user.uid),
        {
          email: user.email || email,
          displayName: user.displayName || name || email.split("@")[0],
          lastLoginAt: serverTimestamp(),
        },
        {
          merge: true,
        },
      );

      $("authDialog").close();
    } catch (err) {
      error(friendly(err));
    } finally {
      $("authSubmit").disabled = false;
      drawMode();
    }
  };

  onAuthStateChanged(auth, (user) => onChange(user));
}
