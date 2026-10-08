import { GameController, MAX_PLAYERS, getRoomId } from "./game.js";
import { authenticateAdmin, isAdminAuthenticated, signOutAdmin } from "./admin-auth.js";

const game = new GameController(getRoomId());
const $ = (selector) => document.querySelector(selector);
const loginScreen = $("#admin-login-screen");
const panel = $("#admin-panel");
const loginForm = $("#admin-login-form");
const loginNotice = $("#login-notice");
const statusNotice = $("#admin-status");
const roomLabel = $("#room-label");
const count = $("#admin-count");
const roster = $("#admin-roster");
const empty = $("#admin-empty");
const startButton = $("#admin-start");
const skipButton = $("#admin-skip");
const endButton = $("#admin-end");
const resetButton = $("#admin-reset");
const logoutButton = $("#admin-logout");
const livesOptions = $("#lives-options");

roomLabel.textContent = `Sala: ${game.roomId}`;

function announce(message = "", kind = "") {
  statusNotice.textContent = message;
  statusNotice.className = `notice ${message ? "" : "hidden"} ${kind}`;
}

function loginMessage(message = "") {
  loginNotice.textContent = message;
  loginNotice.className = `notice ${message ? "" : "hidden"} error`;
}

function renderRoster(room) {
  const players = Object.entries(room?.players || {}).sort(([, first], [, second]) => Number(first.joinedAt || 0) - Number(second.joinedAt || 0));
  roster.replaceChildren();
  for (const [, player] of players) {
    const item = document.createElement("li");
    item.className = "roster-item";
    if (!player.connected) item.classList.add("is-offline");
    if (player.status === "eliminated") item.classList.add("is-eliminated");
    item.innerHTML = `<span class="roster-avatar">${player.avatar || "💻"}</span>`;
    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = player.name || "Jogador";
    const state = document.createElement("span");
    state.className = "roster-state";
    state.textContent = player.status === "eliminated" ? "💀" : player.connected ? "●" : "○";
    item.append(name, state);
    roster.append(item);
  }
  empty.classList.toggle("hidden", players.length > 0);
}

async function claimAdminControl() {
  await game.roomRef.transaction((current) => {
    const room = current || { status: "lobby", players: {}, settings: { initialLives: 1 } };
    room.status = room.status || "lobby";
    room.players = room.players || {};
    room.settings = room.settings || { initialLives: 1 };
    // O painel do admin assume o controle a cada abertura autenticada localmente.
    room.hostId = game.uid;
    return room;
  });
}

function render(room) {
  const total = Object.values(room?.players || {}).filter((player) => player.connected).length;
  count.textContent = `${total}/${MAX_PLAYERS} alunos conectados`;
  renderRoster(room);
  const status = room?.status || "lobby";
  const lives = Number(room?.settings?.initialLives || 1);
  livesOptions.querySelectorAll("button").forEach((button) => {
    const selected = Number(button.dataset.lives) === lives;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  startButton.classList.toggle("hidden", status !== "lobby");
  startButton.disabled = total < 2;
  skipButton.classList.toggle("hidden", status !== "playing");
  endButton.classList.toggle("hidden", status !== "playing");
  resetButton.classList.toggle("hidden", status !== "finished");

  if (status === "lobby") announce(total < 2 ? "Aguardando pelo menos 2 alunos para começar." : "Sala pronta. Você pode iniciar quando quiser.");
  if (status === "playing") announce(`Partida em andamento${room.game?.currentPlayerId ? "." : ", encerrando…"}`);
  if (status === "finished") announce("Partida encerrada. Clique em Começar nova partida para limpar a sala.");
}

async function openPanel() {
  loginScreen.classList.add("hidden");
  panel.classList.remove("hidden");
  await game.authenticate();
  await claimAdminControl();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const login = $("#admin-login").value;
  const password = $("#admin-password").value;
  if (!authenticateAdmin(login, password)) {
    loginMessage("Usuário ou senha incorretos.");
    return;
  }
  try {
    await openPanel();
  } catch (error) {
    console.error(error);
    loginMessage("Não foi possível abrir o painel. Confira a configuração do Firebase.");
  }
});

livesOptions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-lives]");
  if (button) game.setInitialLives(button.dataset.lives);
});

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  const result = await game.startGame();
  if (!result.ok) announce(result.reason || "Não foi possível iniciar a partida.", "error");
});
skipButton.addEventListener("click", () => game.skipTurn());
endButton.addEventListener("click", () => {
  if (window.confirm("Terminar a partida agora?")) game.endGame();
});
resetButton.addEventListener("click", async () => {
  const lives = Number(game.room?.settings?.initialLives || 1);
  await game.roomRef.set({
    status: "lobby",
    hostId: game.uid,
    players: {},
    settings: { initialLives: lives },
    resetAt: firebase.database.ServerValue.TIMESTAMP
  });
});
logoutButton.addEventListener("click", () => {
  signOutAdmin();
  window.location.reload();
});

game.onStateChange = render;
if (!game.configured) {
  loginMessage("O Firebase ainda não foi configurado.");
} else if (isAdminAuthenticated()) {
  openPanel().catch((error) => {
    console.error(error);
    loginMessage("Não foi possível abrir o painel.");
  });
}
