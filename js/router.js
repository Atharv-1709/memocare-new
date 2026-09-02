export const routes = [
  { id: "home", icon: "⌂", titleKey: "nav.home", mobile: true },
  { id: "today", icon: "◷", titleKey: "nav.today", mobile: true },
  { id: "medications", icon: "✚", titleKey: "nav.medications", mobile: true },
  { id: "memories", icon: "◇", titleKey: "nav.memories" },
  { id: "people", icon: "☺", titleKey: "nav.people", mobile: true },
  { id: "games", icon: "◆", titleKey: "nav.games" },
  { id: "recognition", icon: "◉", titleKey: "nav.recognition" },
  { id: "ai", icon: "✦", titleKey: "nav.ai" },
  { id: "places", icon: "⌖", titleKey: "nav.places" },
  { id: "emergency", icon: "!", titleKey: "nav.emergency" },
  { id: "caregiver", icon: "♢", titleKey: "nav.caregiver" },
  { id: "settings", icon: "⚙", titleKey: "nav.settings" }
];

export function currentRoute() {
  const id = location.hash.replace(/^#\/?/, "").split("?")[0];
  return routes.some((route) => route.id === id) ? id : "home";
}

export function navigate(id) {
  location.hash = `#${routes.some((route) => route.id === id) ? id : "home"}`;
}

export function setupRouter(onRoute) {
  const run = () => onRoute(currentRoute());
  addEventListener("hashchange", run);
  if (!location.hash) history.replaceState(null, "", "#home");
  run();
}
