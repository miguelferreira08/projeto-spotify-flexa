import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const config = {
  apiKey: "AIzaSyDIEd0pgBeO2IfdaJhsMB_RxwdOO0Y2DV0",
  authDomain: "projetospotifyflexa.firebaseapp.com",
  projectId: "projetospotifyflexa",
  messagingSenderId: "918316232141",
  appId: "1:918316232141:web:59e84ba0814126f1d56884",
  measurementId: "G-XCY550YH6X",
};

export const ADMIN_UID = "aGxAVvsRyVVzjgf2LcV0GImQXRp2";

const app = initializeApp(config);

export const auth = getAuth(app);
export const db = getFirestore(app);
