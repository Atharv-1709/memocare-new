import { escapeHtml } from "./utils.js";
import { toast } from "./notifications.js";

const ICONS = ["☀", "☕", "★", "♥", "⌂", "♫", "✿", "●"];
const WORDS = ["HOME", "FAMILY", "GARDEN", "MORNING", "TEA", "SMILE", "MUSIC", "FRIEND"];
let memory = { deck: [], open: [], matched: new Set(), moves: 0, locked: false };
let sequence = { values: [], input: [], level: 1, accepting: false };
let recall = { words: [], hidden: false };

export function shuffle(values, random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function newMemory() {
  memory = { deck: shuffle([...ICONS, ...ICONS]), open: [], matched: new Set(), moves: 0, locked: false };
}

function memoryMarkup() {
  if (!memory.deck.length) newMemory();
  return `
    <div class="game-status" role="status">Moves: <strong>${memory.moves}</strong> · Pairs: <strong>${memory.matched.size / 2}/8</strong></div>
    <div class="memory-game-board" aria-label="Memory card board">
      ${memory.deck.map((icon, index) => {
        const visible = memory.open.includes(index) || memory.matched.has(index);
        return `<button class="memory-tile ${visible ? "is-open" : ""} ${memory.matched.has(index) ? "is-matched" : ""}" type="button" data-game-card="${index}" aria-label="${visible ? `Card ${index + 1}: ${icon}` : `Turn over card ${index + 1}`}"><span aria-hidden="true">${visible ? icon : "?"}</span></button>`;
      }).join("")}
    </div>
    <button class="button button-secondary" type="button" data-game-action="new-memory">New memory game</button>
  `;
}

function sequenceMarkup() {
  return `
    <div class="game-status" id="sequence-status" role="status">Level <strong>${sequence.level}</strong>. Press Start, watch the lights, then repeat them.</div>
    <div class="sequence-board" aria-label="Sequence buttons">
      ${[0, 1, 2, 3].map((index) => `<button class="sequence-key sequence-${index}" type="button" data-sequence-key="${index}" aria-label="Sequence colour ${index + 1}">${index + 1}</button>`).join("")}
    </div>
    <button class="button button-primary" type="button" data-game-action="start-sequence">Start sequence</button>
  `;
}

function newRecall() {
  recall = { words: shuffle(WORDS).slice(0, 4), hidden: false };
}

function recallMarkup() {
  if (!recall.words.length) newRecall();
  return `
    <p>Study these four words, then hide them and type as many as you remember.</p>
    <div class="recall-words" aria-live="polite">${recall.hidden ? "Words hidden" : recall.words.map((word) => `<strong>${word}</strong>`).join("")}</div>
    <div class="row-actions">
      <button class="button button-secondary" type="button" data-game-action="toggle-recall">${recall.hidden ? "Show words" : "Hide words"}</button>
      <button class="button button-secondary" type="button" data-game-action="new-recall">New words</button>
    </div>
    <div class="field"><label for="recall-answer">Your remembered words</label><input id="recall-answer" autocomplete="off" placeholder="Type words separated by spaces"></div>
    <button class="button button-primary" type="button" data-game-action="check-recall">Check answer</button>
    <p id="recall-result" class="game-status" role="status"></p>
  `;
}

export function gamesPage() {
  return `
    <section class="page-section">
      <div class="page-intro"><div><p class="eyebrow">Gentle brain practice</p><h2>Memory games</h2><p>Keyboard, mouse, and touch friendly. No timer pressure and no external downloads.</p></div></div>
      <div class="game-grid">
        <article class="card game-panel"><div class="card-header"><div><h3>Match the pairs</h3><p class="card-subtitle">Turn over two cards at a time.</p></div></div><div id="memory-game">${memoryMarkup()}</div></article>
        <article class="card game-panel"><div class="card-header"><div><h3>Repeat the sequence</h3><p class="card-subtitle">Watch, remember, repeat.</p></div></div><div id="sequence-game">${sequenceMarkup()}</div></article>
        <article class="card game-panel"><div class="card-header"><div><h3>Word recall</h3><p class="card-subtitle">Remember four familiar words.</p></div></div><div id="recall-game">${recallMarkup()}</div></article>
      </div>
    </section>
  `;
}

function refresh(id, markup) {
  const element = document.getElementById(id);
  if (element) element.innerHTML = markup;
}

async function showSequence() {
  sequence.values = Array.from({ length: sequence.level + 2 }, () => Math.floor(Math.random() * 4));
  sequence.input = [];
  sequence.accepting = false;
  const status = document.getElementById("sequence-status");
  if (status) status.textContent = "Watch the sequence…";
  for (const key of sequence.values) {
    await new Promise((resolve) => setTimeout(resolve, 380));
    const button = document.querySelector(`[data-sequence-key="${key}"]`);
    button?.classList.add("is-active");
    await new Promise((resolve) => setTimeout(resolve, 420));
    button?.classList.remove("is-active");
  }
  sequence.accepting = true;
  if (status) status.textContent = "Your turn. Repeat the sequence.";
}

export async function handleGameAction(target) {
  const card = target.closest("[data-game-card]");
  if (card) {
    const index = Number(card.dataset.gameCard);
    if (memory.locked || memory.open.includes(index) || memory.matched.has(index)) return true;
    memory.open.push(index);
    refresh("memory-game", memoryMarkup());
    if (memory.open.length === 2) {
      memory.moves += 1;
      const [first, second] = memory.open;
      if (memory.deck[first] === memory.deck[second]) {
        memory.matched.add(first); memory.matched.add(second); memory.open = [];
        refresh("memory-game", memoryMarkup());
        if (memory.matched.size === memory.deck.length) toast(`Excellent! You matched every pair in ${memory.moves} moves.`, { type: "success" });
      } else {
        memory.locked = true;
        setTimeout(() => { memory.open = []; memory.locked = false; refresh("memory-game", memoryMarkup()); }, 750);
      }
    }
    return true;
  }

  const sequenceKey = target.closest("[data-sequence-key]");
  if (sequenceKey) {
    if (!sequence.accepting) return true;
    const value = Number(sequenceKey.dataset.sequenceKey);
    const position = sequence.input.push(value) - 1;
    sequenceKey.classList.add("is-active");
    setTimeout(() => sequenceKey.classList.remove("is-active"), 180);
    const status = document.getElementById("sequence-status");
    if (sequence.values[position] !== value) {
      sequence.accepting = false;
      if (status) status.textContent = `Good try. You reached level ${sequence.level}. Press Start to try again.`;
      sequence.level = 1;
    } else if (sequence.input.length === sequence.values.length) {
      sequence.accepting = false;
      if (status) status.textContent = "Correct! The next sequence will be one step longer.";
      sequence.level += 1;
    }
    return true;
  }

  const action = target.closest("[data-game-action]")?.dataset.gameAction;
  if (!action) return false;
  if (action === "new-memory") { newMemory(); refresh("memory-game", memoryMarkup()); }
  if (action === "start-sequence") await showSequence();
  if (action === "new-recall") { newRecall(); refresh("recall-game", recallMarkup()); }
  if (action === "toggle-recall") { recall.hidden = !recall.hidden; refresh("recall-game", recallMarkup()); }
  if (action === "check-recall") {
    const answer = document.getElementById("recall-answer")?.value.toUpperCase().match(/[A-Z]+/g) || [];
    const correct = new Set(answer.filter((word) => recall.words.includes(word))).size;
    const result = document.getElementById("recall-result");
    if (result) result.innerHTML = `You remembered <strong>${correct} of ${recall.words.length}</strong>. ${correct === recall.words.length ? "Wonderful!" : `The words were ${escapeHtml(recall.words.join(", "))}.`}`;
  }
  return true;
}
