import { store } from "./storage.js";
import { showLocalNotification, toast } from "./notifications.js";
import { voice } from "./voice.js";
import { sync } from "./sync.js";

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
  const name = store.data.profile.patientName || (store.data.profile.role === "patient" ? store.data.profile.name : "") || "The MemoCare patient";
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
  const result = { type, message, contact, status: "pending", channel: "handoff" };

  // 1. First priority: Real-time Firebase alert if linked
  if (sync.configured && (sync.linked || store.data.profile.linkedRoomId)) {
    try {
      const patientName = store.data.profile.patientName || (store.data.profile.role === "patient" ? store.data.profile.name : "") || "MemoCare Patient";
      const alertId = await sync.sendAlert({
        type,
        patientName,
        message,
        location: Number.isFinite(details.lat) && Number.isFinite(details.lng)
          ? { lat: details.lat, lng: details.lng, accuracy: details.accuracy || null }
          : null
      });
      return { ...result, status: "delivered", channel: "firebase", alertId };
    } catch (err) {
      console.warn("Firebase live alert dispatch failed, falling back:", err);
    }
  }

  // 2. Second priority: Custom caregiver HTTPS webhook if configured
  const endpoint = store.data.settings.caregiverAlertEndpoint?.trim();
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
          patientName: store.data.profile.patientName || (store.data.profile.role === "patient" ? store.data.profile.name : "") || "MemoCare patient",
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

  // 3. Fallback: SMS/WhatsApp handoff
  if (!contact?.phone) return { ...result, status: "unavailable", error: "Add an emergency contact phone number first." };
  return result;
}

export function offerCaregiverHandoff(result, { urgent = false } = {}) {
  if (result.status === "delivered") {
    if (result.channel === "firebase") {
      toast("🚨 Emergency alert delivered instantly to caregiver in real time!", { type: "success", duration: 8000 });
    } else {
      toast("Caregiver alert delivered by the configured service.", { type: "success", duration: 7000 });
    }
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
      const target = mobile ? smsUrl : whatsappUrl;
      if (mobile) {
        location.href = target;
      } else {
        window.open(target, "_blank", "noopener,noreferrer");
      }
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
  const routineItems = (store.data.routines || [])
    .filter((item) => item.time)
    .map((item) => ({ id: `routine:${item.id}`, time: item.time, title: `Routine: ${item.name || "Scheduled routine"}`, body: `${Array.isArray(item.steps) ? item.steps.length : 1} step(s). Start your guided routine now.` }));
  return [...medicationItems, ...plans, ...routineItems];
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
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // --- Aggressive multi-frequency beep bursts ---
    const freqs = item.id.startsWith("med:") ? [880, 1100, 1320]
      : item.id.startsWith("routine:") ? [740, 932, 1109]
      : [660, 830, 990];
    const peakGain = 0.7;
    const beepOn = 0.18;
    const beepOff = 0.10;
    const burstGap = 1.6;
    const beepsPerBurst = 5;
    const totalBursts = 3;

    for (let burst = 0; burst < totalBursts; burst++) {
      const burstStart = burst * (beepsPerBurst * (beepOn + beepOff) + burstGap);
      for (let i = 0; i < beepsPerBurst; i++) {
        const t0 = now + burstStart + i * (beepOn + beepOff);
        for (const freq of freqs) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.01);
          gain.gain.setValueAtTime(peakGain, t0 + beepOn - 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + beepOn);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + beepOn + 0.01);
          this.activeNodes.push(osc);
        }
      }
    }

    // --- Aggressive vibration: long repeating bursts ---
    const vibePattern = [];
    for (let i = 0; i < 12; i++) vibePattern.push(400, 100);
    navigator.vibrate?.(vibePattern);

    // --- TTS announcement after first burst ---
    const announcement = `Attention! ${item.title}. ${item.body}`;
    setTimeout(() => {
      if (this.activeNodes.length > 0) {
        voice.speak(announcement, { rate: 0.85 });
      }
    }, 1800);

    showLocalNotification(item.title, { body: item.body, tag: item.id, requireInteraction: true });
    toast(`🔔 ${item.title} — ${item.body}`, {
      type: "warning",
      actionLabel: "Stop alarm",
      onAction: () => { this.stopSound(); voice.stopSpeaking(); navigator.vibrate?.(0); },
      duration: 30000
    });
    this.dispatchEvent(new CustomEvent("alarm", { detail: item }));
  }

  async ringEmergency(alert) {
    try { await this.unlock(); } catch { /* Ignore autoplay block until click */ }
    this.stopSound();

    if (this.audioContext) {
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      const peakGain = 0.85;
      const beeps = 8;
      const onTime = 0.22;
      const offTime = 0.08;

      for (let i = 0; i < beeps; i++) {
        const t0 = now + i * (onTime + offTime);
        for (const freq of [980, 1318, 1760]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freq, t0);
          osc.frequency.linearRampToValueAtTime(freq * 1.25, t0 + onTime);
          gain.gain.setValueAtTime(0.001, t0);
          gain.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.02);
          gain.gain.setValueAtTime(peakGain, t0 + onTime - 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t0 + onTime);
          osc.connect(gain).connect(ctx.destination);
          osc.start(t0);
          osc.stop(t0 + onTime + 0.01);
          this.activeNodes.push(osc);
        }
      }
    }

    navigator.vibrate?.([600, 150, 600, 150, 600, 150, 600, 150]);

    const name = alert.patientName || "Your patient";
    const announcement = `EMERGENCY ALERT! ${name} needs immediate assistance! ${alert.message || ""}`;
    setTimeout(() => {
      voice.speak(announcement, { rate: 0.9, pitch: 1.1 });
    }, 1200);

    const notifTitle = `🚨 EMERGENCY ALERT: ${name}`;
    const notifBody = alert.message || `${name} triggered an urgent emergency alert.`;
    showLocalNotification(notifTitle, {
      body: notifBody,
      tag: alert.id || "emergency-alert",
      requireInteraction: true
    });
  }

  stopSound() {
    for (const node of this.activeNodes.splice(0)) {
      try { node.stop(); } catch { /* already stopped */ }
    }
    voice.stopSpeaking();
    navigator.vibrate?.(0);
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
