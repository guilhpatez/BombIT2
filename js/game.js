import { firebaseIsConfigured } from "./firebase-config.js";
import { SPECIAL_WORDS, COMMON_WORDS, COMMON_FRAGMENT_POOL } from "./words.js";

// Sala padrão própria desta versão: não mistura dados com a versão 1 do BombIT (mesmo Firebase).
const DEFAULT_ROOM = "bombit2-principal";
export const MAX_PLAYERS = 40;
export const INITIAL_LIVES = 1;
export const START_TIME = 15;
export const MIN_TIME = 6;
const FRAGMENT_SIZE = 2;
const MIN_FRAGMENT_WORDS = 25;   // um fragmento só é sorteado se existirem muitas palavras com ele

// ---- Eventos especiais -------------------------------------------------
export const MAX_LIVES = 3;
const EVENT_TIME = 15;           // segundos para responder um evento
const EVENT_MIN_GAP = 4;         // nunca antes de 4 acertos desde o último evento
const EVENT_MAX_GAP = 9;         // garantido até o 9º acerto
const EVENT_CHANCE = 0.3;        // chance por acerto entre o mínimo e o máximo
const INK_PENALTY = 4;           // segundos tirados do próximo jogador (Ink)
const DARK_MS = 4000;            // tempo com fragmento escondido (Hide Edges)
const MIN_TURN_AFTER_INK = 5;

export function normalizeTerm(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function normalizedName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function validateName(rawName) {
  const name = String(rawName ?? "");
  if (name !== name.trim()) return "Não use espaços no começo ou no fim do nome.";
  if ([...name].length < 2 || [...name].length > 16) return "Use entre 2 e 16 caracteres.";
  if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) return "Use apenas letras, números, espaço, ponto, hífen ou sublinhado.";
  return "";
}

// Palavras especiais = eventos (glossário oficial da turma).
const SPECIAL_ENTRIES = SPECIAL_WORDS.map((entry) => ({
  ...entry,
  canonical: normalizeTerm(entry.term),
  mask: maskTerm(entry.term)
}));

function maskTerm(term) {
  return String(term).split(" ").map((word) => [...word].map((letter, index) => (index === 0 ? letter.toUpperCase() : "_")).join(" ")).join("   ");
}

// Respostas válidas nos turnos normais: palavras comuns do dicionário.
const ANSWER_MAP = new Map();
for (const word of COMMON_WORDS) {
  const canonical = normalizeTerm(word);
  if (canonical.length >= 3 && !ANSWER_MAP.has(canonical)) ANSWER_MAP.set(canonical, { term: word, canonical });
}

// Fragmentos vêm só das palavras mais conhecidas e só se forem "jogáveis".
const FRAGMENT_MAP = new Map();
for (const word of COMMON_WORDS.slice(0, COMMON_FRAGMENT_POOL)) {
  const source = normalizeTerm(word);
  if (!ANSWER_MAP.has(source)) continue;
  for (let index = 0; index <= source.length - FRAGMENT_SIZE; index += 1) {
    const fragment = source.slice(index, index + FRAGMENT_SIZE);
    if (!FRAGMENT_MAP.has(fragment)) FRAGMENT_MAP.set(fragment, new Set());
    FRAGMENT_MAP.get(fragment).add(source);
  }
}
for (const [fragment, terms] of [...FRAGMENT_MAP.entries()]) {
  if (terms.size < MIN_FRAGMENT_WORDS) FRAGMENT_MAP.delete(fragment);
}

function entryExtra(entry) {
  const extra = {};
  if (entry?.term) extra.term = entry.term;
  if (entry?.hintPt) extra.definitionPt = entry.hintPt;
  return extra;
}

function getOrder(data) {
  const order = data?.game?.turnOrder;
  return Array.isArray(order) ? order : Object.values(order || {});
}

function isAlive(player) {
  return player?.status === "alive";
}

function aliveIds(data) {
  return Object.entries(data?.players || {})
    .filter(([, player]) => isAlive(player))
    .map(([uid]) => uid);
}

function chooseFragment(usedTerms = {}) {
  const possibilities = [];
  for (const [fragment, terms] of FRAGMENT_MAP.entries()) {
    if ([...terms].some((term) => !usedTerms[term])) possibilities.push(fragment);
  }
  if (!possibilities.length) return null;
  return possibilities[Math.floor(Math.random() * possibilities.length)];
}

function fragmentStillPlayable(fragment, usedTerms = {}) {
  const candidates = FRAGMENT_MAP.get(fragment);
  return Boolean(candidates && [...candidates].some((term) => !usedTerms[term]));
}

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function nextAliveIndex(data, fromIndex, direction = 1) {
  const order = getOrder(data);
  if (!order.length) return -1;
  for (let step = 1; step <= order.length; step += 1) {
    const index = (((fromIndex + step * direction) % order.length) + order.length) % order.length;
    if (isAlive(data.players?.[order[index]])) return index;
  }
  return -1;
}

function nameFor(data, uid) {
  return data.players?.[uid]?.name || "Jogador";
}

function makeFeedback(kind, text, now, extra = {}) {
  return { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, kind, text, at: now, ...extra };
}

function rankingFrom(data, includeAllAlive = false) {
  const order = getOrder(data);
  const position = new Map(order.map((uid, index) => [uid, index]));
  const alive = Object.entries(data.players || {})
    .filter(([, player]) => isAlive(player))
    .sort(([firstId, first], [secondId, second]) => {
      if (includeAllAlive && Number(second.lives) !== Number(first.lives)) return Number(second.lives) - Number(first.lives);
      return (position.get(firstId) ?? 999) - (position.get(secondId) ?? 999);
    });
  const eliminated = Object.entries(data.players || {})
    .filter(([, player]) => player.status === "eliminated")
    .sort(([, first], [, second]) => Number(second.eliminationOrder || 0) - Number(first.eliminationOrder || 0));

  return [...alive, ...eliminated].slice(0, 3).map(([uid, player]) => ({
    uid,
    name: player.name,
    avatar: player.avatar || "💻"
  }));
}

function finishGame(data, reason, now, includeAllAlive = false) {
  data.status = "finished";
  data.typing = {};
  data.game = data.game || {};
  data.game.currentPlayerId = null;
  data.game.finishedAt = now;
  data.game.finishedAtServer = firebase.database.ServerValue.TIMESTAMP;
  data.game.finishReason = reason;
  data.game.podium = rankingFrom(data, includeAllAlive);
}

/**
 * Cliente de estado do jogo. As decisões relevantes são feitas em transações
 * na raiz da sala para que duas abas não aceitem a mesma palavra/turno.
 */
export class GameController {
  constructor(roomId) {
    this.roomId = roomId;
    this.uid = null;
    this.room = null;
    this.serverOffset = 0;
    this.roomRef = null;
    this.playerRef = null;
    this.onStateChange = () => {};
    this.onTimer = () => {};
    this.timeoutInFlight = false;
    this.typingTimer = null;
    this.presenceArmed = false;
    this.identity = null;
    this.timerLoop = null;
    // Verdadeiro só no painel do admin (admin.html): ele sempre pode controlar a sala.
    this.isAdmin = false;
  }

  /**
   * Transação segura. O Firebase cancela uma transação pendente com "Error: set" quando
   * outra escrita (presença, "digitando") acontece ao mesmo tempo na sala. Aqui evitamos
   * eventos locais intermediários e tentamos de novo se isso acontecer.
   */
  async tx(update) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.roomRef.transaction(update, undefined, false);
      } catch (error) {
        if (String(error?.message) !== "set" || attempt >= 4) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
  }

  /** O admin autenticado assume o controle da sala na própria ação (sem depender de disputas por hostId). */
  takeControl(data) {
    if (data.hostId === this.uid) return true;
    if (!this.isAdmin) return false;
    data.hostId = this.uid;
    return true;
  }

  get configured() {
    return firebaseIsConfigured;
  }

  serverNow() {
    return Date.now() + this.serverOffset;
  }

  async authenticate() {
    if (!firebaseIsConfigured) throw new Error("Firebase não configurado");
    const auth = firebase.auth();
    const credential = auth.currentUser ? { user: auth.currentUser } : await auth.signInAnonymously();
    this.uid = credential.user.uid;
    this.roomRef = firebase.database().ref(`rooms/${this.roomId}`);
    this.playerRef = this.roomRef.child(`players/${this.uid}`);

    firebase.database().ref(".info/serverTimeOffset").on("value", (snapshot) => {
      this.serverOffset = Number(snapshot.val() || 0);
    });

    this.roomRef.on("value", (snapshot) => {
      this.room = snapshot.val() || { status: "lobby", players: {} };
      if (!this.isAdmin && this.room.players?.[this.uid] && !this.presenceArmed) this.armPresence();
      this.onStateChange(this.room);
    });

    if (!this.timerLoop) {
      this.timerLoop = window.setInterval(() => this.tick(), 250);
    }
    return this.uid;
  }

  armPresence() {
    if (!this.playerRef) return;
    this.presenceArmed = true;
    this.playerRef.update({
      connected: true,
      lastSeenAt: firebase.database.ServerValue.TIMESTAMP
    });
    this.playerRef.onDisconnect().update({
      connected: false,
      disconnectedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  suggestName(requested, players = this.room?.players || {}) {
    const base = String(requested).trim();
    const names = new Set(Object.values(players).map((player) => normalizedName(player.name)));
    if (!names.has(normalizedName(base))) return base;
    for (let number = 2; number < 1000; number += 1) {
      const suffix = String(number);
      const candidate = `${base.slice(0, 16 - suffix.length)}${suffix}`;
      if (!names.has(normalizedName(candidate))) return candidate;
    }
    return `${base.slice(0, 13)}999`;
  }

  async joinRoom(name, avatar) {
    const invalid = validateName(name);
    if (invalid) return { ok: false, reason: invalid };
    if (!this.uid) await this.authenticate();

    const cleanName = name.trim();
    this.identity = { name: cleanName, avatar };
    let issue = "";
    let suggestion = cleanName;
    const now = this.serverNow();

    const result = await this.tx((current) => {
      const data = current || { status: "lobby", players: {}, settings: { initialLives: INITIAL_LIVES } };
      if (data.status === "playing") {
        issue = "Partida em andamento — aguarde a próxima rodada.";
        return;
      }
      if (data.status === "finished") {
        issue = "A partida terminou. Aguarde o admin iniciar uma nova rodada.";
        return;
      }

      data.status = "lobby";
      data.players = data.players || {};
      data.settings = data.settings || { initialLives: INITIAL_LIVES };

      // No lobby, jogadores que já caíram podem liberar lugar e nome.
      for (const [uid, player] of Object.entries(data.players)) {
        if (!player.connected && uid !== this.uid) delete data.players[uid];
      }

      const wantedKey = normalizedName(cleanName);
      const duplicate = Object.entries(data.players).find(([uid, player]) => uid !== this.uid && normalizedName(player.name) === wantedKey);
      if (duplicate) {
        issue = "Esse nome já está em uso nesta sala.";
        suggestion = this.suggestName(cleanName, data.players);
        return;
      }
      if (!data.players[this.uid] && Object.keys(data.players).length >= MAX_PLAYERS) {
        issue = "A sala já chegou ao limite de 40 jogadores.";
        return;
      }

      const existing = data.players[this.uid] || {};
      data.players[this.uid] = {
        ...existing,
        name: cleanName,
        avatar,
        connected: true,
        status: "lobby",
        lives: 0,
        joinedAt: existing.joinedAt || now,
        lastSeenAt: firebase.database.ServerValue.TIMESTAMP
      };
      if (!data.hostId) data.hostId = this.uid;
      return data;
    });

    if (!result.committed) return { ok: false, reason: issue || "Não foi possível entrar na sala.", suggestion };
    this.armPresence();
    return { ok: true };
  }

  async setInitialLives(lives) {
    const safeLives = Math.min(3, Math.max(1, Number(lives) || INITIAL_LIVES));
    const result = await this.tx((data) => {
      if (!data || data.status !== "lobby" || !this.takeControl(data)) return;
      data.settings = data.settings || {};
      data.settings.initialLives = safeLives;
      return data;
    });
    return result.committed;
  }

  async startGame() {
    const now = this.serverNow();
    let issue = "";
    const result = await this.tx((data) => {
      if (!data || data.status !== "lobby" || !this.takeControl(data)) {
        issue = !data || data.status !== "lobby" ? "A sala não está no lobby. Clique em \"Nova partida\" ou troque o nome da sala." : "Somente o admin pode iniciar a partida.";
        return;
      }
      const connectedIds = Object.entries(data.players || {})
        .filter(([, player]) => player.connected)
        .map(([uid]) => uid);
      if (connectedIds.length < 2) {
        issue = "São necessários pelo menos 2 jogadores conectados.";
        return;
      }

      const fragment = chooseFragment({});
      if (!fragment) {
        issue = "O glossário não tem fragmentos disponíveis.";
        return;
      }
      const turnOrder = shuffled(connectedIds);
      const lives = Math.min(3, Math.max(1, Number(data.settings?.initialLives) || INITIAL_LIVES));
      for (const uid of turnOrder) {
        data.players[uid] = {
          ...data.players[uid],
          status: "alive",
          lives,
          shield: false,
          eliminatedAt: null,
          eliminationOrder: null
        };
      }
      data.status = "playing";
      data.usedTerms = {};
      data.eventsUsed = {};
      data.typing = {};
      data.game = {
        turnOrder,
        currentTurnIndex: 0,
        currentPlayerId: turnOrder[0],
        fragment,
        turnDuration: START_TIME,
        currentDuration: START_TIME,
        direction: 1,
        speedBase: 0,
        turnsSinceEvent: 0,
        event: null,
        hiddenUntil: 0,
        turnStartedAt: now,
        turnStartedAtServer: firebase.database.ServerValue.TIMESTAMP,
        turnEndsAt: now + START_TIME * 1000,
        successfulTurns: 0,
        roundNumber: 1,
        eliminationCounter: 0,
        feedback: makeFeedback("info", `A bomba começa com ${nameFor(data, turnOrder[0])}.`, now)
      };
      return data;
    });
    return { ok: result.committed, reason: issue };
  }

  applyAdvance(data, game, now, { newFragment, feedback, allowEvent = false, inkPenalty = 0, darkMs = 0 }) {
    const nextIndex = nextAliveIndex(data, Number(game.currentTurnIndex), game.direction === -1 ? -1 : 1);
    if (nextIndex < 0) {
      finishGame(data, "last-player", now);
      return;
    }

    // Um evento dura apenas um turno; qualquer avanço o encerra.
    const hadEvent = Boolean(game.event);
    game.event = null;

    let fragment = (newFragment || hadEvent) ? chooseFragment(data.usedTerms || {}) : game.fragment;
    if (!fragmentStillPlayable(fragment, data.usedTerms || {})) fragment = chooseFragment(data.usedTerms || {});
    if (!fragment) {
      // Com o dicionário esgotado, a partida é encerrada sem reutilizar termos.
      finishGame(data, "glossary-exhausted", now, true);
      return;
    }

    // Sorteio de evento especial (só depois de um acerto normal).
    let seconds = Number(game.turnDuration);
    if (allowEvent) {
      game.turnsSinceEvent = Number(game.turnsSinceEvent || 0) + 1;
      const gap = game.turnsSinceEvent;
      if (gap >= EVENT_MAX_GAP || (gap >= EVENT_MIN_GAP && Math.random() < EVENT_CHANCE)) {
        const pool = SPECIAL_ENTRIES.filter((entry) => !data.eventsUsed?.[entry.canonical]);
        const options = pool.length ? pool : SPECIAL_ENTRIES;
        if (!pool.length) data.eventsUsed = {};
        const chosen = options[Math.floor(Math.random() * options.length)];
        data.eventsUsed = data.eventsUsed || {};
        data.eventsUsed[chosen.canonical] = true;
        game.event = {
          canonical: chosen.canonical,
          term: chosen.term,
          icon: chosen.icon,
          title: chosen.title,
          effect: chosen.effect,
          hintPt: chosen.hintPt,
          rewardPt: chosen.rewardPt,
          mask: chosen.mask
        };
        game.turnsSinceEvent = 0;
        seconds = EVENT_TIME;
        feedback = makeFeedback("event", `${chosen.icon} EVENTO ESPECIAL: ${chosen.title}!`, now);
      }
    }
    if (!game.event && inkPenalty) seconds = Math.max(MIN_TURN_AFTER_INK, seconds - inkPenalty);

    const order = getOrder(data);
    game.currentTurnIndex = nextIndex;
    game.currentPlayerId = order[nextIndex];
    game.fragment = fragment;
    game.currentDuration = seconds;
    game.hiddenUntil = (!game.event && darkMs) ? now + darkMs : 0;
    game.turnStartedAt = now;
    game.turnStartedAtServer = firebase.database.ServerValue.TIMESTAMP;
    game.turnEndsAt = now + seconds * 1000;
    game.feedback = feedback;
    data.typing = {};
  }

  /** Resultado de um evento especial (acerto ou falha). Falhar NÃO tira vida. */
  applyEventResult(data, success, reason, now) {
    const game = data.game;
    const event = game.event;
    const uid = game.currentPlayerId;
    const player = data.players?.[uid];
    if (!event || !player) return;
    const label = nameFor(data, uid);
    const options = {};
    let feedback;

    if (success) {
      switch (event.effect) {
        case "usb": player.lives = Math.min(MAX_LIVES, Number(player.lives || 0) + 1); break;
        case "shield": player.shield = true; break;
        case "reverse": game.direction = game.direction === -1 ? 1 : -1; break;
        case "ink": options.inkPenalty = INK_PENALTY; break;
        case "dark": options.darkMs = DARK_MS; break;
        case "reset":
          game.turnDuration = START_TIME;
          game.speedBase = Number(game.successfulTurns || 0);
          break;
        default: break;
      }
      feedback = makeFeedback("success", `${event.icon} ${label} completou "${event.title}"! ${event.rewardPt}.`, now, {
        term: event.term,
        definitionPt: event.hintPt
      });
    } else {
      const why = reason === "wrong" ? "Resposta errada" : "O tempo acabou";
      feedback = makeFeedback("skip", `${event.icon} ${why} no evento ${event.title}. Era: ${event.term}. Sem bônus, mas sem perder vida.`, now, {
        term: event.term,
        definitionPt: event.hintPt
      });
    }
    this.applyAdvance(data, game, now, { newFragment: true, feedback, ...options });
  }

  applyLoss(data, reason, now, submittedEntry = null) {
    const game = data.game;
    const uid = game.currentPlayerId;
    const player = data.players?.[uid];
    if (!player) return;

    // Durante um evento especial ninguém perde vida.
    if (game.event) {
      this.applyEventResult(data, false, reason, now);
      return;
    }

    const label = nameFor(data, uid);
    // Escudo (evento Integer): absorve uma explosão.
    if (player.shield) {
      player.shield = false;
      this.applyAdvance(data, game, now, {
        newFragment: false,
        feedback: makeFeedback("info", `🛡️ O escudo de ${label} absorveu a explosão!`, now)
      });
      return;
    }
    player.lives = Math.max(0, Number(player.lives || 0) - 1);
    let text = `💥 ${label} perdeu uma vida.`;
    if (player.lives <= 0) {
      player.status = "eliminated";
      player.eliminatedAt = now;
      game.eliminationCounter = Number(game.eliminationCounter || 0) + 1;
      player.eliminationOrder = game.eliminationCounter;
      text = `💀 ${label} foi eliminado.`;
    }

    const stillAlive = aliveIds(data);
    if (stillAlive.length <= 1) {
      finishGame(data, "last-player", now);
      data.game.feedback = makeFeedback("error", text, now, entryExtra(submittedEntry));
      return;
    }

    const messages = {
      timeout: `${text} O tempo acabou.`,
      disconnected: `${text} ${label} desconectou; a vez foi pulada.`,
      repeated: `${text} Esse termo já foi usado.`,
      wrongFragment: `${text} O termo não contém o fragmento atual.`,
      invalid: `${text} Esse termo não está no glossário.`,
      late: `${text} O tempo acabou antes do envio.`
    };
    this.applyAdvance(data, game, now, {
      newFragment: false,
      feedback: makeFeedback("error", messages[reason] || text, now, entryExtra(submittedEntry))
    });
  }

  async submitAnswer(rawAnswer) {
    const answer = normalizeTerm(rawAnswer);
    const entry = ANSWER_MAP.get(answer);
    const now = this.serverNow();
    let issue = "";
    const result = await this.tx((data) => {
      const game = data?.game;
      if (!data || data.status !== "playing" || !game || game.currentPlayerId !== this.uid) {
        issue = "Não é a sua vez.";
        return;
      }
      if (game.event) {
        if (now >= Number(game.turnEndsAt)) {
          this.applyEventResult(data, false, "late", now);
          issue = "O tempo acabou.";
        } else if (answer === game.event.canonical) {
          this.applyEventResult(data, true, "", now);
        } else {
          this.applyEventResult(data, false, "wrong", now);
          issue = "Palavra do evento incorreta.";
        }
        return data;
      }
      if (now >= Number(game.turnEndsAt)) {
        this.applyLoss(data, "late", now, entry || null);
        issue = "O tempo acabou.";
        return data;
      }
      if (!entry) {
        this.applyLoss(data, "invalid", now);
        issue = "Termo inválido.";
        return data;
      }
      if (!entry.canonical.includes(game.fragment)) {
        this.applyLoss(data, "wrongFragment", now, entry);
        issue = "O termo não contém o fragmento.";
        return data;
      }
      if (data.usedTerms?.[entry.canonical]) {
        this.applyLoss(data, "repeated", now, entry);
        issue = "Esse termo já foi usado.";
        return data;
      }

      data.usedTerms = data.usedTerms || {};
      data.usedTerms[entry.canonical] = {
        term: entry.term,
        usedBy: this.uid,
        usedAt: now,
        usedAtServer: firebase.database.ServerValue.TIMESTAMP
      };
      game.successfulTurns = Number(game.successfulTurns || 0) + 1;
      game.turnDuration = Math.max(MIN_TIME, START_TIME - Math.floor((game.successfulTurns - Number(game.speedBase || 0)) / 5));
      game.roundNumber = Number(game.roundNumber || 1) + 1;
      this.applyAdvance(data, game, now, {
        newFragment: true,
        allowEvent: true,
        feedback: makeFeedback("success", `✓ ${nameFor(data, this.uid)} acertou: ${entry.term}.`, now, entryExtra(entry))
      });
      return data;
    });
    this.clearTyping();
    return { ok: result.committed, reason: issue, entry };
  }

  async resolveExpiredTurn(kind = "timeout") {
    if (this.timeoutInFlight) return;
    this.timeoutInFlight = true;
    const now = this.serverNow();
    try {
      await this.tx((data) => {
        const game = data?.game;
        if (!data || data.status !== "playing" || !game?.currentPlayerId) return;
        const currentPlayer = data.players?.[game.currentPlayerId];
        const expired = now >= Number(game.turnEndsAt);
        const disconnected = currentPlayer && currentPlayer.connected === false;
        if (!expired && !disconnected) return;
        this.applyLoss(data, disconnected ? "disconnected" : kind, now);
        return data;
      });
    } finally {
      this.timeoutInFlight = false;
    }
  }

  async skipTurn() {
    const now = this.serverNow();
    const result = await this.tx((data) => {
      const game = data?.game;
      if (!data || data.status !== "playing" || !this.takeControl(data) || !game?.currentPlayerId) return;
      this.applyAdvance(data, game, now, {
        newFragment: false,
        feedback: makeFeedback("skip", `↪ ${nameFor(data, game.currentPlayerId)} teve a vez pulada pelo admin.`, now)
      });
      return data;
    });
    return result.committed;
  }

  async endGame() {
    const now = this.serverNow();
    const result = await this.tx((data) => {
      if (!data || data.status !== "playing" || !this.takeControl(data)) return;
      finishGame(data, "host-ended", now, true);
      data.game.feedback = makeFeedback("skip", "Partida encerrada pelo admin.", now);
      return data;
    });
    return result.committed;
  }

  async resetRoom() {
    if (!this.identity) return { ok: false, reason: "Seu nome não está disponível para a nova rodada." };
    const previousLives = Number(this.room?.settings?.initialLives) || INITIAL_LIVES;
    const result = await this.tx((data) => {
      if (!data || data.status !== "finished" || data.hostId !== this.uid) return;
      return {
        status: "lobby",
        hostId: null,
        players: {},
        settings: { initialLives: Math.min(3, Math.max(1, previousLives)) },
        resetAt: firebase.database.ServerValue.TIMESTAMP,
        resetCount: Number(data.resetCount || 0) + 1
      };
    });
    if (!result.committed) return { ok: false, reason: "Somente o admin pode reiniciar a sala." };
    this.presenceArmed = false;
    return this.joinRoom(this.identity.name, this.identity.avatar);
  }

  sendTyping(value) {
    window.clearTimeout(this.typingTimer);
    const text = String(value || "").slice(0, 48);
    this.typingTimer = window.setTimeout(() => {
      if (this.room?.status !== "playing" || this.room.game?.currentPlayerId !== this.uid) return;
      this.roomRef.child(`typing/${this.uid}`).set({ text, at: firebase.database.ServerValue.TIMESTAMP });
    }, 150);
  }

  clearTyping() {
    window.clearTimeout(this.typingTimer);
    if (this.roomRef && this.uid) this.roomRef.child(`typing/${this.uid}`).remove();
  }

  tick() {
    const game = this.room?.game;
    if (!game || this.room?.status !== "playing") return;
    const remaining = Math.max(0, Number(game.turnEndsAt) - this.serverNow());
    this.onTimer({ remaining, duration: Number(game.currentDuration || game.turnDuration) || START_TIME });
    const current = this.room.players?.[game.currentPlayerId];
    if (remaining <= 0 || current?.connected === false) this.resolveExpiredTurn(current?.connected === false ? "disconnected" : "timeout");
  }
}

export function getRoomId() {
  const requested = new URLSearchParams(window.location.search).get("sala") || DEFAULT_ROOM;
  const safe = requested.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return safe || DEFAULT_ROOM;
}

/** Glossário oficial = as palavras especiais (eventos). */
export function getEntries() {
  return SPECIAL_ENTRIES;
}
