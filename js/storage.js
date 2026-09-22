import { uid } from "./utils.js";

export const STORAGE_KEY = "memocare:data:v2";
export const SCHEMA_VERSION = 3;

const defaultData = () => ({
  schemaVersion: SCHEMA_VERSION,
  profile: {
    id: "guest",
    name: "",
    patientName: "",
    caregiverName: "",
    role: "patient",
    language: "en",
    linkedRoomId: "",
    emergencyContactId: "",
    caregiverMessage: "",
    authMode: "guest"

  },
  settings: {
    theme: "light",
    textSize: "normal",
    highContrast: false,
    reducedMotion: false,
    largeButtons: false,
    simplified: false,
    alarmsEnabled: false,
    continuousLocation: false,
    safetyRadiusMeters: 500,
    caregiverAlertEndpoint: "",
    regionEmergencyNumber: "",
    caregiverPermissions: {
      adherence: true,
      reminders: true,
      emergency: true,
      location: false
    },

    caregiverAlerts: {
      missedGraceMinutes: 60,
      multipleMissed: 2,
      emergency: true,
      lost: true,
      offlineMinutes: 60
    }

  },
  medications: [],
  doseHistory: [],
  appointments: [],
  reminders: [],
  people: [],
  memories: [],
  routines: [],
  safePlaces: [],
  emergencyEvents: [],
  caregiverLinks: [],
  checkIns: [],
  syncQueue: [],
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recoveredAt: null
  }
});

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function string(value, fallback = "", max = 5000) {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function boolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function number(value, fallback = 0, min = -Infinity, max = Infinity) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeMedication(item) {
  if (!isObject(item)) return null;
  const name = string(item.name || item.medicineName, "", 120).trim();
  if (!name) return null;
  return {
    id: string(item.id, uid("med"), 100),
    name,
    dosage: string(item.dosage || item.dose, "", 100),
    form: ["tablet", "capsule", "liquid", "injection", "other"].includes(item.form) ? item.form : "tablet",
    time: string(item.time, "08:00", 10),
    frequency: string(item.frequency, "daily", 80),
    startDate: string(item.startDate, "", 10),
    endDate: string(item.endDate, "", 10),
    foodTiming: ["before", "after", "with", "any"].includes(item.foodTiming) ? item.foodTiming : "any",
    instructions: string(item.instructions || item.purpose, "", 500),
    color: /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : "#4f8edc",
    shape: string(item.shape, "round", 40),
    photo: string(item.photo, "", 1_500_000),
    active: item.active !== false,
    createdAt: string(item.createdAt, new Date().toISOString(), 40),
    updatedAt: string(item.updatedAt, new Date().toISOString(), 40)

  };
}

function sanitizePerson(item) {
  if (!isObject(item)) return null;
  const name = string(item.name, "", 120).trim();
  if (!name) return null;
  return {
    id: string(item.id, uid("person"), 100),
    name,
    relationship: string(item.relationship || item.relation, "", 100),
    photo: string(item.photo || item.image, "", 4_000_000),
    phone: string(item.phone, "", 40),
    voiceNote: string(item.voiceNote || item.voice, "", 4_000_000),
    memories: string(item.memories || item.memory, "", 3000),
    identification: string(item.identification, "", 1000),
    lastInteraction: string(item.lastInteraction, "", 40),
    faceDescriptor: array(item.faceDescriptor || item.descriptor).slice(0, 128).map(Number)
  };
}

function sanitizeGeneric(item, prefix) {
  if (!isObject(item)) return null;
  return {
    id: string(item.id, uid(prefix), 100),
    type: string(item.type, "", 80),
    title: string(item.title || item.text, "", 140),
    date: string(item.date, "", 10),
    time: string(item.time, "", 10),
    notes: string(item.notes || item.note, "", 1000),
    timestamp: string(item.timestamp, new Date().toISOString(), 40),
    delivery: string(item.delivery, "", 40)
  };
}

function sanitizePlan(item, prefix) {
  if (!isObject(item)) return null;
  const title = string(item.title || item.text, "", 140).trim();
  if (!title) return null;
  return {
    id: string(item.id, uid(prefix), 100),
    title,
    date: string(item.date, "", 10),
    time: string(item.time, "", 10),
    notes: string(item.notes, "", 500)
  };
}

function sanitizeMemory(item) {
  if (!isObject(item)) return null;
  const title = string(item.title, "", 140).trim();
  const text = string(item.text, "", 5000).trim();
  if (!title || !text) return null;
  return {
    id: string(item.id, uid("memory"), 100),
    title,
    date: string(item.date, "", 10),
    mood: string(item.mood, "neutral", 40),
    peopleTags: string(item.peopleTags, "", 500),
    placeTags: string(item.placeTags, "", 500),
    text,
    photo: string(item.photo, "", 1_500_000),
    voiceNote: string(item.voiceNote, "", 2_500_000),
    createdAt: string(item.createdAt, new Date().toISOString(), 40)
  };
}

function sanitizeRoutine(item) {
  if (!isObject(item)) return null;
  const name = string(item.name || item.title, "", 120).trim();
  if (!name) return null;
  const rawSteps = Array.isArray(item.steps) ? item.steps : item.tasks;
  const steps = array(rawSteps).slice(0, 50).map((step) => string(isObject(step) ? step.title || step.name : step, "", 500).trim()).filter(Boolean);
  return {
    id: string(item.id, uid("routine"), 100),
    name,
    title: name,
    time: string(item.time, "08:00", 10),
    steps: steps.length ? steps : [name],
    photo: string(item.photo, "", 1_500_000),
    completedAt: string(item.completedAt, "", 40) || null
  };
}

function sanitizePlace(item) {
  if (!isObject(item)) return null;
  const name = string(item.name, "", 120).trim();
  const address = string(item.address, "", 500).trim();
  if (!name || !address) return null;
  const lat = item.lat === null || item.lat === "" ? null : number(item.lat, NaN, -90, 90);
  const lng = item.lng === null || item.lng === "" ? null : number(item.lng, NaN, -180, 180);
  return {
    id: string(item.id, uid("place"), 100),
    name,
    type: string(item.type, "other", 60),
    address,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    phone: string(item.phone, "", 40),
    notes: string(item.notes, "", 500)
  };
}

function sanitizeDose(item) {
  if (!isObject(item) || !["taken", "skipped", "missed", "postponed"].includes(item.status)) return null;
  return {
    id: string(item.id, uid("dose"), 100),
    medicationId: string(item.medicationId, "", 100),
    medicationName: string(item.medicationName, "", 120),
    status: item.status,
    date: string(item.date, "", 10),
    scheduledTime: string(item.scheduledTime, "", 10),
    timestamp: string(item.timestamp, new Date().toISOString(), 40),
    source: string(item.source, "manual", 40),
    note: string(item.note, "", 500)
  };
}

export function validateData(input) {
  const base = defaultData();
  if (!isObject(input)) return { data: base, recovered: true, issues: ["Stored data was not an object."] };

  const issues = [];
  const data = structuredClone(base);

  const profile = isObject(input.profile) ? input.profile : {};
  data.profile = {
    ...base.profile,
    id: string(profile.id, base.profile.id, 100),
    name: string(profile.name, "", 120),
    patientName: string(profile.patientName, "", 120),
    caregiverName: string(profile.caregiverName, "", 120),
    role: ["patient", "caregiver"].includes(profile.role) ? profile.role : "patient",
    language: ["en", "hi", "ur"].includes(profile.language) ? profile.language : "en",
    linkedRoomId: string(profile.linkedRoomId, "", 100),
    emergencyContactId: string(profile.emergencyContactId, "", 100),
    caregiverMessage: string(profile.caregiverMessage, "", 500),
    authMode: ["guest", "firebase"].includes(profile.authMode) ? profile.authMode : "guest"
  };

  const settings = isObject(input.settings) ? input.settings : {};
  data.settings = {
    ...base.settings,
    theme: ["light", "dark", "system"].includes(settings.theme) ? settings.theme : "light",
    textSize: ["normal", "large", "xlarge"].includes(settings.textSize) ? settings.textSize : "normal",
    highContrast: boolean(settings.highContrast),
    reducedMotion: boolean(settings.reducedMotion),
    largeButtons: boolean(settings.largeButtons),
    simplified: boolean(settings.simplified),
    alarmsEnabled: boolean(settings.alarmsEnabled),
    continuousLocation: boolean(settings.continuousLocation),
    safetyRadiusMeters: number(settings.safetyRadiusMeters, 500, 50, 10000),
    caregiverAlertEndpoint: string(settings.caregiverAlertEndpoint, "", 1000),
    regionEmergencyNumber: string(settings.regionEmergencyNumber, "", 30),
    caregiverPermissions: {
      ...base.settings.caregiverPermissions,
      ...(isObject(settings.caregiverPermissions) ? settings.caregiverPermissions : {})
    },
      caregiverAlerts: {
        ...base.settings.caregiverAlerts,
        missedGraceMinutes: number(settings.caregiverAlerts?.missedGraceMinutes, 60, 5, 1440),
        multipleMissed: number(settings.caregiverAlerts?.multipleMissed, 2, 1, 20),
        emergency: boolean(settings.caregiverAlerts?.emergency, true),
        lost: boolean(settings.caregiverAlerts?.lost, true),
        offlineMinutes: number(settings.caregiverAlerts?.offlineMinutes, 60, 5, 10080)
      }

  };

  data.medications = array(input.medications).map(sanitizeMedication).filter(Boolean);
  data.people = array(input.people).map(sanitizePerson).filter(Boolean);

  data.doseHistory = array(input.doseHistory).map(sanitizeDose).filter(Boolean);
  data.appointments = array(input.appointments).map((item) => sanitizePlan(item, "appointment")).filter(Boolean);
  data.reminders = array(input.reminders).map((item) => sanitizePlan(item, "reminder")).filter(Boolean);
  data.memories = array(input.memories).map(sanitizeMemory).filter(Boolean);
  data.routines = array(input.routines).map(sanitizeRoutine).filter(Boolean);
  data.safePlaces = array(input.safePlaces).map(sanitizePlace).filter(Boolean);
  for (const key of ["emergencyEvents", "caregiverLinks", "checkIns", "syncQueue"]) {
    data[key] = array(input[key]).map((item) => sanitizeGeneric(item, key.slice(0, -1) || "item")).filter(Boolean);
  }

  data.meta = {
    ...base.meta,
    ...(isObject(input.meta) ? input.meta : {}),
    updatedAt: new Date().toISOString()
  };

  if (input.schemaVersion !== SCHEMA_VERSION) {
    issues.push(`Data was migrated from schema ${input.schemaVersion ?? "unknown"} to ${SCHEMA_VERSION}.`);
  }
  return { data, recovered: issues.length > 0, issues };
}

function migrateLegacy() {
  const data = defaultData();
  const issues = [];
  try {
    const medicines = JSON.parse(localStorage.getItem("medicines") || "[]");
    data.medications = array(medicines).map(sanitizeMedication).filter(Boolean);
    if (data.medications.length) issues.push("Imported legacy medicines.");
  } catch {
    issues.push("Skipped corrupted legacy medicine data.");
  }
  try {
    const people = JSON.parse(localStorage.getItem("memocare_family") || "[]");
    data.people = array(people).map(sanitizePerson).filter(Boolean);
    if (data.people.length) issues.push("Imported legacy family contacts.");
  } catch {
    issues.push("Skipped corrupted legacy family data.");
  }
  try {
    const routines = JSON.parse(localStorage.getItem("customRoutines") || "[]");
    data.routines = array(routines).map(sanitizeRoutine).filter(Boolean);
    if (data.routines.length) issues.push("Imported legacy routines.");
  } catch {
    issues.push("Skipped corrupted legacy routine data.");
  }
  return { data, issues };
}

class MemoStore extends EventTarget {
  constructor() {
    super();
    this.data = defaultData();
    this.recovery = null;
  }

  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = migrateLegacy();
      this.data = legacy.data;
      this.recovery = legacy.issues.length ? legacy.issues : null;
      this.save({ silent: true });
      return this.data;
    }
    try {
      const result = validateData(JSON.parse(raw));
      this.data = result.data;
      this.recovery = result.recovered ? result.issues : null;
      if (result.recovered) {
        this.data.meta.recoveredAt = new Date().toISOString();
        this.save({ silent: true });
      }
    } catch (error) {
      localStorage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw.slice(0, 2_000_000));
      this.data = defaultData();
      this.data.meta.recoveredAt = new Date().toISOString();
      this.recovery = ["Corrupted saved data was isolated and MemoCare started with a safe empty profile."];
      this.save({ silent: true });
      console.error("MemoCare storage recovery:", error);
    }
    return this.data;
  }

  save({ silent = false } = {}) {
    this.data.meta.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      if (!silent) this.dispatchEvent(new CustomEvent("change", { detail: this.data }));
      return true;
    } catch (error) {
      this.dispatchEvent(new CustomEvent("error", { detail: error }));
      return false;
    }
  }

  update(mutator) {
    mutator(this.data);
    this.save();
    return this.data;
  }

  replace(input) {
    const result = validateData(input);
    this.data = result.data;
    this.recovery = result.issues;
    this.save();
    return result;
  }

  reset() {
    this.data = defaultData();
    this.recovery = null;
    this.save();
  }

  export() {
    return {
      exportedAt: new Date().toISOString(),
      app: "MemoCare",
      ...structuredClone(this.data)
    };
  }
}

export const store = new MemoStore();
