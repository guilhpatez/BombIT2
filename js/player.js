import { GameController, getRoomId } from "./game.js";

const game = new GameController(getRoomId());
const form = document.querySelector("#join-form");
const nameInput = document.querySelector("#player-name");
const submitButton = document.querySelector("#join-button");
const notice = document.querySelector("#entry-notice");
const roomLabel = document.querySelector("#room-label");
const avatars = [...document.querySelectorAll("[data-avatar]")];
let avatar = "🚀";

roomLabel.textContent = `Sala: ${game.roomId}`;

function showNotice(message = "", kind = "") {
  notice.textContent = message;
  notice.className = `notice ${message ? "" : "hidden"} ${kind}`;
}

function setFormLocked(locked) {
  nameInput.disabled = locked;
  submitButton.disabled = locked;
  avatars.forEach((button) => { button.disabled = locked; });
}

avatars.forEach((button) => {
  button.addEventListener("click", () => {
    avatar = button.dataset.avatar;
    avatars.forEach((option) => {
      const selected = option === button;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
  });
});

game.onStateChange = (room) => {
  if (room.status === "playing") {
    setFormLocked(true);
    showNotice("Partida em andamento — aguarde a próxima rodada.", "warning");
  } else if (room.status === "finished") {
    setFormLocked(true);
    showNotice("A rodada terminou. Aguarde o admin abrir a próxima.", "warning");
  } else {
    setFormLocked(false);
    showNotice("");
  }
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showNotice("Entrando na sala…");
  try {
    const result = await game.joinRoom(nameInput.value, avatar);
    if (!result.ok) {
      if (result.suggestion) nameInput.value = result.suggestion;
      showNotice(result.suggestion ? `${result.reason} Sugestão: ${result.suggestion}` : result.reason, "error");
      submitButton.disabled = false;
      return;
    }
    window.location.assign(`sala.html?sala=${encodeURIComponent(game.roomId)}`);
  } catch (error) {
    console.error(error);
    showNotice("Não foi possível conectar. Confira o Firebase e tente novamente.", "error");
    submitButton.disabled = false;
  }
});

if (!game.configured) {
  setFormLocked(true);
  showNotice("O Firebase ainda não foi configurado.", "error");
} else {
  game.authenticate().catch((error) => {
    console.error(error);
    setFormLocked(true);
    showNotice("Não foi possível iniciar a conexão com o Firebase.", "error");
  });
}
