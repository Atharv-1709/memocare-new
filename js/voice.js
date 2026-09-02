import { getLanguageMeta, t } from "./i18n.js";

const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;

class VoiceService extends EventTarget {
  constructor() {
    super();
    this.recognition = null;
    this.state = Recognition ? "idle" : "unsupported";
    this.transcript = "";
    this.finalTranscript = "";
    this.silenceTimer = null;
    this.target = null;
    this.synthUtterance = null;
    this.speed = 0.9;
    this.voiceURI = "";
  }

  emit(state, detail = {}) {
    this.state = state;
    this.dispatchEvent(new CustomEvent("state", {
      detail: { state, transcript: this.transcript, ...detail }
    }));
  }

  supported() {
    return Boolean(Recognition);
  }

  start({ initialText = "", target = null, silenceTimeout = 7000 } = {}) {
    if (!this.supported()) {
      this.emit("unsupported", { message: t("voice.unsupported") });
      return false;
    }
    this.stop({ preserve: true });
    this.target = target;
    this.transcript = initialText;
    this.finalTranscript = initialText ? `${initialText.trim()} ` : "";

    const recognition = new Recognition();
    this.recognition = recognition;
    recognition.lang = getLanguageMeta().speech;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.emit("listening");
      this.resetSilenceTimer(silenceTimeout);
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript ?? "";
        if (event.results[index].isFinal) {
          const normalized = text.trim();
          if (normalized && !this.finalTranscript.trimEnd().endsWith(normalized)) {
            this.finalTranscript += `${normalized} `;
          }
        } else {
          interim += text;
        }
      }
      this.transcript = `${this.finalTranscript}${interim}`.trim();
      if (this.target) this.target.value = this.transcript;
      this.emit("listening");
      this.resetSilenceTimer(silenceTimeout);
    };
    recognition.onerror = (event) => {
      clearTimeout(this.silenceTimer);
      const denied = ["not-allowed", "service-not-allowed"].includes(event.error);
      this.emit(denied ? "denied" : "error", {
        message: denied ? t("voice.denied") : `Voice recognition error: ${event.error}`
      });
    };
    recognition.onend = () => {
      clearTimeout(this.silenceTimer);
      this.recognition = null;
      if (!["denied", "error", "cancelled"].includes(this.state)) {
        this.emit("completed");
      }
    };
    try {
      recognition.start();
      return true;
    } catch (error) {
      this.emit("error", { message: error.message });
      return false;
    }
  }

  resetSilenceTimer(timeout) {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.stop({ preserve: true }), timeout);
  }

  stop({ preserve = true } = {}) {
    clearTimeout(this.silenceTimer);
    if (!preserve) {
      this.transcript = "";
      this.finalTranscript = "";
      if (this.target) this.target.value = "";
    }
    if (this.recognition) {
      const recognition = this.recognition;
      this.recognition = null;
      try { recognition.stop(); } catch { /* already stopped */ }
    }
    if (this.state === "listening") this.emit("completed");
  }

  cancel() {
    clearTimeout(this.silenceTimer);
    if (this.recognition) {
      try { this.recognition.abort(); } catch { /* already stopped */ }
      this.recognition = null;
    }
    this.emit("cancelled");
  }

  clear() {
    this.transcript = "";
    this.finalTranscript = "";
    if (this.target) this.target.value = "";
    this.emit("idle");
  }

  voices() {
    if (!("speechSynthesis" in window)) return [];
    const languagePrefix = getLanguageMeta().speech.split("-")[0].toLowerCase();
    return speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(languagePrefix));
  }

  speak(text, { rate = this.speed, voiceURI = this.voiceURI } = {}) {
    if (!("speechSynthesis" in window) || !text?.trim()) {
      this.dispatchEvent(new CustomEvent("speech", { detail: { state: "unsupported" } }));
      return false;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getLanguageMeta().speech;
    utterance.rate = Math.min(1.5, Math.max(0.5, Number(rate) || 0.9));
    const selectedVoice = speechSynthesis.getVoices().find((voice) => voice.voiceURI === voiceURI);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.onstart = () => this.dispatchEvent(new CustomEvent("speech", { detail: { state: "speaking" } }));
    utterance.onpause = () => this.dispatchEvent(new CustomEvent("speech", { detail: { state: "paused" } }));
    utterance.onresume = () => this.dispatchEvent(new CustomEvent("speech", { detail: { state: "speaking" } }));
    utterance.onend = () => this.dispatchEvent(new CustomEvent("speech", { detail: { state: "completed" } }));
    utterance.onerror = (event) => this.dispatchEvent(new CustomEvent("speech", { detail: { state: "error", error: event.error } }));
    this.synthUtterance = utterance;
    speechSynthesis.speak(utterance);
    return true;
  }

  pause() { globalThis.speechSynthesis?.pause(); }
  resume() { globalThis.speechSynthesis?.resume(); }
  stopSpeaking() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    this.synthUtterance = null;
  }

  replay() {
    if (!this.synthUtterance) return false;
    return this.speak(this.synthUtterance.text, {
      rate: this.synthUtterance.rate,
      voiceURI: this.synthUtterance.voice?.voiceURI
    });
  }
}

export const voice = new VoiceService();

export function speechControlsMarkup() {
  const voices = voice.voices();
  return `
    <div class="voice-panel">
      <div class="form-grid">
        <div class="field"><label for="speech-speed">Reading speed</label><select id="speech-speed">
          ${[[0.6, "Slow"], [0.8, "Gentle"], [1, "Normal"], [1.2, "Faster"], [1.5, "Fast"]].map(([value, label]) => `<option value="${value}" ${voice.speed === value ? "selected" : ""}>${label}</option>`).join("")}
        </select></div>
        <div class="field"><label for="speech-voice">Voice</label><select id="speech-voice"><option value="">Browser default</option>${voices.map((item) => `<option value="${item.voiceURI}" ${voice.voiceURI === item.voiceURI ? "selected" : ""}>${item.name} · ${item.lang}</option>`).join("")}</select></div>
      </div>
      ${voices.length ? "" : '<p class="help-text">No matching voice is installed for the selected language. MemoCare will try the browser default.</p>'}
      <div class="row-actions">
        <button class="button button-secondary button-small" type="button" data-speech-action="pause">Pause</button>
        <button class="button button-secondary button-small" type="button" data-speech-action="resume">Resume</button>
        <button class="button button-secondary button-small" type="button" data-speech-action="replay">Replay</button>
        <button class="button button-ghost button-small" type="button" data-speech-action="stop">Stop</button>
      </div>
      <div data-speech-status role="status" aria-live="polite">Ready to read aloud.</div>
    </div>
  `;
}

export function voiceInputMarkup({ targetId, label = "Voice dictation" }) {
  return `
    <div class="voice-panel" data-voice-panel="${targetId}">
      <div class="voice-state" role="status" aria-live="polite">
        <span class="voice-dot"></span>
        <span data-voice-status>${label}: ready</span>
      </div>
      <div class="row-actions">
        <button class="button button-secondary button-small" type="button" data-voice-start="${targetId}">${t("home.voice")}</button>
        <button class="button button-ghost button-small" type="button" data-voice-cancel>${t("common.cancel")}</button>
        <button class="button button-ghost button-small" type="button" data-voice-clear="${targetId}">Clear</button>
      </div>
      <small class="help-text">You can edit the text before saving.</small>
    </div>
  `;
}

export function setupVoiceControls() {
  document.addEventListener("click", (event) => {
    const start = event.target.closest("[data-voice-start]");
    if (start) {
      const input = document.getElementById(start.dataset.voiceStart);
      if (input) voice.start({ initialText: input.value, target: input });
    }
    if (event.target.closest("[data-voice-cancel]")) voice.cancel();
    const clear = event.target.closest("[data-voice-clear]");
    if (clear) {
      const input = document.getElementById(clear.dataset.voiceClear);
      if (input) input.value = "";
      voice.clear();
    }
    const speechAction = event.target.closest("[data-speech-action]")?.dataset.speechAction;
    if (speechAction === "pause") voice.pause();
    if (speechAction === "resume") voice.resume();
    if (speechAction === "replay" && !voice.replay()) {
      document.querySelector("[data-speech-status]")?.replaceChildren("Read something first, then replay it.");
    }
    if (speechAction === "stop") voice.stopSpeaking();
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "speech-speed") voice.speed = Number(event.target.value);
    if (event.target.id === "speech-voice") voice.voiceURI = event.target.value;
  });
  voice.addEventListener("state", (event) => {
    const states = document.querySelectorAll("[data-voice-status]");
    const dots = document.querySelectorAll(".voice-dot");
    const labels = {
      idle: "Voice dictation: ready",
      listening: t("voice.listening"),
      completed: "Dictation completed. Review the text before saving.",
      cancelled: "Dictation cancelled. Existing text was kept.",
      unsupported: t("voice.unsupported"),
      denied: t("voice.denied"),
      error: event.detail.message || "Voice recognition failed."
    };
    states.forEach((element) => { element.textContent = labels[event.detail.state] ?? event.detail.state; });
    dots.forEach((dot) => dot.classList.toggle("listening", event.detail.state === "listening"));
  });
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("close", () => voice.stop({ preserve: true }));
  });
  voice.addEventListener("speech", (event) => {
    document.querySelectorAll("[data-speech-status]").forEach((element) => {
      element.textContent = `Read-aloud status: ${event.detail.state}.`;
    });
  });
}
