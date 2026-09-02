const languageMeta = {
  en: { locale: "en-IN", direction: "ltr", speech: "en-IN", label: "English" },
  hi: { locale: "hi-IN", direction: "ltr", speech: "hi-IN", label: "हिन्दी" },
  ur: { locale: "ur-IN", direction: "rtl", speech: "ur-PK", label: "اردو" }
};

const fallback = {
  "nav.home": "Home",
  "nav.today": "Today",
  "nav.medications": "Medications",
  "nav.memories": "Memories",

  "nav.people": "Important People",
  "nav.games": "Memory Games",
  "nav.recognition": "Face Recognition",
  "nav.ai": "MemoCare AI",
  "nav.places": "Safe Places",
  "nav.emergency": "Emergency",
  "nav.caregiver": "Caregiver",
  "nav.settings": "Settings",
  "common.add": "Add",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.retry": "Retry",
  "common.close": "Close",
  "common.loading": "Loading",
  "common.unsupported": "This feature is not supported in this browser.",
  "home.greeting": "Good day",
  "home.question": "What do you need help with?",
  "medical.disclaimer": "MemoCare does not prescribe medicine or replace advice from a qualified healthcare professional."
};

let messages = fallback;
let language = "en";

export async function setLanguage(nextLanguage) {
  language = languageMeta[nextLanguage] ? nextLanguage : "en";
  try {
    const response = await fetch(`./locales/${language}.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Language file returned ${response.status}`);
    messages = { ...fallback, ...(await response.json()) };
  } catch (error) {
    console.warn("MemoCare language fallback:", error);
    messages = fallback;
  }
  const meta = languageMeta[language];
  document.documentElement.lang = language;
  document.documentElement.dir = meta.direction;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.dispatchEvent(new CustomEvent("memocare:language", { detail: { language, meta } }));
  return language;
}

export function t(key, variables = {}) {
  let value = messages[key] ?? fallback[key] ?? key;
  for (const [name, replacement] of Object.entries(variables)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

export function getLanguage() {
  return language;
}

export function getLanguageMeta(code = language) {
  return languageMeta[code] ?? languageMeta.en;
}

export function languageOptions() {
  return Object.entries(languageMeta).map(([value, meta]) => ({ value, label: meta.label }));
}
