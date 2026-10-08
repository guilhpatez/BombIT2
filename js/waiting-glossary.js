import { getEntries } from "./game.js";

const button = document.querySelector("#waiting-glossary-button");
const panel = document.querySelector("#waiting-glossary");
const list = document.querySelector("#waiting-glossary-list");
let built = false;

button.addEventListener("click", () => {
  if (!built) {
    built = true;
    for (const entry of getEntries()) {
      const item = document.createElement("li");
      const term = document.createElement("strong");
      term.textContent = `${entry.icon || ""} ${entry.term}`.trim();
      item.append(term);
      if (entry.hintPt) {
        const hint = document.createElement("span");
        hint.textContent = entry.hintPt;
        item.append(hint);
      }
      list.append(item);
    }
  }
  const hidden = panel.classList.toggle("hidden");
  button.setAttribute("aria-expanded", String(!hidden));
  button.textContent = hidden ? "Ver glossário completo" : "Ocultar glossário";
});
