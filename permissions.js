import { ADMIN_UID } from "./config.js";
import { state } from "./state.js";

export function isAdmin(user = state.currentUser) {
  return Boolean(user && user.uid === ADMIN_UID);
}
