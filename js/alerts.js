import { store } from "./storage.js";
import { showLocalNotification, toast } from "./notifications.js";

const FIRED_KEY = "memocare:fired-alerts:v1";

function digitsOnly(phone = "") {
  return String(phone).replace(/[^\d+]/g, "");
}

export function emergencyContact() {
  return store.data.people.find((person) => person.id === store.data.profile.emergencyContactId) || null;
}

export function caregiverMessageUrl(message, channel = "sms") {
  const phone = digitsOnly(emergencyContact()?.phone);
  if (!phone) return "";
  if (channel === "whatsapp") {
    return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
  }
  const separator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "&" : "?";
  return `sms:${phone}${separator}body=${encodeURIComponent(message)}`;
}

function alertMessage(type, details = {}) {
  const name = store.data.profile.name || "The MemoCare patient";
  const location = Number.isFinite(details.lat) && Number.isFinite(details.lng)
    ? ` Location: https://www.google.com/maps?q=${details.lat},${details.lng}`
    : "";
  const messages = {
    okay: `${name} checked in: I am okay.`,
    emergency: `EMERGENCY: ${name} needs help. Please contact them now.${location}`,
    lost: `URGENT: ${name} activated “I’m lost” in MemoCare.${location}`,
    "outside-zone": `SAFETY ALERT: ${name} is outside the saved safety zone.${location}`
  };
  return messages[type] || `${name} sent a MemoCare alert.${location}`;
}

export async function deliverCaregiverAlert(type, details = {}) {
  const contact = emergencyContact();
  const message = alertMessage(type, details);
  const endpoint = store.data.settings.caregiverAlertEndpoint?.trim();
  const result = { type, message, contact, status: "pending", channel: "handoff" };

  if (endpoint) {
    let parsed;
    try {
      parsed = new URL(endpoint);
      if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error();
    } catch {
      return { ...result, status: "failed", error: "The caregiver alert endpoint must be a valid HTTPS URL." };
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const response = await fetch(parsed.href, {
        method: "POST",
        credentials: "omit",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: type,
          patientName: store.data.profile.name || "MemoCare patient",
          caregiverPhone: contact?.phone || "",
          message,
          location: Number.isFinite(details.lat) ? { lat: details.lat, lng: details.lng, accuracy: details.accuracy || null } : null,
          occurredAt: new Date().toISOString()
        })
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`Alert service returned HTTP ${response.status}.`);
      return { ...result, status: "delivered", channel: "endpoint" };
    } catch (error) {
      return { ...result, status: "failed", error: error.name === "AbortError" ? "The caregiver alert service timed out." : (error.message || "The caregiver alert service could not be reached.") };
    }
  }
  if (!contact?.phone) return { ...result, status: "unavailable", error: "Add an emergency contact phone number first." };
  return result;
}

export function offerCaregiverHandoff(result, { urgent = false } = {}) {
  if (result.status === "delivered") {
    toast("Caregiver alert delivered by the configured service.", { type: "success", duration: 7000 });
    return;
  }
  const smsUrl = caregiverMessageUrl(result.message, "sms");
  const whatsappUrl = caregiverMessageUrl(result.message, "whatsapp");
  if (!smsUrl) {
    toast(result.error || "Add an emergency contact phone number first.", { type: "error", duration: 8000 });
    return;
  }
  const reason = result.error ? `${result.error} ` : "";
  toast(`${reason}The alert is not sent yet. Choose Send message to open a pre-addressed message.`, {
    type: urgent ? "error" : "info",
    actionLabel: "Send message",
    onAction: () => {
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      location.href = mobile ? smsUrl : whatsappUrl;
    },
    duration: 15000
  });
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scheduledItems(date = new Date()) {
  const day = todayKey(date);
  const weekday = date.getDay();
  const followsFrequency = (item) => {
    if (item.frequency === "as-needed") return false;
    if (item.frequency === "weekdays") return weekday >= 1 && weekday <= 5;
    if (item.frequency === "weekends") return weekday === 0 || weekday === 6;
    return true;
  };
  const medicationItems = store.data.medications
    .filter((item) => item.active !== false && followsFrequency(item) && (!item.startDate || item.startDate <= day) && (!item.endDate || item.endDate >= day))
    .map((item) => ({ id: `med:${item.id}`, time: item.time, title: `Medicine: ${item.name}`, body: `${item.dosage || "Scheduled dose"}. ${item.instructions || ""}`.trim() }));
  const plans = [...store.data.reminders, ...store.data.appointments]
    .filter((item) => (!item.date || item.date === day) && item.time)
    .map((item) => ({ id: `plan:${item.id}`, time: item.time, title: item.title || "MemoCare reminder", body: item.notes || "It is time for your scheduled activity." }));
  return [...medicationItems, ...plans];
}

class AlarmService extends EventTarget {
  constructor() {
    super();
    this.timer = null;
    this.audioContext = null;
    this.activeNodes = [];
    this.fired = new Set();
    try { this.fired = new Set(JSON.parse(sessionStorage.getItem(FIRED_KEY) || "[]")); } catch { /* fresh session */ }
  }

  async unlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error("Audio alarms are not supported in this browser.");
    this.audioContext ||= new AudioContext();
    await this.audioContext.resume();
  }

  async ring(item) {
    await this.unlock();
    this.stopSound();
    const now = this.audioContext.currentTime;
    [0, 0.45, 0.9, 1.8, 2.25, 2.7].forEach((offset) => {
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = item.id.startsWith("med:") ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.24, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.28);
      oscillator.connect(gain).connect(this.audioContext.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.3);
      this.activeNodes.push(oscillator);
    });
    navigator.vibrate?.([350, 150, 350, 150, 600]);
    showLocalNotification(item.title, { body: item.body, tag: item.id, requireInteraction: true });
    toast(`${item.title} — ${item.body}`, { type: "warning", actionLabel: "Stop alarm", onAction: () => this.stopSound(), duration: 20000 });
    this.dispatchEvent(new CustomEvent("alarm", { detail: item }));
  }

  stopSound() {
    for (const node of this.activeNodes.splice(0)) {
      try { node.stop(); } catch { /* already stopped */ }
    }
  }

  check(date = new Date()) {
    if (!store.data.settings.alarmsEnabled) return;
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    for (const item of scheduledItems(date).filter((candidate) => candidate.time === time)) {
      const key = `${todayKey(date)}:${item.id}:${item.time}`;
      if (this.fired.has(key)) continue;
      this.fired.add(key);
      sessionStorage.setItem(FIRED_KEY, JSON.stringify([...this.fired].slice(-200)));
      this.ring(item).catch((error) => toast(error.message, { type: "error" }));
    }
  }

  start() {
    this.stop();
    this.check();
    this.timer = setInterval(() => this.check(), 15000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.stopSound();
  }
}

export const alarms = new AlarmService();
