import { firebaseConfig } from "../config/auth-config.js";
import { store } from "./storage.js";
import { escapeHtml, isValidPhone, uid } from "./utils.js";
import { toast } from "./notifications.js";
import { languageOptions, t } from "./i18n.js";

const FIREBASE_VERSION = "10.14.1";
const APP_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const AUTH_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;

class AuthService extends EventTarget {
  constructor() {
    super();
    this.mode = firebaseConfig ? "firebase" : "guest";
    this.auth = null;
    this.api = null;
    this.user = null;
    this.confirmationResult = null;
    this.recaptchaVerifier = null;
  }

  async init() {
    if (!firebaseConfig) {
      this.emit();
      return { configured: false };
    }
    try {
      const [{ initializeApp }, api] = await Promise.all([import(APP_URL), import(AUTH_URL)]);
      const app = initializeApp(firebaseConfig);
      this.api = api;
      this.auth = api.getAuth(app);
      api.onAuthStateChanged(this.auth, (user) => {
        this.user = user;
        if (user) {
          store.update((data) => {
            data.profile.id = user.uid;
            data.profile.name = user.displayName || data.profile.name || user.email?.split("@")[0] || "";
            data.profile.authMode = "firebase";
          });
        }
        this.emit();
      });
      return { configured: true };
    } catch (error) {
      console.error("MemoCare authentication setup failed:", error);
      toast("Cloud sign-in could not start. Guest mode remains available.", { type: "error" });
      this.mode = "guest";
      return { configured: false, error };
    }
  }

  emit() {
    this.dispatchEvent(new CustomEvent("change", { detail: this.session() }));
  }

  session() {
    return {
      configured: Boolean(this.auth),
      user: this.user,
      guest: !this.user,
      profile: store.data.profile
    };
  }

  continueAsGuest(profile = {}) {
    store.update((data) => {
      data.profile.name = String(profile.name || data.profile.name || "Guest").slice(0, 120);
      data.profile.role = ["patient", "caregiver"].includes(profile.role) ? profile.role : "patient";
      data.profile.language = ["en", "hi", "ur"].includes(profile.language) ? profile.language : "en";
      data.profile.authMode = "guest";
    });
    this.emit();
  }

  requireProvider() {
    if (!this.auth || !this.api) throw new Error("Cloud authentication is not configured. Continue as Guest or complete Firebase setup.");
  }

  async signUpEmail({ email, password, name, role, language }) {
    this.requireProvider();
    const credential = await this.api.createUserWithEmailAndPassword(this.auth, email, password);
    await this.api.updateProfile(credential.user, { displayName: name });
    store.update((data) => {
      data.profile.name = name;
      data.profile.role = role;
      data.profile.language = language;
      data.profile.id = credential.user.uid;
      data.profile.authMode = "firebase";
    });
    return credential.user;
  }

  async signInEmail(email, password) {
    this.requireProvider();
    return (await this.api.signInWithEmailAndPassword(this.auth, email, password)).user;
  }

  async signInGoogle() {
    this.requireProvider();
    const provider = new this.api.GoogleAuthProvider();
    return (await this.api.signInWithPopup(this.auth, provider)).user;
  }

  async resetPassword(email) {
    this.requireProvider();
    await this.api.sendPasswordResetEmail(this.auth, email);
  }

  async sendPhoneCode(phoneNumber, containerId) {
    this.requireProvider();
    this.recaptchaVerifier?.clear?.();
    this.recaptchaVerifier = new this.api.RecaptchaVerifier(this.auth, containerId, { size: "normal" });
    this.confirmationResult = await this.api.signInWithPhoneNumber(this.auth, phoneNumber, this.recaptchaVerifier);
  }

  async confirmPhoneCode(code) {
    if (!this.confirmationResult) throw new Error("Request a phone code first.");
    return (await this.confirmationResult.confirm(code)).user;
  }

  async logout() {
    if (this.auth) await this.api.signOut(this.auth);
    this.user = null;
    store.update((data) => {
      data.profile.id = "guest";
      data.profile.authMode = "guest";
    });
    this.emit();
  }
}

export const auth = new AuthService();

function profileFields(role = store.data.profile.role) {
  const emergency = store.data.people.find((person) => person.id === store.data.profile.emergencyContactId);
  return `
    <div class="form-grid">
      <div class="field">
        <label for="guest-name">${t("common.name")}</label>
        <input id="guest-name" name="name" autocomplete="name" maxlength="120" value="${escapeHtml(store.data.profile.name)}" required>
      </div>
      <div class="field">
        <label for="guest-role">${t("auth.role")}</label>
        <select id="guest-role" name="role">
          <option value="patient" ${role === "patient" ? "selected" : ""}>${t("auth.patient")}</option>
          <option value="caregiver" ${role === "caregiver" ? "selected" : ""}>${t("auth.caregiver")}</option>
        </select>
      </div>
      <div class="field field-full">
        <label for="guest-language">${t("auth.language")}</label>
        <select id="guest-language" name="language">
          ${languageOptions().map((item) => `<option value="${item.value}" ${store.data.profile.language === item.value ? "selected" : ""}>${item.label}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label for="guest-emergency-name">Emergency contact name</label><input id="guest-emergency-name" maxlength="120" value="${escapeHtml(emergency?.name || "")}"></div>
      <div class="field"><label for="guest-emergency-phone">Emergency contact phone</label><input id="guest-emergency-phone" type="tel" autocomplete="tel" value="${escapeHtml(emergency?.phone || "")}"></div>
      <label class="setting-row field-full"><span><strong>${t("a11y.contrast")}</strong></span><input id="guest-contrast" type="checkbox" role="switch" ${store.data.settings.highContrast ? "checked" : ""}></label>
      <label class="setting-row field-full"><span><strong>${t("a11y.buttons")}</strong></span><input id="guest-large-buttons" type="checkbox" role="switch" ${store.data.settings.largeButtons ? "checked" : ""}></label>
      <label class="setting-row field-full"><span><strong>${t("a11y.motion")}</strong></span><input id="guest-reduced-motion" type="checkbox" role="switch" ${store.data.settings.reducedMotion ? "checked" : ""}></label>
    </div>
  `;
}

function saveOnboardingExtras() {
  const name = document.getElementById("guest-emergency-name")?.value.trim() || "";
  const phone = document.getElementById("guest-emergency-phone")?.value.trim() || "";
  if (!isValidPhone(phone)) throw new Error("Enter a valid emergency contact phone number.");
  store.update((data) => {
    data.settings.highContrast = Boolean(document.getElementById("guest-contrast")?.checked);
    data.settings.largeButtons = Boolean(document.getElementById("guest-large-buttons")?.checked);
    data.settings.reducedMotion = Boolean(document.getElementById("guest-reduced-motion")?.checked);
    if (name && phone) {
      const existing = data.people.find((person) => person.id === data.profile.emergencyContactId);
      if (existing) {
        existing.name = name;
        existing.phone = phone;
      } else {
        const id = uid("person");
        data.people.push({ id, name, phone, relationship: "Emergency contact", photo: "", voiceNote: "", memories: "", identification: "", lastInteraction: "", faceDescriptor: [] });
        data.profile.emergencyContactId = id;
      }
    }
  });
}

export function renderAuth(mode = "start") {
  const configured = Boolean(firebaseConfig);
  if (mode === "start") {
    return `
      <div class="settings-stack">
        <div class="banner">
          <strong>${configured ? "Secure cloud sign-in is ready." : "Guest mode is ready now."}</strong>
          <p>${configured
            ? "Sign in to preserve a session and sync through your configured provider."
            : "Cloud sign-in needs a Firebase project. MemoCare will not store a password on this device."}</p>
        </div>
        <div class="role-panel-grid" aria-label="Choose account type">
          <button class="role-panel role-panel-patient" type="button" data-auth-view="patient">
            <span class="role-panel-icon" aria-hidden="true">♥</span>
            <span><strong>Patient panel</strong><small>Medicines, memories, games, safety and emergency help</small></span>
          </button>
          <button class="role-panel role-panel-caregiver" type="button" data-auth-view="caregiver">
            <span class="role-panel-icon" aria-hidden="true">♢</span>
            <span><strong>Caregiver panel</strong><small>Check-ins, alerts, adherence and linked-patient support</small></span>
          </button>
        </div>
      </div>
    `;
  }
  if (mode === "patient" || mode === "caregiver") {
    const role = mode;
    return `
      <div class="settings-stack">
        <div class="banner"><strong>${role === "patient" ? "Patient access" : "Caregiver access"}</strong><p>${role === "patient" ? "A calmer, simplified panel for daily assistance." : "A separate dashboard for authorized family and caregivers."}</p></div>
        ${profileFields(role)}
        <button class="button button-primary button-block" type="button" data-auth-action="guest">Continue as ${role === "patient" ? "patient" : "caregiver"} guest</button>
        <button class="button button-secondary button-block" type="button" data-auth-view="${role}-login" ${configured ? "" : "disabled"}>${t("auth.email")} ${t("auth.signIn")}</button>
        <button class="button button-secondary button-block" type="button" data-auth-action="google" ${configured ? "" : "disabled"}>${t("auth.google")}</button>
        <button class="button button-secondary button-block" type="button" data-auth-view="phone" ${configured ? "" : "disabled"}>${t("auth.phone")}</button>
        ${configured ? "" : '<a class="button button-ghost button-block" href="#settings">Open authentication setup</a>'}
        <button class="button button-ghost button-block" type="button" data-auth-view="start">${t("common.back")}</button>
      </div>
    `;
  }
  if (/^(patient|caregiver)-(login|signup)$/.test(mode) || mode === "login" || mode === "signup") {
    const [rolePart, actionPart] = mode.includes("-") ? mode.split("-") : [store.data.profile.role, mode];
    const role = rolePart === "caregiver" ? "caregiver" : "patient";
    const signup = actionPart === "signup";
    return `
      <div class="settings-stack">
        <div class="status-pill status-info">${role === "patient" ? "Patient" : "Caregiver"} account</div>
        ${signup ? profileFields(role) : `<input id="guest-role" type="hidden" value="${role}">`}
        <div class="field">
          <label for="auth-email">${t("auth.email")}</label>
          <input id="auth-email" type="email" autocomplete="email" required>
        </div>
        <div class="field">
          <label for="auth-password">${t("auth.password")}</label>
          <div class="input-with-button">
            <input id="auth-password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" required>
            <button class="button button-secondary" type="button" data-auth-action="toggle-password" aria-label="${t("auth.show")} ${t("auth.password")}">${t("auth.show")}</button>
          </div>
        </div>
        <button class="button button-primary button-block" type="button" data-auth-action="${signup ? "signup" : "login"}">${signup ? t("auth.signUp") : t("auth.signIn")}</button>
        ${signup ? "" : `<button class="button button-ghost button-block" type="button" data-auth-action="reset">${t("auth.forgot")}</button>`}
        <button class="button button-ghost button-block" type="button" data-auth-view="${role}-${signup ? "login" : "signup"}">${signup ? "I already have an account" : "Create an account"}</button>
        <button class="button button-ghost button-block" type="button" data-auth-view="${role}">${t("common.back")}</button>
      </div>
    `;
  }
  return `
    <div class="settings-stack">
      <div class="field">
        <label for="auth-phone">Phone number with country code</label>
        <input id="auth-phone" type="tel" autocomplete="tel" placeholder="+91 …">
      </div>
      <div id="recaptcha-container"></div>
      <button class="button button-primary" type="button" data-auth-action="send-code">Send code</button>
      <div class="field">
        <label for="auth-code">Verification code</label>
        <input id="auth-code" inputmode="numeric" autocomplete="one-time-code">
      </div>
      <button class="button button-secondary" type="button" data-auth-action="confirm-code">Verify code</button>
      <button class="button button-ghost" type="button" data-auth-view="start">${t("common.back")}</button>
    </div>
  `;
}

export function setupAuthUI(onProfileChange) {
  const dialog = document.getElementById("auth-dialog");
  const content = document.getElementById("auth-content");
  let selectedRole = store.data.profile.role === "caregiver" ? "caregiver" : "patient";
  const show = (mode = "start") => {
    if (mode === "patient" || mode === "caregiver") selectedRole = mode;
    if (mode.startsWith("patient-")) selectedRole = "patient";
    if (mode.startsWith("caregiver-")) selectedRole = "caregiver";
    content.innerHTML = renderAuth(mode);
    if (!dialog.open) dialog.showModal();
  };

  document.addEventListener("click", async (event) => {
    if (event.target.closest('[data-action="open-auth"]')) show("start");
    const view = event.target.closest("[data-auth-view]");
    if (view) show(view.dataset.authView);
    const action = event.target.closest("[data-auth-action]")?.dataset.authAction;
    if (!action) return;
    try {
      if (action === "guest") {
        saveOnboardingExtras();
        auth.continueAsGuest({
          name: document.getElementById("guest-name")?.value,
          role: document.getElementById("guest-role")?.value,
          language: document.getElementById("guest-language")?.value
        });
        dialog.close();
        onProfileChange?.();
      }
      if (action === "toggle-password") {
        const input = document.getElementById("auth-password");
        input.type = input.type === "password" ? "text" : "password";
        event.target.textContent = input.type === "password" ? t("auth.show") : t("auth.hide");
      }
      if (action === "login") {
        await auth.signInEmail(document.getElementById("auth-email").value, document.getElementById("auth-password").value);
        store.update((data) => { data.profile.role = document.getElementById("guest-role")?.value === "caregiver" ? "caregiver" : "patient"; });
        dialog.close();
      }
      if (action === "signup") {
        saveOnboardingExtras();
        await auth.signUpEmail({
          email: document.getElementById("auth-email").value,
          password: document.getElementById("auth-password").value,
          name: document.getElementById("guest-name").value,
          role: document.getElementById("guest-role").value,
          language: document.getElementById("guest-language").value
        });
        dialog.close();
      }
      if (action === "google") {
        saveOnboardingExtras();
        await auth.signInGoogle();
        store.update((data) => { data.profile.role = document.getElementById("guest-role")?.value === "caregiver" || selectedRole === "caregiver" ? "caregiver" : "patient"; });
        dialog.close();
      }
      if (action === "reset") {
        const email = document.getElementById("auth-email").value;
        if (!email) throw new Error("Enter your email first.");
        await auth.resetPassword(email);
        toast("Password-reset email sent.");
      }
      if (action === "send-code") {
        await auth.sendPhoneCode(document.getElementById("auth-phone").value, "recaptcha-container");
        toast("Verification code sent.");
      }
      if (action === "confirm-code") {
        await auth.confirmPhoneCode(document.getElementById("auth-code").value);
        store.update((data) => { data.profile.role = selectedRole; });
        dialog.close();
      }
    } catch (error) {
      toast(error.message || "Authentication failed.", { type: "error", duration: 7000 });
    }
  });
  return { show };
}
