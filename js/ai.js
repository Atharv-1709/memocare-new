import { store } from "./storage.js";
import { escapeHtml } from "./utils.js";
import { toast } from "./notifications.js";

function extractText(response) {
  if (typeof response === "string") return response;
  if (typeof response?.message?.content === "string") return response.message.content;
  if (Array.isArray(response?.message?.content)) return response.message.content.map((part) => part.text || "").join("\n");
  if (typeof response?.text === "string") return response.text;
  return String(response || "No response was returned.");
}

export function aiPage() {
  return `
    <section class="page-section">
      <div class="page-intro"><div><p class="eyebrow">Puter.js assistance</p><h2>Ask MemoCare AI</h2><p>Use AI for simple explanations, memory prompts, and routine help—not diagnosis, dosage decisions, or emergencies.</p></div></div>
      <div class="dashboard-grid">
        <article class="card span-8 ai-chat-card">
          <div id="ai-messages" class="ai-messages" role="log" aria-live="polite">
            <div class="ai-message ai-assistant"><strong>MemoCare AI</strong><p>Hello ${escapeHtml(store.data.profile.name || "there")}. What would you like help understanding?</p></div>
          </div>
          <form id="ai-form" class="ai-composer">
            <label class="field-label" for="ai-prompt">Your question</label>
            <textarea id="ai-prompt" name="prompt" required maxlength="2000" placeholder="For example: Help me turn my morning routine into four simple steps."></textarea>
            <div class="row-actions"><button class="button button-primary" type="submit">Ask AI</button><button class="button button-secondary" type="button" data-ai-action="clear">Clear conversation</button></div>
          </form>
        </article>
        <article class="card span-4">
          <h3>Safety boundaries</h3>
          <ul><li>AI can be wrong.</li><li>It does not know your full medical history.</li><li>Never use it to change a prescribed dose.</li><li>For danger or urgent symptoms, use Emergency and contact a real person.</li></ul>
          <p class="help-text">Puter may ask you to sign in and uses a user-pays model. MemoCare does not embed an API key.</p>
          <div class="data-list"><button class="quick-action" type="button" data-ai-prompt="Explain my saved reminders in very simple language."><span>◷</span><span><strong>Explain reminders</strong><small>Plain-language summary</small></span></button><button class="quick-action" type="button" data-ai-prompt="Create a calm four-step morning routine. Do not give medical advice."><span>☀</span><span><strong>Morning routine</strong><small>Four gentle steps</small></span></button></div>
        </article>
      </div>
    </section>
  `;
}

async function ask(prompt) {
  if (!globalThis.puter?.ai?.chat) throw new Error("Puter AI did not load. Check the internet connection, then retry.");
  const messages = document.getElementById("ai-messages");
  messages?.insertAdjacentHTML("beforeend", `<div class="ai-message ai-user"><strong>You</strong><p>${escapeHtml(prompt)}</p></div><div class="ai-message ai-assistant" id="ai-thinking"><strong>MemoCare AI</strong><p>Thinking…</p></div>`);
  messages?.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
  const context = `You are MemoCare's calm daily-assistance helper for an elderly or cognitively impaired user. Use short sentences, simple words, and at most 6 bullets. Never diagnose, recommend or alter medication dosage, or claim to contact a caregiver. If the user describes an emergency, tell them to use the Emergency area and contact a real person now. The interface language is ${store.data.profile.language}. User request: ${prompt}`;
  try {
    const response = await globalThis.puter.ai.chat(context);
    const text = extractText(response);
    const thinking = document.getElementById("ai-thinking");
    if (thinking) { thinking.removeAttribute("id"); thinking.innerHTML = `<strong>MemoCare AI</strong><p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`; }
  } catch (error) {
    document.getElementById("ai-thinking")?.remove();
    throw new Error(error?.msg || error?.message || "Puter AI could not answer. Please retry.");
  }
}

export async function handleAiAction(target) {
  if (target.closest("[data-ai-action='clear']")) {
    const messages = document.getElementById("ai-messages");
    if (messages) messages.innerHTML = '<div class="ai-message ai-assistant"><strong>MemoCare AI</strong><p>Conversation cleared. How can I help?</p></div>';
    return true;
  }
  const promptButton = target.closest("[data-ai-prompt]");
  if (promptButton) {
    const input = document.getElementById("ai-prompt");
    if (input) input.value = promptButton.dataset.aiPrompt;
    input?.focus();
    return true;
  }
  return false;
}

export function setupAiForm() {
  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "ai-form") return;
    event.preventDefault();
    const input = document.getElementById("ai-prompt");
    const prompt = input?.value.trim();
    if (!prompt) return;
    input.value = "";
    try { await ask(prompt); } catch (error) { toast(error.message, { type: "error", duration: 8000 }); }
  });
}
