// Acesso local para a apresentação única solicitada pelo admin.
// Isto NÃO é uma camada de segurança real: arquivos JavaScript publicados podem ser lidos.
export const ADMIN_LOGIN = "guilh.patez";
export const ADMIN_PASSWORD = "12345678";

const SESSION_KEY = "bombit-admin-session";

export function isAdminAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

export function authenticateAdmin(login, password) {
  const valid = login === ADMIN_LOGIN && password === ADMIN_PASSWORD;
  if (valid) sessionStorage.setItem(SESSION_KEY, "true");
  return valid;
}

export function signOutAdmin() {
  sessionStorage.removeItem(SESSION_KEY);
}
