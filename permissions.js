import { ADMIN_UID } from "./config.js";
import { state } from "./state.js";

export function isAdmin(user = state.currentUser) {
  return Boolean(
    user &&
    ADMIN_UID !== "COLE_AQUI_O_UID_DA_CONTA_ADMIN" &&
    user.uid === ADMIN_UID
  );
}
