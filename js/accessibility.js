import { store } from "./storage.js";

export function applyAccessibility() {
  const { settings } = store.data;
  const root = document.documentElement;
  const resolvedTheme = settings.theme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : settings.theme;
  root.dataset.theme = resolvedTheme;
  root.dataset.textSize = settings.textSize;
  root.dataset.contrast = settings.highContrast ? "high" : "normal";
  root.dataset.reducedMotion = String(settings.reducedMotion);
  root.dataset.largeButtons = String(settings.largeButtons);
  root.dataset.simple = String(settings.simplified);

  const controls = {
    "text-size-control": settings.textSize,
    "contrast-control": settings.highContrast,
    "motion-control": settings.reducedMotion,
    "large-buttons-control": settings.largeButtons,
    "simple-control": settings.simplified
  };
  for (const [id, value] of Object.entries(controls)) {
    const element = document.getElementById(id);
    if (!element) continue;
    if (element.type === "checkbox") element.checked = Boolean(value);
    else element.value = value;
  }
}

export function setupAccessibility() {
  applyAccessibility();
  const dialog = document.getElementById("accessibility-dialog");
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest('[data-action="open-accessibility"]');
    if (trigger) dialog?.showModal();
  });
  const mapping = {
    "text-size-control": ["textSize", "value"],
    "contrast-control": ["highContrast", "checked"],
    "motion-control": ["reducedMotion", "checked"],
    "large-buttons-control": ["largeButtons", "checked"],
    "simple-control": ["simplified", "checked"]
  };
  for (const [id, [setting, property]] of Object.entries(mapping)) {
    document.getElementById(id)?.addEventListener("change", (event) => {
      store.update((data) => { data.settings[setting] = event.target[property]; });
      applyAccessibility();
      document.dispatchEvent(new CustomEvent("memocare:accessibility-change", { detail: { setting, value: event.target[property] } }));
    });
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (store.data.settings.theme === "system") applyAccessibility();
  });
}
