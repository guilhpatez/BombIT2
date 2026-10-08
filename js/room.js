import { GameController, getEntries, getRoomId } from "./game.js";

const game = new GameController(getRoomId());
const $ = (selector) => document.querySelector(selector);
const screens = [...document.querySelectorAll(".screen")];
const roomLabel = $("#room-label");
const waitingCount = $("#waiting-count");
const waitingRoster = $("#waiting-roster");
const waitingEmpty = $("#waiting-empty");
const waitingMessage = $("#waiting-message");
const fragment = $("#fragment");
const timerBar = $("#timer-bar");
const timerNumber = $("#timer-number");
const bombStage = $("#bomb-stage");
const turnStatus = $("#turn-status");
const remaining = $("#remaining-count");
const round = $("#round-label");
const gameRoster = $("#game-roster");
const feedback = $("#feedback-card");
const eventCard = $("#event-card");
const liveTyping = $("#live-typing");
const answerForm = $("#answer-form");
const answer = $("#answer-input");
const answerButton = $("#answer-button");
const turnInstruction = $("#turn-instruction");
const glossaryButton = $("#glossary-button");
const glossary = $("#glossary");
const glossaryList = $("#glossary-list");
const finishReason = $("#finish-reason");
let currentScreen = "";
let lastFeedbackId = "";
let lastOwnTurn = false;
let glossaryBuilt = false;

roomLabel.textContent = `Sala: ${game.roomId}`;

function show(id) {
  if (id === currentScreen) return;
  currentScreen = id;
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
}

function sortedPlayers(room) {
  const order = Array.isArray(room?.game?.turnOrder) ? room.game.turnOrder : Object.values(room?.game?.turnOrder || {});
  const rank = new Map(order.map((uid, index) => [uid, index]));
  return Object.entries(room?.players || {}).sort(([one, first], [two, second]) => (rank.get(one) ?? first.joinedAt ?? 0) - (rank.get(two) ?? second.joinedAt ?? 0));
}

function roster(target, room, playing = false) {
  target.replaceChildren();
  for (const [uid, player] of sortedPlayers(room)) {
    const item = document.createElement("li");
    item.className = "roster-item";
    if (uid === game.uid) item.classList.add("is-me");
    if (playing && uid === room.game?.currentPlayerId) item.classList.add("is-current");
    if (!player.connected) item.classList.add("is-offline");
    if (player.status === "eliminated") item.classList.add("is-eliminated");
    const avatar = document.createElement("span");
    avatar.className = "roster-avatar";
    avatar.textContent = player.avatar || "💻";
    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = player.name || "Jogador";
    const state = document.createElement("span");
    state.className = "roster-state";
    state.textContent = playing ? (player.status === "eliminated" ? "💀" : `${player.shield ? "🛡️" : ""}${"❤️".repeat(Number(player.lives || 0))}`) : (player.connected ? "●" : "○");
    item.append(avatar, name, state);
    target.append(item);
  }
}

function renderWaiting(room, hasPlayer) {
  const total = Object.values(room?.players || {}).filter((player) => player.connected).length;
  waitingCount.textContent = `${total} aluno${total === 1 ? "" : "s"} na sala`;
  roster(waitingRoster, room);
  waitingEmpty.classList.toggle("hidden", total > 0);
  waitingMessage.textContent = hasPlayer ? "Você entrou. Aguarde o admin iniciar a partida." : "A nova rodada começou. Volte à página inicial para entrar.";
  show("waiting-screen");
}

function renderFeedback(data) {
  if (!data?.id || data.id === lastFeedbackId) return;
  lastFeedbackId = data.id;
  feedback.className = `feedback-card ${data.kind || "info"}`;
  feedback.replaceChildren();
  const message = document.createElement("strong");
  message.textContent = data.text || "";
  feedback.append(message);
  if (data.definitionPt) {
    const definition = document.createElement("span");
    definition.textContent = `${data.term}: ${data.definitionPt}`;
    feedback.append(definition);
  }
}

function paintFragment(room) {
  const state = room?.game;
  if (!state) return;
  if (state.event) {
    fragment.textContent = state.event.icon || "⚡";
    return;
  }
  const mineNow = state.currentPlayerId === game.uid;
  const hidden = mineNow && Number(state.hiddenUntil || 0) > game.serverNow();
  fragment.textContent = hidden ? "???" : (state.fragment || "--");
  fragment.classList.toggle("is-hidden", hidden);
}

function renderEvent(event, mine, current) {
  eventCard.replaceChildren();
  eventCard.classList.toggle("hidden", !event);
  bombStage.classList.toggle("event", Boolean(event));
  fragment.classList.toggle("is-icon", Boolean(event));
  if (!event) return;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  eventCard.append(
    make("p", "event-eyebrow", "⚡ EVENTO ESPECIAL"),
    make("h2", "event-title", `${event.icon} ${event.title}`),
    make("p", "event-hint", event.hintPt),
    make("p", "event-mask", event.mask),
    make("p", "event-reward", `Prêmio: ${event.rewardPt}`),
    make("p", "event-note", mine ? "Digite a palavra em inglês. Errar não tira vida!" : `${current?.name || "O jogador"} está tentando…`)
  );
}

function renderGame(room) {
  const state = room.game || {};
  const current = room.players?.[state.currentPlayerId];
  const mine = state.currentPlayerId === game.uid && room.players?.[game.uid]?.status === "alive";
  remaining.textContent = String(Object.values(room.players || {}).filter((player) => player.status === "alive").length);
  round.textContent = `RODADA ${state.roundNumber || 1} · ${state.direction === -1 ? "↺ sentido invertido" : "↻"}`;
  renderEvent(state.event, mine, current);
  paintFragment(room);
  turnStatus.textContent = current ? `Vez de ${current.name}` : "Encerrando…";
  roster(gameRoster, room, true);
  renderFeedback(state.feedback);
  liveTyping.textContent = room.typing?.[state.currentPlayerId]?.text ? `${current?.name || "Jogador"} está digitando: ${room.typing[state.currentPlayerId].text}` : "";
  answer.disabled = !mine;
  answerButton.disabled = !mine;
  answer.placeholder = state.event ? "Digite a palavra especial" : "Digite uma palavra em inglês";
  turnInstruction.textContent = mine
    ? (state.event ? "SUA VEZ! Complete o evento especial." : "SUA VEZ! Digite uma palavra com o fragmento.")
    : `Aguarde ${current?.name || "a próxima"}.`;
  if (mine && !lastOwnTurn) window.setTimeout(() => answer.focus(), 30);
  if (!mine && lastOwnTurn) {
    answer.value = "";
    game.clearTyping();
  }
  lastOwnTurn = mine;
  show("game-screen");
}

function renderPodium(room) {
  const places = room.game?.podium || [];
  for (const number of [1, 2, 3]) {
    const slot = $(`#place-${number}`);
    const player = places[number - 1];
    slot.querySelector("strong").textContent = player ? `${player.avatar || "💻"} ${player.name}` : "—";
  }
  finishReason.textContent = room.game?.finishReason === "last-player" ? "Um jogador ficou vivo." : "Partida finalizada pelo admin.";
  show("podium-screen");
}

function render(room) {
  const player = room?.players?.[game.uid];
  if (room.status === "playing") {
    if (!player) {
      waitingMessage.textContent = "Partida em andamento. Aguarde a próxima rodada.";
      show("waiting-screen");
    } else renderGame(room);
  } else if (room.status === "finished") renderPodium(room);
  else renderWaiting(room, Boolean(player));
}

answer.addEventListener("input", () => game.sendTyping(answer.value));
answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!answer.value.trim() || answer.disabled) return;
  answerButton.disabled = true;
  await game.submitAnswer(answer.value);
  answer.value = "";
});

glossaryButton.addEventListener("click", () => {
  if (!glossaryBuilt) {
    glossaryBuilt = true;
    for (const item of getEntries()) {
      const line = document.createElement("li");
      const term = document.createElement("strong");
      term.textContent = `${item.icon || ""} ${item.term}`.trim();
      line.append(term);
      if (item.hintPt) {
        const hint = document.createElement("span");
        hint.textContent = item.hintPt;
        line.append(hint);
      }
      glossaryList.append(line);
    }
  }
  const hidden = glossary.classList.toggle("hidden");
  glossaryButton.textContent = hidden ? "Ver glossário completo" : "Ocultar glossário";
});

game.onStateChange = render;
game.onTimer = ({ remaining: milliseconds, duration }) => {
  const ratio = Math.max(0, Math.min(1, milliseconds / (duration * 1000)));
  timerNumber.textContent = String(Math.ceil(milliseconds / 1000));
  timerBar.style.width = `${ratio * 100}%`;
  paintFragment(game.room);
  bombStage.classList.toggle("critical", ratio <= .25);
};

if (!game.configured) {
  waitingMessage.textContent = "O Firebase ainda não foi configurado.";
  show("waiting-screen");
} else {
  game.authenticate().catch((error) => {
    console.error(error);
    waitingMessage.textContent = "Não foi possível conectar ao Firebase.";
  });
}
