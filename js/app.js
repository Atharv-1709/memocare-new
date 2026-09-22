import { store } from "./storage.js";
import { routes, currentRoute, navigate, setupRouter } from "./router.js";
import { getLanguageMeta, setLanguage, t, languageOptions } from "./i18n.js";
import { setupAccessibility, applyAccessibility } from "./accessibility.js";
import { auth, setupAuthUI } from "./auth.js";
import { sync } from "./sync.js";
import { setupVoiceControls, speechControlsMarkup, voice } from "./voice.js";
import { toast, requestNotificationPermission } from "./notifications.js";
import {
  medicationPage,
  todayMedicationTimeline,
  dueMedications,
  doseStatus,
  handleMedicationAction,
  recordDose
} from "./medications.js";
import {
  caregiverPage,
  emergencyPage,
  filterMemories,
  handleAssistanceAction,
  memoriesPage,
  peoplePage,
  todayPage
} from "./assistance.js";
import { handleMapAction, maps, placesPage } from "./maps.js";
import { $, escapeHtml, formatDate, formatTime, downloadJson, readFileAsText, uid } from "./utils.js";
import { alarms, deliverCaregiverAlert, emergencyContact, offerCaregiverHandoff } from "./alerts.js";
import { gamesPage, handleGameAction } from "./games.js";
import { faceRecognition, handleFaceAction, recognitionPage } from "./recognition.js";
import { aiPage, handleAiAction, setupAiForm } from "./ai.js";

const appDialog = $("#app-dialog");
const dialogForm = $(".dialog-shell", appDialog);
const dialogTitle = $("#dialog-title");
const dialogEyebrow = $("#dialog-eyebrow");
const dialogBody = $("#dialog-body");
const dialogActions = $("#dialog-actions");
const main = $("#main-content");
let dialogCallbacks = [];
let activeRoute = "home";
let clockTimer = null;
let authUI;

function navMarkup(routeList) {
  return routeList.map((route) => `
    <a class="nav-link" href="#${route.id}" data-route-link="${route.id}" ${route.id === activeRoute ? 'aria-current="page"' : ""}>
      <span class="nav-icon" aria-hidden="true">${route.icon}</span>
      <span>${t(route.titleKey)}</span>
    </a>
  `).join("");
}

function renderNavigation() {
  const role = store.data.profile.role;
  const simpleIds = new Set(["home", "today", "medications", "people", "places", "emergency"]);
  // Routes only caregivers should see
  const caregiverOnlyIds = new Set(["caregiver"]);
  // Routes only patients should see
  const patientOnlyIds = new Set(["games", "recognition", "ai", "memories"]);

  function visibleForRole(route) {
    if (caregiverOnlyIds.has(route.id) && role !== "caregiver") return false;
    if (patientOnlyIds.has(route.id) && role !== "patient") return false;
    return true;
  }

  const desktopRoutes = store.data.settings.simplified
    ? routes.filter((route) => simpleIds.has(route.id))
    : routes.filter(visibleForRole);
  const mobileRoutes = store.data.settings.simplified
    ? routes.filter((route) => ["home", "today", "medications", "people", "emergency"].includes(route.id))
    : routes.filter((route) => route.mobile && visibleForRole(route));
  $("#desktop-nav").innerHTML = navMarkup(desktopRoutes);
  $("#mobile-nav").innerHTML = navMarkup(mobileRoutes);
}

function profileInitials() {
  const isCaregiver = store.data.profile.role === "caregiver";
  const name = isCaregiver
    ? (store.data.profile.caregiverName || (store.data.profile.role === "caregiver" ? store.data.profile.name : "") || "Caregiver")
    : (store.data.profile.patientName || (store.data.profile.role === "patient" ? store.data.profile.name : "") || "Guest");
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "G";
}

function updateProfileUI() {
  $("#profile-initials").textContent = profileInitials();
  $("#local-data-status").textContent = auth.user ? "Signed in" : "On-device data";
}

function updateOrientation() {
  const locale = getLanguageMeta().locale;
  $("#orientation-date").textContent = formatDate(new Date(), locale, { weekday: "long", day: "numeric", month: "long" });
  const liveClock = $("#live-clock");
  if (liveClock) {
    liveClock.textContent = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date());
  }
}

function pageIntro(eyebrow, title, subtitle, actions = "") {
  return `
    <div class="page-intro">
      <div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>
      ${actions ? `<div class="page-actions">${actions}</div>` : ""}
    </div>
  `;
}

function homePage() {
  const locale = getLanguageMeta().locale;
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const due = dueMedications();
  const nextDose = due.find((medication) => doseStatus(medication.id) === "due");

  const isCaregiver = store.data.profile.role === "caregiver";
  const activeName = isCaregiver
    ? (store.data.profile.caregiverName || (store.data.profile.role === "caregiver" ? store.data.profile.name : ""))
    : (store.data.profile.patientName || (store.data.profile.role === "patient" ? store.data.profile.name : ""));

  const people = store.data.people.slice(0, 3);
  if (store.data.settings.simplified) {
    return `
      <section class="page-section simplified-home">
        <article class="card hero-card"><p class="eyebrow">${formatDate(now, locale, { weekday: "long", day: "numeric", month: "long" })}</p><h2>${escapeHtml(greeting)}${activeName ? `, ${escapeHtml(activeName)}` : ""}.</h2><p class="orientation-clock">${new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(now)}</p></article>
        <div class="simple-action-grid">
          <button class="simple-action" type="button" data-route-action="medications"><span aria-hidden="true">✚</span><strong>My medicines</strong></button>
          <button class="simple-action" type="button" data-action="check-in"><span aria-hidden="true">✓</span><strong>I am okay</strong></button>
          <button class="simple-action" type="button" data-route-action="people"><span aria-hidden="true">☺</span><strong>Call family</strong></button>
          <button class="simple-action simple-action-danger" type="button" data-action="open-emergency"><span aria-hidden="true">!</span><strong>Emergency help</strong></button>
          <button class="simple-action" type="button" data-route-action="places"><span aria-hidden="true">⌖</span><strong>Find home</strong></button>
          <button class="simple-action" type="button" data-route-action="games"><span aria-hidden="true">◆</span><strong>Memory games</strong></button>
        </div>
        <article class="card"><div class="card-header"><div><h3>Next medicine</h3></div></div>${nextDose ? todayMedicationTimeline() : '<p>No medicine is waiting right now.</p>'}</article>
        <button class="button button-secondary button-block" type="button" data-action="open-accessibility">Change simplified mode</button>
      </section>`;
  }
  return `
    <section class="page-section">
      <article class="card hero-card">
        <p class="eyebrow">${isCaregiver ? "Caregiver panel · " : "Patient panel · "}${formatDate(now, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        <h2>${escapeHtml(greeting)}${activeName ? `, ${escapeHtml(activeName)}` : ""}.</h2>
        <p>${t("home.subtitle")} Take your time—MemoCare is ready to guide you one step at a time.</p>
        <div class="hero-actions">
          <button class="button button-primary" type="button" data-action="voice-help">${t("home.voice")}</button>
          ${store.data.profile.role !== "caregiver" ? '<button class="button button-secondary" type="button" data-action="check-in">I\'m okay</button>' : ''}
          ${store.data.profile.role === "patient" ? '<button class="button button-secondary" type="button" data-action="test-alarm" title="Test your reminder sound">🔔 Test Alarm</button>' : ''}
          <button class="button button-danger" type="button" data-action="open-emergency">${t("home.emergency")}</button>
        </div>
      </article>
      <div class="summary-row">
        <div class="summary-item"><strong id="live-clock">${new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(now)}</strong><span>current time</span></div>
        <div class="summary-item"><strong>${due.length}</strong><span>doses scheduled</span></div>
        <div class="summary-item"><strong>${store.data.appointments.length}</strong><span>appointments saved</span></div>
      </div>
      <div class="dashboard-grid">
        <article class="card span-7">
          <div class="card-header"><div><h3>Today’s medication</h3><p class="card-subtitle">${nextDose ? `Next: ${nextDose.name}${nextDose.time ? ` at ${formatTime(nextDose.time, locale)}` : ""}` : "No dose is waiting for confirmation."}</p></div><a href="#medications">View all</a></div>
          ${todayMedicationTimeline()}

        </article>
        <article class="card span-5">
          <div class="card-header"><div><h3>${t("home.question")}</h3><p class="card-subtitle">Clear shortcuts with labels.</p></div></div>
          <div class="quick-grid">
            <button class="quick-action" type="button" data-route-action="medications"><span>✚</span><span><strong>${t("nav.medications")}</strong><small>Medication schedule</small></span></button>
            <button class="quick-action" type="button" data-route-action="today"><span>◷</span><span><strong>Today's plan</strong><small>Routines and appointments</small></span></button>
            <button class="quick-action" type="button" data-route-action="places"><span>⌖</span><span><strong>Find home</strong><small>Safe places and directions</small></span></button>
            <button class="quick-action" type="button" data-route-action="people"><span>☺</span><span><strong>Call family</strong><small>Important people</small></span></button>
            ${store.data.profile.role !== "caregiver" ? `
              <button class="quick-action" type="button" data-route-action="games"><span>◆</span><span><strong>Memory games</strong><small>Three working brain games</small></span></button>
              <button class="quick-action" type="button" data-route-action="recognition"><span>◉</span><span><strong>Recognize a person</strong><small>Private camera matching</small></span></button>
              <button class="quick-action" type="button" data-route-action="ai"><span>✦</span><span><strong>Ask MemoCare AI</strong><small>Simple help with Puter.js</small></span></button>
            ` : `
              <button class="quick-action" type="button" data-route-action="caregiver"><span>♢</span><span><strong>Caregiver dashboard</strong><small>Adherence and alerts</small></span></button>
              <button class="quick-action" type="button" data-route-action="settings"><span>⚙</span><span><strong>Settings</strong><small>Profile and preferences</small></span></button>
            `}
          </div>
        </article>
        <article class="card span-7">
          <div class="card-header"><div><h3>Upcoming appointments and reminders</h3></div></div>
          <div class="data-list">
            ${[...store.data.appointments, ...store.data.reminders].slice(0, 5).map((item) => `<div class="data-row"><div><strong>${escapeHtml(item.title || item.text || "Reminder")}</strong><p>${escapeHtml([item.date, item.time].filter(Boolean).join(" · "))}</p></div></div>`).join("") || '<div class="empty-state"><p>No appointments or reminders saved.</p></div>'}
          </div>
        </article>
        <article class="card span-5">
          <div class="card-header"><div><h3>Family quick calls</h3></div><a href="#people">Manage</a></div>
          <div class="data-list">
            ${people.map((person) => `<div class="data-row"><div><strong>${escapeHtml(person.name)}</strong><p>${escapeHtml(person.relationship)}</p></div>${person.phone ? `<a class="button button-primary button-small" href="tel:${escapeHtml(person.phone)}">Call</a>` : ""}</div>`).join("") || '<div class="empty-state"><p>Add an important person for quick access.</p></div>'}
          </div>
        </article>
      </div>
    </section>
  `;
}

function settingsPage() {
  const profile = store.data.profile;
  const settings = store.data.settings;
  return `
    <section class="page-section">
      ${pageIntro("Preferences, data, and safety", t("settings.title"), "Control what stays on this device, what may sync after sign-in, and how MemoCare behaves.")}
      <div class="dashboard-grid">
        <article class="card span-6">
          <div class="card-header"><div><h3>Profile and language</h3><p class="card-subtitle">${auth.user ? `Signed in as ${escapeHtml(auth.user.email || auth.user.phoneNumber || auth.user.uid)}` : "Guest mode · data stays in this browser"}</p></div></div>
          <div class="form-grid">
            <div class="field"><label for="settings-name">Name</label><input id="settings-name" value="${escapeHtml(profile.role === "caregiver" ? (profile.caregiverName || profile.name) : (profile.patientName || (profile.role === "patient" ? profile.name : "")))}"></div>
            <div class="field"><label for="settings-role">${t("auth.role")}</label><select id="settings-role"><option value="patient" ${profile.role === "patient" ? "selected" : ""}>${t("auth.patient")}</option><option value="caregiver" ${profile.role === "caregiver" ? "selected" : ""}>${t("auth.caregiver")}</option></select></div>
            <div class="field"><label for="settings-language">${t("settings.language")}</label><select id="settings-language">${languageOptions().map((item) => `<option value="${item.value}" ${profile.language === item.value ? "selected" : ""}>${item.label}</option>`).join("")}</select></div>
            <div class="field"><label for="settings-theme">${t("settings.theme")}</label><select id="settings-theme"><option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option><option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option><option value="system" ${settings.theme === "system" ? "selected" : ""}>Use device setting</option></select></div>
            <div class="field"><label for="emergency-number">Regional emergency number</label><input id="emergency-number" inputmode="tel" value="${escapeHtml(settings.regionEmergencyNumber)}"><small>Set the correct number for your region. MemoCare does not assume one number worldwide.</small></div>
            <div class="field"><label for="emergency-contact">Emergency contact</label><select id="emergency-contact"><option value="">Not selected</option>${store.data.people.map((person) => `<option value="${person.id}" ${profile.emergencyContactId === person.id ? "selected" : ""}>${escapeHtml(person.name)}</option>`).join("")}</select></div>
            <div class="field field-full"><label for="caregiver-message">Friendly caregiver message</label><input id="caregiver-message" maxlength="500" value="${escapeHtml(profile.caregiverMessage)}"></div>
          </div>
          <button class="button button-primary" type="button" data-settings-action="save-profile">Save profile settings</button>
          <button class="button button-secondary" type="button" data-action="open-auth">${auth.user ? "Account details" : "Set up or use cloud sign-in"}</button>
          ${auth.user ? '<button class="button button-ghost" type="button" data-settings-action="logout">Log out</button>' : ""}
        </article>
        <article class="card span-6">
          <div class="card-header"><div><h3>Accessibility</h3><p class="card-subtitle">These controls take effect immediately.</p></div></div>
          <button class="button button-primary button-block" type="button" data-action="open-accessibility">${t("a11y.open")}</button>
          <div class="settings-stack" style="margin-top:1rem">
            <label class="setting-row"><span><strong>Browser notifications</strong><small>Only after permission.</small></span><button class="button button-secondary button-small" type="button" data-settings-action="notifications">Request permission</button></label>
            <label class="setting-row"><span><strong>Schedule and medicine alarms</strong><small>Beeps while MemoCare is open; notifications may also appear.</small></span><button class="button ${settings.alarmsEnabled ? "button-success" : "button-secondary"} button-small" type="button" data-settings-action="alarms">${settings.alarmsEnabled ? "Alarms on" : "Enable alarms"}</button></label>
            <label class="setting-row"><span><strong>Read this page</strong><small>Uses the selected language when available.</small></span><button class="button button-secondary button-small" type="button" data-action="speak-page">Read aloud</button></label>
          </div>
          ${speechControlsMarkup()}
        </article>
        <article class="card span-12">
          <div class="card-header"><div><h3>${t("settings.privacy")}</h3><p class="card-subtitle">Your health and memory data is private.</p></div></div>
          <table class="privacy-table">
            <thead><tr><th>Information</th><th>Guest mode</th><th>Signed-in mode</th></tr></thead>
            <tbody>
              <tr><td>Medicines, people, memories, safe places</td><td>Stored in this browser</td><td>Still local unless a sync backend is configured</td></tr>
              <tr><td>Passwords</td><td>Never stored</td><td>Handled by the authentication provider</td></tr>
              <tr><td>Location</td><td>Requested only when used</td><td>Not synced by default</td></tr>
              <tr><td>Arduino serial data</td><td>Local browser connection</td><td>Not sent to authentication provider</td></tr>
            </tbody>
          </table>
          <div class="row-actions" style="margin-top:1rem">
            <button class="button button-secondary" type="button" data-settings-action="export">${t("settings.export")}</button>
            <label class="button button-secondary" for="import-file">${t("settings.import")}</label><input id="import-file" type="file" accept="application/json" hidden>
            <a class="button button-secondary" href="./privacy.html">Read privacy notice</a>
          </div>
        </article>
        <article class="card span-12 danger-zone">
          <div class="card-header"><div><h3>Delete all MemoCare data</h3><p class="card-subtitle">This permanently removes the current on-device profile after confirmation.</p></div></div>
          <button class="button button-danger" type="button" data-settings-action="delete-all">${t("settings.deleteAll")}</button>
        </article>
        <article class="card span-12">
          <h3>Authentication setup</h3>
          <p>MemoCare supports genuine Firebase email/password, Google, phone OTP, password reset, session persistence, and logout flows after <code>config/auth-config.js</code> is configured. Admin keys and private credentials must never be placed in frontend files.</p>
          <p>Secure patient/caregiver linking and confirmed remote alerts need a backend authorization model and are intentionally not faked in this static build.</p>
        </article>
        <article class="card span-12">
          <h3>Verified caregiver alert delivery</h3>
          <p>For automatic “I’m lost,” emergency, and safety-zone messages, enter the HTTPS URL of your authorized notification service. The service must send the SMS/push notification and return a successful HTTP response. Leave blank to use the honest SMS/WhatsApp handoff.</p>
          <div class="field"><label for="caregiver-alert-endpoint">Secure alert endpoint (optional)</label><input id="caregiver-alert-endpoint" type="url" placeholder="https://your-service.example/alert" value="${escapeHtml(settings.caregiverAlertEndpoint)}"><small>Do not paste Twilio, Firebase admin, or other secret keys here.</small></div>
          <button class="button button-secondary" type="button" data-settings-action="save-alert-endpoint">Save alert delivery setting</button>
        </article>
      </div>
    </section>
  `;
}

const pageFactories = {
  home: homePage,
  today: todayPage,
  medications: medicationPage,
  dispenser: () => `<section class="page-section"><div class="page-intro"><div><h2>Page removed</h2><p>The pill dispenser feature has been removed.</p></div></div></section>`,
  memories: memoriesPage,
  people: peoplePage,
  games: gamesPage,
  recognition: recognitionPage,
  ai: aiPage,
  places: placesPage,
  emergency: emergencyPage,
  caregiver: caregiverPage,
  settings: settingsPage
};

function renderRoute(route = currentRoute()) {
  if (activeRoute === "places" && route !== "places") maps.cleanup();
  if (activeRoute === "recognition" && route !== "recognition") faceRecognition.stop();
  activeRoute = route;
  const routeMeta = routes.find((item) => item.id === route) ?? routes[0];
  $("#route-title").textContent = t(routeMeta.titleKey);
  document.title = `${t(routeMeta.titleKey)} · MemoCare`;
  main.innerHTML = pageFactories[route]?.() ?? homePage();
  renderNavigation();
  updateOrientation();
  main.focus({ preventScroll: true });
  if (route === "places") maps.init("safe-map");
}

function closeDialog() {
  if (appDialog.open) appDialog.close();
}

function openContent({ eyebrow = "", title, body, actions = [] }) {
  dialogEyebrow.textContent = eyebrow;
  dialogTitle.textContent = title;
  dialogBody.innerHTML = body;
  dialogCallbacks = actions.map((action) => action.onClick);
  dialogActions.innerHTML = actions.map((action, index) => `
    <button class="button ${action.primary ? "button-primary" : action.dangerous ? "button-danger" : "button-secondary"}" type="button" data-dialog-callback="${index}">${escapeHtml(action.label)}</button>
  `).join("");
  if (!appDialog.open) appDialog.showModal();
}

function openForm({ eyebrow = "", title, body, submitLabel = "Save", onSubmit, onRender }) {
  openContent({
    eyebrow,
    title,
    body,
    actions: [
      { label: "Cancel", onClick: closeDialog },
      {
        label: submitLabel,
        primary: true,
        async onClick() {
          try {
            if (!dialogForm.reportValidity()) return;
            await onSubmit(dialogForm);
            closeDialog();
          } catch (error) {
            toast(error.message || "Could not save this information.", { type: "error", duration: 7000 });
          }
        }
      }
    ]
  });
  if (typeof onRender === "function") setTimeout(() => onRender(appDialog), 0);
}

function confirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", dangerous = false, onConfirm, onCancel }) {
  openContent({
    eyebrow: dangerous ? "Please check carefully" : "Confirmation",
    title,
    body: `<p>${escapeHtml(message)}</p>`,
    actions: [
      { label: cancelLabel, onClick: () => { closeDialog(); onCancel?.(); } },
      { label: confirmLabel, primary: !dangerous, dangerous, onClick: async () => { closeDialog(); await onConfirm?.(); } }
    ]
  });
}

const helpers = {
  openForm,
  openContent,
  confirm: confirmDialog,
  closeDialog,
  refresh: () => renderRoute(activeRoute)
};

async function handleSettingsAction(target) {
  const action = target.closest("[data-settings-action]")?.dataset.settingsAction;
  if (!action) return false;
  if (action === "save-profile") {
    const language = $("#settings-language").value;
    const newName = $("#settings-name").value.trim().slice(0, 120);
    const newRole = $("#settings-role").value;
    store.update((data) => {
      data.profile.name = newName;
      data.profile.role = newRole;
      if (newRole === "caregiver") {
        data.profile.caregiverName = newName;
      } else {
        data.profile.patientName = newName;
      }
      data.profile.language = language;
      data.profile.emergencyContactId = $("#emergency-contact").value;
      data.profile.caregiverMessage = $("#caregiver-message").value.trim().slice(0, 500);
      data.settings.theme = $("#settings-theme").value;
      data.settings.regionEmergencyNumber = $("#emergency-number").value.trim().slice(0, 30);
    });
    await setLanguage(language);
    applyAccessibility();
    updateProfileUI();
    toast("Settings saved.");
    renderRoute("settings");
  }
  if (action === "logout") {
    sync.leave();
    await auth.logout();
    updateProfileUI();
    toast("Logged out successfully.");
    renderRoute("home");
  }
  if (action === "notifications") {
    const result = await requestNotificationPermission();
    toast(result.message || `Notification permission: ${result.state}`, { type: result.state === "denied" ? "error" : "info" });
  }
  if (action === "alarms") {
    try {
      const enabled = !store.data.settings.alarmsEnabled;
      if (enabled) {
        await alarms.unlock();
        await requestNotificationPermission();
      }
      store.update((data) => { data.settings.alarmsEnabled = enabled; });
      enabled ? alarms.start() : alarms.stop();
      toast(enabled ? "Alarms enabled. Keep MemoCare open for reliable beeps." : "Alarms turned off.");
      renderRoute("settings");
    } catch (error) { toast(error.message, { type: "error" }); }
  }
  if (action === "save-alert-endpoint") {
    const value = $("#caregiver-alert-endpoint")?.value.trim() || "";
    if (value && !/^https:\/\//i.test(value) && !/^http:\/\/localhost(?::\d+)?(?:\/|$)/i.test(value)) {
      toast("Use a valid HTTPS alert endpoint, or leave it blank.", { type: "error" });
    } else {
      store.update((data) => { data.settings.caregiverAlertEndpoint = value; });
      toast(value ? "Caregiver alert endpoint saved." : "Automatic endpoint removed; message handoff will be used.");
    }
  }
  if (action === "export") downloadJson(store.export(), `memocare-export-${new Date().toISOString().slice(0, 10)}.json`);
  if (action === "delete-all") {
    confirmDialog({
      title: "Delete all on-device MemoCare data?",
      message: "Medicines, people, memories, routines, places, settings, adherence, and device logs will be permanently removed from this browser.",
      confirmLabel: "Delete everything",
      dangerous: true,
      onConfirm() {
        store.reset();
        setLanguage("en").then(() => {
          applyAccessibility();
          updateProfileUI();
          navigate("home");
          renderRoute("home");
        });
      }
    });
  }
  return true;
}

async function handleGlobalClick(event) {
  const target = event.target;
  const callback = target.closest("[data-dialog-callback]");
  if (callback) {
    await dialogCallbacks[Number(callback.dataset.dialogCallback)]?.();
    return;
  }
  const routeLink = target.closest("[data-route-link]")?.dataset.routeLink;
  if (routeLink) {
    event.preventDefault();
    navigate(routeLink);
    return;
  }
  const routeAction = target.closest("[data-route-action]")?.dataset.routeAction;
  if (routeAction) navigate(routeAction);
  if (target.closest('[data-action="open-emergency"]')) {
    navigate("emergency");
    const result = await deliverCaregiverAlert("emergency", maps.position || {});
    store.update((data) => {
      data.emergencyEvents.push({ id: uid("event"), type: "emergency-help-opened", title: "Emergency help opened", timestamp: new Date().toISOString(), delivery: result.status });
    });
    offerCaregiverHandoff(result, { urgent: true });
  }
  if (target.closest('[data-action="test-alarm"]')) {
    try {
      await alarms.unlock();
      if ("Notification" in window && Notification.permission === "default") {
        requestNotificationPermission().catch(() => {});
      }
      await alarms.ring({ id: `test-${Date.now()}`, title: "🔔 Test: Medicine Reminder", body: "This is how your medication reminders will sound and look!" });
    } catch (error) {
      toast("Could not play alarm: " + error.message, { type: "error" });
    }
    return;
  }
  if (target.closest('[data-action="check-in"]')) {
    const result = await deliverCaregiverAlert("okay");
    store.update((data) => {
      data.checkIns.push({ id: uid("checkin"), type: "okay", title: "I’m okay", timestamp: new Date().toISOString(), delivery: result.status });
      data.checkIns = data.checkIns.slice(-100);
    });
    offerCaregiverHandoff(result);
    renderRoute(activeRoute);
  }
  if (target.closest('[data-action="speak-page"]')) voice.speak(main.innerText);
  const read = target.closest("[data-read-text]");
  if (read) voice.speak(read.dataset.readText);
  if (target.closest('[data-action="voice-help"]')) {
    openForm({
      eyebrow: "Voice or typed assistance",
      title: t("home.question"),
      body: `<div class="field"><label for="help-request">Tell MemoCare what you need</label><textarea id="help-request" name="request"></textarea></div><div class="voice-panel"><button class="button button-primary" type="button" data-voice-start="help-request">Start microphone</button><button class="button button-secondary" type="button" data-voice-cancel>Cancel listening</button><button class="button button-ghost" type="button" data-voice-clear="help-request">Clear</button></div>`,
      submitLabel: "Find help",
      onSubmit(form) {
        const request = String(new FormData(form).get("request") || "").toLowerCase();
        if (/med|pill|dose|दवा|دوائی/.test(request)) navigate("medications");
        else if (/home|lost|map|घर|راست/.test(request)) navigate("places");
        else if (/family|person|call|परिवार|فون/.test(request)) navigate("people");
        else if (/routine|today|plan|आज|آج/.test(request)) navigate("today");
        else toast("Try choosing Today, Medications, Important People, or Safe Places.");
      }
    });
  }
  if (target.closest('[data-action="configure-emergency"]')) navigate("settings");
  if (target.closest('[data-action="configure-region-number"]')) navigate("settings");
  if (await handleSettingsAction(target)) return;
  if (handleMedicationAction(target, helpers)) return;
  if (await handleMapAction(target, helpers)) return;
  if (await handleGameAction(target)) return;
  if (await handleFaceAction(target, helpers)) return;
  if (await handleAiAction(target)) return;
  await handleAssistanceAction(target, helpers);
}

function setupInputs() {
  document.addEventListener("input", (event) => {
    if (event.target.id === "memory-search") filterMemories(event.target.value);
  });
  document.addEventListener("change", async (event) => {
    if (event.target.id !== "import-file") return;
    const [file] = event.target.files;
    if (!file) return;
    try {
      const parsed = JSON.parse(await readFileAsText(file));
      const result = store.replace(parsed);
      toast(result.issues.length ? `Data imported with ${result.issues.length} recovery note(s).` : "MemoCare data imported.");
      await setLanguage(store.data.profile.language);
      applyAccessibility();
      renderRoute(activeRoute);
    } catch (error) {
      toast(`Import failed: ${error.message}`, { type: "error", duration: 8000 });
    } finally {
      event.target.value = "";
    }
  });
}

function setupOfflineState() {
  const update = () => {
    $("#offline-banner").hidden = navigator.onLine;
    document.body.classList.toggle("is-offline", !navigator.onLine);
  };
  addEventListener("online", update);
  addEventListener("offline", update);
  update();
}

function setupErrorHandling() {
  addEventListener("error", (event) => {
    console.error("MemoCare runtime error:", event.error || event.message);
    if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      toast("Something went wrong. Your saved data is safe. Try opening this page again.", { type: "error", duration: 8000 });
    }
  });
  addEventListener("unhandledrejection", (event) => {
    console.error("MemoCare rejected operation:", event.reason);
    toast("That action could not finish. Please try again.", { type: "error", duration: 7000 });
  });
  store.addEventListener("error", () => toast("This browser could not save the change. Storage may be full.", { type: "error", duration: 8000 }));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch (error) {
    console.warn("MemoCare service worker registration:", error);
  }
}

async function init() {
  store.load();
  await setLanguage(store.data.profile.language);
  setupAccessibility();
  document.addEventListener("memocare:accessibility-change", (event) => {
    if (event.detail?.setting === "simplified" && event.detail.value) {
      navigate("home");
      return;
    }
    renderRoute(activeRoute);
  });
  setupVoiceControls();
  setupAiForm();
  setupOfflineState();
  setupErrorHandling();
  setupInputs();
  authUI = setupAuthUI(async () => {
    await setLanguage(store.data.profile.language);
    updateProfileUI();
    renderRoute(activeRoute);
  });
  await auth.init();
  if (!store.data.profile.name) authUI.show("start");
  auth.addEventListener("change", updateProfileUI);
  updateProfileUI();
  if (store.data.settings.alarmsEnabled) alarms.start();

  document.addEventListener("click", handleGlobalClick);
  setupRouter(renderRoute);
  updateOrientation();
  clearInterval(clockTimer);
  clockTimer = setInterval(updateOrientation, 30_000);
  if (store.recovery?.length) {
    toast(store.recovery.join(" "), { type: "info", duration: 9000 });
  }
  registerServiceWorker();

  // Initialize alarms and background sound unlock for patient
  setupPatientNotifications();

  // Initialize real-time sync and caregiver alert listeners
  setupCaregiverAlertsListener();
}

/**
 * Connects to Firebase Sync room if linked, listens for emergency alerts from patient,
 * and sets up real-time caregiver full-screen alarm overlay and push notifications.
 */
function setupCaregiverAlertsListener() {
  sync.reconnect().catch((err) => console.warn("Sync reconnect warning:", err));

  sync.addEventListener("caregiver-alert", (event) => {
    const alert = event.detail;
    if (!alert) return;

    // Trigger loud siren beeps, speech TTS and local push notification
    alarms.ringEmergency(alert).catch(() => {});

    // Render full-screen takeover overlay
    showCaregiverEmergencyOverlay(alert);
  });

  sync.addEventListener("remote-update", () => {
    renderRoute(activeRoute);
  });

  // Request browser push notification permission if undecided
  if ("Notification" in window && Notification.permission === "default") {
    const requestOnce = () => {
      requestNotificationPermission().catch(() => {});
      document.removeEventListener("click", requestOnce, true);
    };
    document.addEventListener("click", requestOnce, { once: true, capture: true });
  }
}

function showCaregiverEmergencyOverlay(alert) {
  document.getElementById("caregiver-emergency-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "caregiver-emergency-overlay";
  overlay.className = "caregiver-emergency-overlay";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "emergency-alert-title");

  const contact = emergencyContact();
  const mapsUrl = alert.mapsUrl || (alert.location?.lat != null ? `https://www.google.com/maps?q=${alert.location.lat},${alert.location.lng}` : "");
  const timeStr = alert.createdAt ? formatDate(alert.createdAt, getLanguageMeta().locale, { timeStyle: "short", dateStyle: "short" }) : "Just now";

  overlay.innerHTML = `
    <div class="caregiver-emergency-card">
      <div class="emergency-badge-header">
        <span>🚨</span>
        <span>URGENT CAREGIVER ALERT</span>
      </div>
      <h2 id="emergency-alert-title">${escapeHtml(alert.type === "lost" ? "Patient Is Lost" : (alert.type === "outside-zone" ? "Safety Zone Breach" : "Emergency Assistance Needed"))}</h2>
      <div class="emergency-patient-name">Patient: <strong>${escapeHtml(alert.patientName || "Patient")}</strong></div>
      <div class="emergency-message-box">
        <p><strong>Message:</strong> ${escapeHtml(alert.message || "Immediate assistance requested.")}</p>
        <p style="margin-top:0.4rem;font-size:0.9rem;color:#6b7280"><small>Received at: ${escapeHtml(timeStr)}</small></p>
      </div>
      ${mapsUrl ? `
        <div class="emergency-location-row">
          <a class="button button-primary" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" style="width:100%;font-size:1.05rem">
            📍 Open Live GPS Location in Google Maps
          </a>
        </div>
      ` : ""}
      <div class="emergency-actions-stack">
        <button class="button-acknowledge" type="button" id="emergency-dismiss-btn">
          ✅ Acknowledge & Stop Alarm
        </button>
        ${contact?.phone ? `
          <a class="button button-secondary" href="tel:${escapeHtml(contact.phone)}" style="width:100%">
            📞 Call Emergency Contact (${escapeHtml(contact.name || contact.phone)})
          </a>
        ` : ""}
      </div>
    </div>
  `;

  document.body.append(overlay);

  const dismissBtn = overlay.querySelector("#emergency-dismiss-btn");
  dismissBtn?.addEventListener("click", () => {
    alarms.stopSound();
    sync.acknowledgeAlert(alert.id).catch(() => {});
    overlay.remove();
  }, { once: true });
}

/**
 * For the patient role: ensures the alarm ticker and audio gesture unlocks are
 * ready so medicines, routines, and appointments always sound when due.
 */
async function setupPatientNotifications() {
  if (store.data.profile.role !== "patient") return;

  // Always enable the alarm setting and start the ticker — regardless of AudioContext.
  // Sound will work after the first user interaction (browser requirement).
  if (!store.data.settings.alarmsEnabled) {
    store.update((data) => { data.settings.alarmsEnabled = true; });
  }
  if (!alarms.timer) {
    alarms.start();
  }

  // Silently attempt to unlock audio now so the first alarm rings without
  // needing a second tap. This fails safely if no interaction has happened yet.
  alarms.unlock().catch(() => {
    // AudioContext requires a user gesture — will be unlocked on first click.
    const unlockOnce = () => {
      alarms.unlock().catch(() => {});
      document.removeEventListener("click", unlockOnce, true);
    };
    document.addEventListener("click", unlockOnce, { once: true, capture: true });
  });
}

init();

// Expose for console debugging
globalThis._memoAlarms = alarms;
globalThis._memoStore = store;
globalThis._memoSync = sync;
