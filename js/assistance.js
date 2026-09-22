import { store } from "./storage.js";
import { analyzePhotoQuality, compressImage, escapeHtml, formatDate, isValidPhone, todayKey, uid } from "./utils.js";
import { getLanguageMeta, t } from "./i18n.js";
import { voiceInputMarkup } from "./voice.js";
import { maps } from "./maps.js";
import { deliverCaregiverAlert, offerCaregiverHandoff } from "./alerts.js";
import { adherenceSummary, dueMedications, doseStatus } from "./medications.js";
import { toast } from "./notifications.js";
import { sync } from "./sync.js";


function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

export function personForm(person = {}) {
  const value = (key) => escapeHtml(person[key] ?? "");
  const existingPhoto = person.photo ? person.photo : "";
  const photoPreviewMarkup = existingPhoto
    ? `<div id="photo-preview-box" class="photo-preview-box" style="margin-top: 10px;">
         <img id="person-photo-preview" src="${escapeHtml(existingPhoto)}" alt="Photo preview" style="max-width: 140px; aspect-ratio: 1; object-fit: cover; border-radius: 12px; border: 2px solid var(--color-primary, #2b6cb0);">
         <div id="photo-quality-badge" style="margin-top: 6px; font-weight: 500; font-size: 0.85rem; padding: 4px 8px; border-radius: 6px; background: #e6fffa; color: #234e52; border: 1px solid #b2f5ea; display: inline-block;">🟢 Existing photo loaded</div>
       </div>`
    : `<div id="photo-preview-box" class="photo-preview-box" style="display:none; margin-top: 10px;">
         <img id="person-photo-preview" src="" alt="Photo preview" style="max-width: 140px; aspect-ratio: 1; object-fit: cover; border-radius: 12px; border: 2px solid var(--color-primary, #2b6cb0);">
         <div id="photo-quality-badge" style="margin-top: 6px; font-weight: 500; font-size: 0.85rem; padding: 4px 8px; border-radius: 6px; display: inline-block;"></div>
       </div>`;

  return `
    <div class="form-grid">
      <div class="field"><label for="person-name">Name <span style="color: var(--color-danger, #d93838);">*</span></label><input id="person-name" name="name" maxlength="120" value="${value("name")}" required></div>
      <div class="field"><label for="person-relationship">Relationship <span style="color: var(--color-danger, #d93838);">*</span></label><input id="person-relationship" name="relationship" maxlength="100" value="${value("relationship")}" placeholder="e.g. Daughter, Son, Caregiver" required></div>
      <div class="field"><label for="person-phone">Phone number</label><input id="person-phone" name="phone" type="tel" value="${value("phone")}"></div>
      <div class="field"><label for="person-last">Last interaction</label><input id="person-last" name="lastInteraction" type="date" value="${value("lastInteraction")}"></div>
      <div class="field field-full"><label for="person-identification">How to identify them</label><textarea id="person-identification" name="identification">${value("identification")}</textarea>${voiceInputMarkup({ targetId: "person-identification", label: "Dictate identification" })}</div>
      <div class="field field-full"><label for="person-memories">Important memories</label><textarea id="person-memories" name="memories">${value("memories")}</textarea>${voiceInputMarkup({ targetId: "person-memories", label: "Dictate a memory" })}</div>
      
      <!-- Photo Section (Mandatory + Live Camera + Quality Check) -->
      <div class="field field-full" style="background: rgba(0,0,0,0.03); padding: 14px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.08);">
        <label for="person-photo" style="font-weight: 600;">Photo <span style="color: var(--color-danger, #d93838); font-weight: bold;">(Required *)</span></label>
        <p style="font-size: 0.85rem; color: var(--text-muted, #666); margin: 4px 0 10px 0;">Upload a clear face photo or snap one using your device camera.</p>
        
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px;">
          <input id="person-photo" name="photoFile" type="file" accept="image/jpeg,image/png,image/webp" style="flex: 1;">
          <button type="button" class="button button-secondary button-small" data-person-camera-action="start">📷 Use Camera</button>
        </div>

        <div id="person-camera-container" style="display: none; margin: 10px 0; text-align: center; background: #1a202c; padding: 12px; border-radius: 12px;">
          <video id="person-camera-stream" autoplay playsinline style="width: 100%; max-width: 320px; aspect-ratio: 4/3; object-fit: cover; border-radius: 8px; background: #000;"></video>
          <div style="margin-top: 8px; display: flex; gap: 8px; justify-content: center;">
            <button type="button" class="button button-primary button-small" data-person-camera-action="snap">📸 Capture Photo</button>
            <button type="button" class="button button-ghost button-small" data-person-camera-action="stop" style="color: #fff;">Cancel</button>
          </div>
        </div>

        ${photoPreviewMarkup}
        
        <input type="hidden" id="captured-photo-data" name="capturedPhoto" value="">
        <input type="hidden" id="existing-photo-data" name="existingPhoto" value="${existingPhoto}">
      </div>

      <div class="field field-full"><label for="person-voice-note">Voice note (optional)</label><input id="person-voice-note" name="voiceFile" type="file" accept="audio/*" capture><input type="hidden" name="existingVoiceNote" value="${value("voiceNote")}"><small>Record with your device’s recorder or choose an audio file.</small></div>
    </div>
    <input type="hidden" name="id" value="${value("id")}">
  `;
}

export function bindPersonFormEvents(dialogElement) {
  const fileInput = dialogElement.querySelector("#person-photo");
  const capturedInput = dialogElement.querySelector("#captured-photo-data");
  const previewBox = dialogElement.querySelector("#photo-preview-box");
  const previewImg = dialogElement.querySelector("#person-photo-preview");
  const qualityBadge = dialogElement.querySelector("#photo-quality-badge");

  const cameraContainer = dialogElement.querySelector("#person-camera-container");
  const cameraVideo = dialogElement.querySelector("#person-camera-stream");
  let activeStream = null;

  async function processAndEvaluatePhoto(source) {
    try {
      const compressed = await compressImage(source, 800, 0.82);
      capturedInput.value = compressed;
      previewImg.src = compressed;
      previewBox.style.display = "block";

      const quality = analyzePhotoQuality(previewImg);
      if (quality.isFine) {
        qualityBadge.style.background = "#e6fffa";
        qualityBadge.style.color = "#234e52";
        qualityBadge.style.border = "1px solid #b2f5ea";
        qualityBadge.innerHTML = `🟢 ${escapeHtml(quality.message)}`;
      } else {
        qualityBadge.style.background = "#fffaf0";
        qualityBadge.style.color = "#744210";
        qualityBadge.style.border = "1px solid #fbd38d";
        qualityBadge.innerHTML = `🟡 ${escapeHtml(quality.message)} <strong>(Retake recommended)</strong>`;
      }
    } catch (err) {
      toast("Error processing photo: " + err.message, { type: "error" });
    }
  }

  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (file) await processAndEvaluatePhoto(file);
    });
  }

  dialogElement.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-person-camera-action]");
    if (!btn) return;
    const action = btn.dataset.personCameraAction;

    if (action === "start") {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          toast("Camera access is not supported by your browser.", { type: "error" });
          return;
        }
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false
        });
        cameraVideo.srcObject = activeStream;
        cameraContainer.style.display = "block";
      } catch (err) {
        toast("Could not access camera: " + err.message, { type: "error" });
      }
    }

    if (action === "stop") {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
        activeStream = null;
      }
      cameraContainer.style.display = "none";
    }

    if (action === "snap") {
      if (!cameraVideo || !cameraVideo.videoWidth) {
        toast("Camera stream is not ready yet.", { type: "error" });
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = cameraVideo.videoWidth;
      canvas.height = cameraVideo.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(cameraVideo, 0, 0);

      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
        activeStream = null;
      }
      cameraContainer.style.display = "none";

      await processAndEvaluatePhoto(canvas);
      toast("Photo captured and analyzed!");
    }
  });
}


function personCard(person) {
  const isCaregiver = store.data.profile.role === "caregiver";
  return `
    <article class="card person-card">
      <div class="person-avatar">${person.photo ? `<img src="${escapeHtml(person.photo)}" alt="">` : escapeHtml(initials(person.name))}</div>
      <h3>${escapeHtml(person.name)}</h3>
      <p>${escapeHtml(person.relationship || "Important person")}</p>
      ${person.identification ? `<p class="optional-detail">${escapeHtml(person.identification)}</p>` : ""}
      ${person.voiceNote ? `<audio controls preload="metadata" src="${escapeHtml(person.voiceNote)}" aria-label="Voice note from ${escapeHtml(person.name)}"></audio>` : ""}
      <div class="row-actions">
        ${person.phone ? `<a class="button button-primary button-small" href="tel:${escapeHtml(person.phone)}">Call</a>` : ""}
        <button class="button button-secondary button-small" type="button" data-read-text="${escapeHtml(`${person.name}. ${person.relationship}. ${person.identification}. ${person.memories}`)}">Read aloud</button>
        ${isCaregiver ? `
          <button class="button button-secondary button-small" type="button" data-person-action="edit" data-person-id="${person.id}">Edit</button>
          <button class="button button-ghost button-small" type="button" data-person-action="delete" data-person-id="${person.id}">Delete</button>
        ` : ""}
      </div>
    </article>
  `;
}


export function peoplePage() {
  const isCaregiver = store.data.profile.role === "caregiver";
  return `
    <section class="page-section">
      <div class="page-intro">
        <div><p class="eyebrow">Family and familiar faces</p><h2>${t("people.title")}</h2><p>Important people, family members, and caregivers.</p></div>
        ${isCaregiver ? `<div class="page-actions"><button class="button button-primary" type="button" data-person-action="add">Add family member</button><a class="button button-secondary" href="#recognition">Open face recognition</a></div>` : ""}
      </div>
      ${!isCaregiver ? '<div class="banner"><strong>View only</strong><br>Your caregiver manages family members and contacts.</div>' : ""}
      <div class="person-grid">${store.data.people.length ? store.data.people.map(personCard).join("") : `<div class="empty-state"><div><p>No family members have been added.</p>${isCaregiver ? '<button class="button button-primary" type="button" data-person-action="add">Add your first family member</button>' : ""}</div></div>`}</div>
    </section>
  `;
}


export function memoryForm(memory = {}) {
  const value = (key, fallback = "") => escapeHtml(memory[key] ?? fallback);
  return `
    <div class="form-grid">
      <div class="field"><label for="memory-title">Title</label><input id="memory-title" name="title" value="${value("title")}" maxlength="140" required></div>
      <div class="field"><label for="memory-date">Date</label><input id="memory-date" name="date" type="date" value="${value("date", todayKey())}" required></div>
      <div class="field"><label for="memory-mood">Mood</label><select id="memory-mood" name="mood">${["happy", "calm", "grateful", "neutral", "sad", "worried"].map((mood) => `<option value="${mood}" ${memory.mood === mood ? "selected" : ""}>${mood}</option>`).join("")}</select></div>
      <div class="field"><label for="memory-people">People tags</label><input id="memory-people" name="peopleTags" value="${value("peopleTags")}" placeholder="Nazia, Fahad"></div>
      <div class="field"><label for="memory-place">Place tags</label><input id="memory-place" name="placeTags" value="${value("placeTags")}" placeholder="Home, Delhi"></div>
      <div class="field field-full"><label for="memory-text">Memory</label><textarea id="memory-text" name="text" required>${value("text")}</textarea>${voiceInputMarkup({ targetId: "memory-text", label: "Dictate this memory" })}</div>
      <div class="field field-full"><label for="memory-photo">Photo (optional)</label><input id="memory-photo" name="photoFile" type="file" accept="image/jpeg,image/png,image/webp"><input type="hidden" name="existingPhoto" value="${value("photo")}"></div>
      <div class="field field-full"><label for="memory-voice-note">Voice note (optional)</label><input id="memory-voice-note" name="voiceFile" type="file" accept="audio/*" capture><input type="hidden" name="existingVoiceNote" value="${value("voiceNote")}"></div>
    </div>
    <input type="hidden" name="id" value="${value("id")}">
  `;
}

function memoryCard(memory) {
  return `
    <article class="card">
      ${memory.photo ? `<img src="${escapeHtml(memory.photo)}" alt="" style="width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:14px">` : ""}
      <p class="eyebrow">${escapeHtml(formatDate(memory.date, getLanguageMeta().locale, { dateStyle: "medium" }))} · ${escapeHtml(memory.mood)}</p>
      <h3>${escapeHtml(memory.title)}</h3>
      <p>${escapeHtml(memory.text)}</p>
      ${memory.voiceNote ? `<audio controls preload="metadata" src="${escapeHtml(memory.voiceNote)}" aria-label="Voice note for ${escapeHtml(memory.title)}"></audio>` : ""}
      <p class="help-text">${escapeHtml([memory.peopleTags, memory.placeTags].filter(Boolean).join(" · "))}</p>
      <div class="row-actions">
        <button class="button button-secondary button-small" type="button" data-read-text="${escapeHtml(memory.text)}">Read aloud</button>
        <button class="button button-secondary button-small" type="button" data-memory-action="edit" data-memory-id="${memory.id}">Edit</button>
        <button class="button button-ghost button-small" type="button" data-memory-action="delete" data-memory-id="${memory.id}">Delete</button>
      </div>
    </article>
  `;
}

export function memoriesPage() {
  const memories = [...store.data.memories].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `
    <section class="page-section">
      <div class="page-intro">
        <div><p class="eyebrow">Personal journal</p><h2>${t("memories.title")}</h2><p>Save moments with dates, people, places, moods, photos, or dictated text.</p></div>
        <div class="page-actions"><button class="button button-primary" type="button" data-memory-action="add">${t("memories.add")}</button><a class="button button-secondary" href="./games.html">Memory games</a></div>
      </div>
      <div class="card">
        <div class="field"><label for="memory-search">Search memories</label><input id="memory-search" type="search" placeholder="Search titles, people, places, or text"></div>
      </div>
      <div class="memory-grid" id="memory-grid">${memories.length ? memories.map(memoryCard).join("") : '<div class="empty-state"><p>Your memory journal is empty.</p></div>'}</div>
    </section>
  `;
}

export function routineForm(routine = {}) {
  const value = (key, fallback = "") => escapeHtml(routine[key] ?? fallback);
  const steps = Array.isArray(routine.steps) ? routine.steps.join("\n") : "";
  return `
    <div class="form-grid">
      <div class="field"><label for="routine-name">Routine name</label><input id="routine-name" name="name" maxlength="120" value="${value("name")}" required></div>
      <div class="field"><label for="routine-time">Usual time</label><input id="routine-time" name="time" type="time" value="${value("time", "08:00")}"></div>
      <div class="field field-full"><label for="routine-steps">One step per line</label><textarea id="routine-steps" name="steps" required>${escapeHtml(steps)}</textarea>${voiceInputMarkup({ targetId: "routine-steps", label: "Dictate routine steps" })}</div>
      <div class="field field-full"><label for="routine-photo">Guide photo (optional)</label><input id="routine-photo" name="photoFile" type="file" accept="image/jpeg,image/png,image/webp"><input type="hidden" name="existingPhoto" value="${value("photo")}"></div>
    </div>
    <input type="hidden" name="id" value="${value("id")}">
  `;
}

function planForm(item = {}, type = "appointment") {
  const value = (key, fallback = "") => escapeHtml(item[key] ?? fallback);
  return `
    <div class="form-grid">
      <div class="field field-full"><label for="plan-title">Title</label><input id="plan-title" name="title" maxlength="140" value="${value("title")}" required></div>
      <div class="field"><label for="plan-date">Date</label><input id="plan-date" name="date" type="date" value="${value("date", todayKey())}" required></div>
      <div class="field"><label for="plan-time">Time</label><input id="plan-time" name="time" type="time" value="${value("time", "09:00")}" required></div>
      <div class="field field-full"><label for="plan-notes">Notes</label><textarea id="plan-notes" name="notes" maxlength="500">${value("notes")}</textarea></div>
    </div>
    <input type="hidden" name="id" value="${value("id")}">
    <input type="hidden" name="type" value="${escapeHtml(type)}">
  `;
}

function planRows(items, type) {
  const isCaregiver = store.data.profile.role === "caregiver";
  return items.length
    ? items.map((item) => `
      <div class="data-row">
        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.date)} · ${escapeHtml(item.time)}${item.notes ? ` · ${escapeHtml(item.notes)}` : ""}</p></div>
        ${isCaregiver ? `
        <div class="row-actions">
          <button class="button button-secondary button-small" type="button" data-plan-action="edit" data-plan-type="${type}" data-plan-id="${item.id}">Edit</button>
          <button class="button button-ghost button-small" type="button" data-plan-action="delete" data-plan-type="${type}" data-plan-id="${item.id}">Delete</button>
        </div>
        ` : ""}
      </div>`).join("")

    : `<div class="empty-state"><p>No ${type === "appointment" ? "appointments" : "reminders"} saved.</p></div>`;
}

function routineCard(routine) {
  const isCaregiver = store.data.profile.role === "caregiver";
  return `
    <article class="card">
      ${routine.photo ? `<img src="${escapeHtml(routine.photo)}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:14px">` : ""}
      <p class="eyebrow">${escapeHtml(routine.time || "Any time")}</p>
      <h3>${escapeHtml(routine.name || routine.title || "Routine")}</h3>
      <p>${Array.isArray(routine.steps) ? routine.steps.length : 1} step(s)</p>
      <div class="row-actions">
        <button class="button button-primary button-small" type="button" data-routine-action="start" data-routine-id="${routine.id}">Start guide</button>
        ${isCaregiver ? `
          <button class="button button-secondary button-small" type="button" data-routine-action="edit" data-routine-id="${routine.id}">Edit</button>
          <button class="button button-ghost button-small" type="button" data-routine-action="delete" data-routine-id="${routine.id}">Delete</button>
        ` : ""}
      </div>
    </article>
  `;
}



export function todayPage() {
  const routines = store.data.routines;
  const isCaregiver = store.data.profile.role === "caregiver";
  const isPatient = store.data.profile.role === "patient";
  return `
    <section class="page-section">
      <div class="page-intro">
        <div><p class="eyebrow">${formatDate(new Date(), getLanguageMeta().locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p><h2>${t("today.title")}</h2><p>${escapeHtml(store.data.profile.caregiverMessage || "Take your time. One step at a time.")}</p></div>
        ${isCaregiver ? `<div class="page-actions"><button class="button button-primary" type="button" data-routine-action="add">Add routine</button><button class="button button-secondary" type="button" data-plan-action="add" data-plan-type="appointment">Add appointment</button><button class="button button-secondary" type="button" data-plan-action="add" data-plan-type="reminder">Add reminder</button></div>` : ""}
      </div>
      <div class="dashboard-grid">
        <article class="card span-12"><div class="card-header"><div><h3>Today’s plan</h3><p class="card-subtitle">Guided routines with large steps.</p></div><a href="./routine.html">Classic routines</a></div><div class="routine-grid">${routines.length ? routines.map(routineCard).join("") : `<div class="empty-state"><p>${isPatient ? "No routines are scheduled for today." : "Add a routine such as taking medicine or locking the door."}</p></div>`}</div></article>
        <article class="card span-6"><div class="card-header"><div><h3>Appointments</h3></div></div><div class="data-list">${planRows(store.data.appointments, "appointment")}</div></article>
        <article class="card span-6"><div class="card-header"><div><h3>Reminders</h3></div>${store.data.reminders.length ? `<button class="button button-secondary button-small" type="button" data-read-text="${escapeHtml(store.data.reminders.map((item) => `${item.title} at ${item.time}. ${item.notes || ""}`).join(" "))}">${t("common.readAloud")}</button>` : ""}</div><div class="data-list">${planRows(store.data.reminders, "reminder")}</div></article>
      </div>
    </section>
  `;
}

export function emergencyPage() {
  const emergencyPerson = store.data.people.find((person) => person.id === store.data.profile.emergencyContactId);
  const home = store.data.safePlaces.find((place) => place.type === "home") ?? store.data.safePlaces[0];
  const regionNumber = store.data.settings.regionEmergencyNumber;
  return `
    <section class="page-section">
      <div class="page-intro"><div><p class="eyebrow">Urgent support</p><h2>${t("emergency.title")}</h2><p>Call buttons are direct. Location sharing asks permission and clearly shows when active.</p></div></div>
      <div class="emergency-layout">
        <article class="card emergency-primary">
          <h3>${t("emergency.call")}</h3>
          <div class="emergency-call-grid">
            ${emergencyPerson?.phone ? `<a class="button button-danger" href="tel:${escapeHtml(emergencyPerson.phone)}">Call ${escapeHtml(emergencyPerson.name)}</a>` : '<button class="button button-danger" type="button" data-action="configure-emergency">Add emergency contact</button>'}
            ${regionNumber ? `<a class="button button-danger" href="tel:${escapeHtml(regionNumber)}">Call emergency services (${escapeHtml(regionNumber)})</a>` : '<button class="button button-secondary" type="button" data-action="configure-region-number">Set regional emergency number</button>'}
            <button class="button button-secondary" type="button" data-emergency-action="lost">${t("emergency.lost")}</button>
            <button class="button button-secondary" type="button" data-emergency-action="alert">${t("emergency.alert")}</button>
          </div>
          <p class="help-text">With a configured secure alert endpoint, MemoCare records confirmed delivery. Otherwise it opens a prepared message and never falsely labels it sent.</p>
          <button class="button button-secondary" type="button" data-read-text="If you are in immediate danger, call the configured emergency number. Stay where you feel safe and use location sharing only when you choose.">${t("common.readAloud")}</button>
        </article>
        <article class="card medical-card">
          <h3>Medical information card</h3>
          <p><strong>Name:</strong> ${escapeHtml(store.data.profile.patientName || (store.data.profile.role === "patient" ? store.data.profile.name : "") || "Not set")}</p>
          <p><strong>Emergency contact:</strong> ${escapeHtml(emergencyPerson ? `${emergencyPerson.name} · ${emergencyPerson.phone}` : "Not set")}</p>
          <p><strong>Current medicines:</strong> ${escapeHtml(store.data.medications.map((item) => `${item.name} ${item.dosage}`).join(", ") || "None saved")}</p>
          <button class="button button-secondary" type="button" data-read-text="My name is ${escapeHtml(store.data.profile.patientName || (store.data.profile.role === "patient" ? store.data.profile.name : "") || "not set")}. My emergency contact is ${escapeHtml(emergencyPerson?.name || "not set")}.">${t("common.readAloud")}</button>
        </article>
      </div>
      <article class="card" id="lost-panel" hidden>
        <div class="card-header"><div><p class="eyebrow">I’m lost mode</p><h3>Stay where you feel safe</h3></div><span class="status-pill status-warning">Location is not continuous unless enabled</span></div>
        <p id="lost-location">Request your location to show or share it.</p>
        <p><strong>Home:</strong> ${escapeHtml(home?.address || "No home address saved")}</p>
        <div class="row-actions">
          <button class="button button-primary" type="button" data-emergency-action="locate">${t("emergency.locate")}</button>
          <button class="button button-secondary" type="button" data-emergency-action="share-location">${t("emergency.share")}</button>
          ${home ? `<a class="button button-secondary" href="${maps.directionsUrl(home)}" target="_blank" rel="noopener">Directions home</a>` : ""}
          ${emergencyPerson?.phone ? `<a class="button button-danger" href="tel:${escapeHtml(emergencyPerson.phone)}">Call caregiver</a>` : ""}
        </div>
      </article>
      ${syncLinkCardMarkup("patient")}
    </section>
  `;
}

export function caregiverPage() {
  const adherence = adherenceSummary();
  const missedToday = dueMedications().filter((medication) => ["missed", "skipped"].includes(doseStatus(medication.id))).length;
  const permissions = store.data.settings.caregiverPermissions;
  const alerts = store.data.settings.caregiverAlerts;
  const lastCheckIn = store.data.checkIns.at(-1);
  const roomId = store.data.profile.linkedRoomId;
  const syncStatus = sync.status;
  const syncLinked = sync.linked;
  const syncStatusPill = syncLinked
    ? 'status-success'
    : (syncStatus === 'connecting' ? 'status-warning' : 'status-info');
  const patientLabel = store.data.profile.patientName ? ` for <strong>${escapeHtml(store.data.profile.patientName)}</strong>` : "";
  return `
    <section class="page-section">
      <div class="page-intro"><div><p class="eyebrow">Privacy-conscious summary</p><h2>${t("caregiver.title")}</h2><p>The patient controls each visible category. Use the room link below to sync with the patient's device.</p></div></div>
      ${syncLinked
        ? `<div class="banner banner-success"><strong>&#128279; Live link active${patientLabel}</strong><br>Syncing with room <code>${escapeHtml(roomId)}</code>. Medications and dose history are shared in real time.</div>`
        : `<div class="banner banner-warning"><strong>Not linked to a patient</strong><br>${sync.configured ? 'Generate a room code and share it with the patient to begin real-time sync.' : 'Add your Firebase config to <code>config/auth-config.js</code> to enable real-time linking.'}</div>`
      }
      <div class="summary-row">
        <div class="summary-item"><strong>${adherence.rate}%</strong><span>7-day adherence</span></div>
        <div class="summary-item"><strong>${missedToday}</strong><span>missed/skipped today</span></div>
        <div class="summary-item"><strong>${lastCheckIn ? formatDate(lastCheckIn.timestamp, getLanguageMeta().locale, { timeStyle: "short" }) : "None"}</strong><span>last check-in</span></div>
      </div>
      <div class="dashboard-grid">
        <article class="card span-7">
          <div class="card-header"><div><h3>Recent activity</h3></div></div>
          <div class="data-list">
            ${store.data.doseHistory.slice(-8).reverse().map((item) => `<div class="data-row"><div><strong>${escapeHtml(item.medicationName)}</strong><p>${escapeHtml(item.status)} · ${formatDate(item.timestamp, getLanguageMeta().locale, { dateStyle: "medium", timeStyle: "short" })}</p></div></div>`).join("") || '<div class="empty-state"><p>No medication activity recorded.</p></div>'}
          </div>
        </article>
        <article class="card span-5">
          <div class="card-header"><div><h3>What a caregiver may see</h3><p class="card-subtitle">Patient-controlled on this device.</p></div></div>
          <div class="settings-stack">
            ${Object.entries(permissions).map(([key, enabled]) => `<label class="setting-row"><span><strong>${escapeHtml(key)}</strong></span><input type="checkbox" role="switch" data-caregiver-permission="${key}" ${enabled ? "checked" : ""}></label>`).join("")}
          </div>
        </article>
        <article class="card span-6">
          <div class="card-header"><div><h3>Check-ins and emergency events</h3></div></div>
          <div class="data-list">
            ${store.data.checkIns.slice(-3).reverse().map((item) => `<div class="data-row"><div><strong>${escapeHtml(item.title)}</strong><p>${formatDate(item.timestamp, getLanguageMeta().locale, { dateStyle: "medium", timeStyle: "short" })} · not sent</p></div></div>`).join("") || '<p>No check-ins saved.</p>'}
            ${store.data.emergencyEvents.slice(-3).reverse().map((item) => `<div class="data-row"><div><strong>${escapeHtml(item.type)}</strong><p>${formatDate(item.timestamp, getLanguageMeta().locale, { dateStyle: "medium", timeStyle: "short" })} · ${escapeHtml(item.delivery || "not-sent")}</p></div></div>`).join("")}
          </div>
          <p><strong>Safe-place status:</strong> ${permissions.location ? (store.data.settings.continuousLocation ? "Location sharing enabled while Safe Places is open" : "Location visible but continuous sharing is off") : "Hidden by patient preference"}</p>
        </article>
      </div>
      ${syncLinkCardMarkup("caregiver")}
      <div class="dashboard-grid" style="margin-top:1.5rem">
        <article class="card span-12">
          <div class="card-header"><div><h3>Caregiver alert preferences</h3><p class="card-subtitle">Saved preferences only. Delivery requires an authorized notification backend and confirmation receipt.</p></div></div>
          <div class="form-grid">
            <div class="field"><label>Missed-dose grace period (minutes)</label><input type="number" min="5" max="1440" value="${alerts.missedGraceMinutes}" data-caregiver-alert="missedGraceMinutes"></div>
            <div class="field"><label>Multiple missed doses threshold</label><input type="number" min="1" max="20" value="${alerts.multipleMissed}" data-caregiver-alert="multipleMissed"></div>
            <label class="setting-row"><span><strong>Emergency button</strong></span><input type="checkbox" role="switch" data-caregiver-alert="emergency" ${alerts.emergency ? "checked" : ""}></label>
            <label class="setting-row"><span><strong>I'm lost mode</strong></span><input type="checkbox" role="switch" data-caregiver-alert="lost" ${alerts.lost ? "checked" : ""}></label>
            <div class="field"><label>Device offline threshold (minutes)</label><input type="number" min="5" max="10080" value="${alerts.offlineMinutes}" data-caregiver-alert="offlineMinutes"></div>
          </div>
        </article>
      </div>
    </section>
  `;
}

export function syncLinkCardMarkup(role = "caregiver") {
  const roomId = store.data.profile.linkedRoomId;
  const syncStatus = sync.status;
  const syncLinked = sync.linked;
  const syncStatusPill = syncLinked
    ? "status-success"
    : (syncStatus === "connecting" ? "status-warning" : "status-info");
  const isPatient = role === "patient";

  return `
    <article class="card" id="sync-link-card" style="margin-top:1.5rem;border:2px solid color-mix(in srgb, var(--primary) 35%, transparent);background:linear-gradient(145deg, color-mix(in srgb, var(--primary) 8%, var(--surface-strong)), var(--surface));">
      <div class="card-header">
        <div>
          <h3>&#128279; ${isPatient ? "Connect with Caregiver Device" : "Connect with Patient Device"}</h3>
          <p class="card-subtitle">${isPatient ? "Link your device to your caregiver's phone or computer using a 6-character room code." : "Share the same 6-character room code to receive real-time emergency alarms and live GPS alerts."}</p>
        </div>
        <span class="status-pill ${syncStatusPill}">${escapeHtml(sync.statusLabel())}</span>
      </div>
      ${sync.configured ? `
        ${syncLinked ? `
          <div class="form-grid">
            <div class="field field-full">
              <label><strong>Active Room Code:</strong></label>
              <div style="display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-top:.25rem">
                <input id="sync-room-display" type="text" value="${escapeHtml(roomId)}" readonly style="font-family:monospace;font-size:1.35rem;font-weight:800;letter-spacing:.2em;max-width:11rem;text-align:center;padding:.5rem;border-radius:12px;background:var(--surface-strong);border:2px solid var(--primary)">
                <button class="button button-secondary button-small" type="button" data-sync-action="copy-code">&#128203; Copy Code</button>
              </div>
              <p style="margin-top:.6rem;color:var(--success);font-weight:600">&#10004; Linked and active. Emergency alarms and "I'm lost" alerts will immediately notify the ${isPatient ? "caregiver" : "patient"}.</p>
            </div>
          </div>
          <div class="row-actions" style="margin-top:.5rem">
            <button class="button button-ghost button-small" type="button" data-sync-action="leave">Disconnect Room</button>
          </div>
        ` : `
          <div class="form-grid" style="margin-top:.5rem">
            <div class="field field-full">
              <label for="sync-join-input" style="font-size:1.05rem;font-weight:700">Enter 6-Character Room Code</label>
              <p style="margin:0 0 .5rem;color:var(--text-muted);font-size:.9rem">Enter an existing room code to join, or generate a new one to share with the other device.</p>
              <div style="display:flex;flex-wrap:wrap;gap:.65rem;align-items:center">
                <input id="sync-join-input" type="text" maxlength="6" placeholder="e.g. ABC123" style="text-transform:uppercase;letter-spacing:.2em;font-family:monospace;font-size:1.25rem;font-weight:800;max-width:12rem;text-align:center;padding:.65rem;border-radius:14px">
                <button class="button button-primary" type="button" data-sync-action="join">&#128279; Join Room</button>
                <button class="button button-secondary" type="button" data-sync-action="create">&#10010; Generate New Code</button>
              </div>
            </div>
          </div>
        `}
      ` : `
        <p>Firebase is not configured. Real-time linking requires Firebase configuration in <code>config/auth-config.js</code>.</p>
      `}
    </article>
  `;
}

async function fileAsDataUrl(file, maxBytes = 1_500_000, label = "File") {
  if (!file) return "";
  if (file.size > maxBytes) throw new Error(`${label} is too large. Choose a file under ${Math.round(maxBytes / 1_000_000)} MB.`);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`${label} could not be read.`));
    reader.readAsDataURL(file);
  });
}

export async function handleAssistanceAction(target, helpers) {
  const planAction = target.closest("[data-plan-action]")?.dataset.planAction;
  if (planAction) {
    const control = target.closest("[data-plan-action]");
    const type = control.dataset.planType === "reminder" ? "reminder" : "appointment";
    const collection = type === "reminder" ? "reminders" : "appointments";
    const id = control.dataset.planId;
    const item = store.data[collection].find((candidate) => candidate.id === id) ?? {};
    if (planAction === "add" || planAction === "edit") {
      helpers.openForm({
        eyebrow: type === "reminder" ? "Helpful prompt" : "Calendar item",
        title: `${planAction === "add" ? "Add" : "Edit"} ${type}`,
        body: planForm(item, type),
        submitLabel: `Save ${type}`,
        onSubmit(form) {
          const values = Object.fromEntries(new FormData(form));
          const saved = {
            id: values.id || uid(type),
            title: values.title.trim(),
            date: values.date,
            time: values.time,
            notes: values.notes.trim()
          };
          store.update((data) => {
            const index = data[collection].findIndex((candidate) => candidate.id === saved.id);
            if (index >= 0) data[collection][index] = saved;
            else data[collection].push(saved);
          });
          toast(`${type === "reminder" ? "Reminder" : "Appointment"} saved.`);
          helpers.refresh();
        }
      });
      return true;
    }
    if (planAction === "delete") {
      helpers.confirm({
        title: `Delete ${type}?`,
        message: item.title || "",
        confirmLabel: "Delete",
        dangerous: true,
        onConfirm() {
          store.update((data) => { data[collection] = data[collection].filter((candidate) => candidate.id !== id); });
          helpers.refresh();
        }
      });
      return true;
    }
  }

  const personAction = target.closest("[data-person-action]")?.dataset.personAction;
  if (personAction === "add" || personAction === "edit") {
    const id = target.closest("[data-person-id]")?.dataset.personId;
    const person = store.data.people.find((item) => item.id === id) ?? {};
    helpers.openForm({
      eyebrow: "Important person",
      title: personAction === "add" ? "Add important person" : "Edit important person",
      body: personForm(person),
      submitLabel: "Save person",
      onRender(dialog) {
        bindPersonFormEvents(dialog);
      },
      async onSubmit(form) {
        const values = Object.fromEntries(new FormData(form));
        if (!values.name?.trim()) throw new Error("Name is required.");
        if (!values.relationship?.trim()) throw new Error("Relationship is required.");
        if (!isValidPhone(values.phone)) throw new Error("Enter a valid phone number.");

        let photo = values.capturedPhoto || "";
        if (!photo && form.elements.photoFile?.files?.[0]) {
          photo = await compressImage(form.elements.photoFile.files[0], 800, 0.82);
        }
        if (!photo) photo = values.existingPhoto || "";

        if (!photo) {
          throw new Error("A photo is required. Please upload a clear photo or take one using your camera.");
        }

        const voiceFile = await fileAsDataUrl(form.elements.voiceFile?.files?.[0], 2_500_000, "Voice note");
        const voiceNote = voiceFile || values.existingVoiceNote || "";

        const personId = values.id || person.id || uid("person");
        const saved = {
          id: personId,
          name: values.name.trim(),
          relationship: values.relationship.trim(),
          phone: values.phone.trim(),
          lastInteraction: values.lastInteraction || "",
          identification: values.identification.trim(),
          memories: values.memories.trim(),
          photo,
          voiceNote,
          faceDescriptor: person.faceDescriptor || []
        };

        store.update((data) => {
          const index = data.people.findIndex((item) => item.id === saved.id);
          if (index >= 0) data.people[index] = saved;
          else data.people.push(saved);
        });

        sync.push();
        toast("Important person saved.");
        helpers.refresh();
      }
    });
    return true;
  }
  if (personAction === "delete") {
    const id = target.closest("[data-person-id]").dataset.personId;
    helpers.confirm({
      title: "Delete this person?",
      message: store.data.people.find((item) => item.id === id)?.name || "",
      confirmLabel: "Delete",
      dangerous: true,
      onConfirm() {
        store.update((data) => { data.people = data.people.filter((item) => item.id !== id); });
        helpers.refresh();
      }
    });
    return true;
  }

  const memoryAction = target.closest("[data-memory-action]")?.dataset.memoryAction;
  if (memoryAction === "add" || memoryAction === "edit") {
    const id = target.closest("[data-memory-id]")?.dataset.memoryId;
    const memory = store.data.memories.find((item) => item.id === id) ?? {};
    helpers.openForm({
      eyebrow: "Memory journal",
      title: memoryAction === "add" ? "Add memory" : "Edit memory",
      body: memoryForm(memory),
      submitLabel: "Save memory",
      async onSubmit(form) {
        const values = Object.fromEntries(new FormData(form));
        let photo = values.existingPhoto || "";
        if (form.elements.photoFile?.files?.[0]) {
          photo = await compressImage(form.elements.photoFile.files[0], 800, 0.82);
        }
        const voiceFile = await fileAsDataUrl(form.elements.voiceFile?.files?.[0], 2_500_000, "Voice note");
        const voiceNote = voiceFile || values.existingVoiceNote || "";
        const saved = {
          id: values.id || uid("memory"),
          title: values.title.trim(),
          date: values.date,
          mood: values.mood,
          peopleTags: values.peopleTags.trim(),
          placeTags: values.placeTags.trim(),
          text: values.text.trim(),
          photo,
          voiceNote,
          createdAt: memory.createdAt || new Date().toISOString()
        };
        store.update((data) => {
          const index = data.memories.findIndex((item) => item.id === saved.id);
          if (index >= 0) data.memories[index] = saved;
          else data.memories.push(saved);
        });
        helpers.refresh();
      }
    });
    return true;
  }
  if (memoryAction === "delete") {
    const id = target.closest("[data-memory-id]").dataset.memoryId;
    helpers.confirm({
      title: "Delete this memory?",
      message: "This removes the text and photo stored on this device.",
      confirmLabel: "Delete",
      dangerous: true,
      onConfirm() {
        store.update((data) => { data.memories = data.memories.filter((item) => item.id !== id); });
        helpers.refresh();
      }
    });
    return true;
  }

  const routineAction = target.closest("[data-routine-action]")?.dataset.routineAction;
  if (routineAction === "add" || routineAction === "edit") {
    const id = target.closest("[data-routine-id]")?.dataset.routineId;
    const routine = store.data.routines.find((item) => item.id === id) ?? {};
    helpers.openForm({
      eyebrow: "Step-by-step routine",
      title: routineAction === "add" ? "Add routine" : "Edit routine",
      body: routineForm(routine),
      submitLabel: "Save routine",
      async onSubmit(form) {
        const values = Object.fromEntries(new FormData(form));
        const photo = await fileAsDataUrl(form.elements.photoFile.files[0], 1_500_000, "Photo") || values.existingPhoto;
        const saved = {
          id: values.id || uid("routine"),
          name: values.name.trim(),
          title: values.name.trim(),
          time: values.time,
          steps: values.steps.split(/\r?\n/).map((step) => step.trim()).filter(Boolean),
          photo,
          completedAt: routine.completedAt || null
        };
        if (!saved.steps.length) throw new Error("Add at least one routine step.");
        store.update((data) => {
          const index = data.routines.findIndex((item) => item.id === saved.id);
          if (index >= 0) data.routines[index] = saved;
          else data.routines.push(saved);
        });
        helpers.refresh();
      }
    });
    return true;
  }
  if (routineAction === "start") {
    const routine = store.data.routines.find((item) => item.id === target.closest("[data-routine-id]").dataset.routineId);
    let index = 0;
    const showStep = () => helpers.openContent({
      eyebrow: `${routine.name} · step ${index + 1} of ${routine.steps.length}`,
      title: routine.steps[index],
      body: `<div class="hero-card card">${routine.photo ? `<img src="${escapeHtml(routine.photo)}" alt="" style="width:100%;max-height:20rem;object-fit:cover;border-radius:16px">` : ""}<h2>${escapeHtml(routine.steps[index])}</h2><button class="button button-secondary" type="button" data-read-text="${escapeHtml(routine.steps[index])}">${t("common.readAloud")}</button></div>`,
      actions: [
        index ? { label: "Back", onClick: () => { index -= 1; showStep(); } } : null,
        index < routine.steps.length - 1
          ? { label: "Next step", primary: true, onClick: () => { index += 1; showStep(); } }
          : { label: "Complete routine", primary: true, onClick: () => {
            store.update((data) => {
              const item = data.routines.find((candidate) => candidate.id === routine.id);
              if (item) item.completedAt = new Date().toISOString();
            });
            helpers.closeDialog();
            helpers.refresh();
            toast("Routine completed.");
          } }
      ].filter(Boolean)
    });
    showStep();
    return true;
  }
  if (routineAction === "delete") {
    const id = target.closest("[data-routine-id]").dataset.routineId;
    helpers.confirm({
      title: "Delete routine?",
      message: "The guided steps will be removed.",
      confirmLabel: "Delete",
      dangerous: true,
      onConfirm() {
        store.update((data) => { data.routines = data.routines.filter((item) => item.id !== id); });
        helpers.refresh();
      }
    });
    return true;
  }

  const emergencyAction = target.closest("[data-emergency-action]")?.dataset.emergencyAction;
  if (emergencyAction === "lost") {
    const panel = document.getElementById("lost-panel");
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth" });
    let position = null;
    try {
      position = maps.position || await maps.requestPosition();
      const label = document.getElementById("lost-location");
      if (label) label.textContent = `Current coordinates: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} (accuracy about ${Math.round(position.accuracy)} m)`;
    } catch (error) {
      toast(`${error.message} The caregiver alert will be prepared without location.`, { type: "error", duration: 7000 });
    }
    const result = await deliverCaregiverAlert("lost", position || {});
    store.update((data) => {
      data.emergencyEvents.push({ id: uid("event"), type: "lost-mode", title: "I’m lost activated", timestamp: new Date().toISOString(), delivery: result.status });
    });
    offerCaregiverHandoff(result, { urgent: true });
    return true;
  }
  if (emergencyAction === "locate") {
    try {
      const position = await maps.requestPosition();
      const label = document.getElementById("lost-location");
      if (label) label.textContent = `Current coordinates: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)} (accuracy about ${Math.round(position.accuracy)} m)`;
    } catch (error) { toast(error.message, { type: "error" }); }
    return true;
  }
  if (emergencyAction === "share-location") {
    try {
      if (!maps.position) await maps.requestPosition();
      await maps.shareLocation();
    } catch (error) { toast(error.message, { type: "error" }); }
    return true;
  }
  if (emergencyAction === "alert") {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      toast("Audible alerts are unavailable in this browser.", { type: "error" });
      return true;
    }
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.18;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      context.close();
    }, 3000);
    navigator.vibrate?.([400, 200, 400, 200, 400]);

    let position = maps.position;
    if (!position) {
      try {
        position = await maps.requestPosition();
      } catch {
        /* proceed without location */
      }
    }

    const result = await deliverCaregiverAlert("emergency", position || {});
    store.update((data) => {
      data.emergencyEvents.push({ id: uid("event"), type: "audible-alert", title: "Emergency alarm", timestamp: new Date().toISOString(), delivery: result.status });
    });
    offerCaregiverHandoff(result, { urgent: true });
    return true;
  }

  const permission = target.closest("[data-caregiver-permission]");
  if (permission) {
    const key = permission.dataset.caregiverPermission;
    store.update((data) => { data.settings.caregiverPermissions[key] = permission.checked; });
    toast("Caregiver visibility preference saved.");
    return true;
  }
  const alertControl = target.closest("[data-caregiver-alert]");
  if (alertControl) {
    const key = alertControl.dataset.caregiverAlert;
    store.update((data) => {
      data.settings.caregiverAlerts[key] = alertControl.type === "checkbox" ? alertControl.checked : Number(alertControl.value);
    });
    toast("Caregiver alert preference saved. No alert has been sent.");
    return true;
  }

  // ── Sync / room-code actions ──────────────────────────────────────────────
  const syncAction = target.closest("[data-sync-action]")?.dataset.syncAction;
  if (syncAction === "create") {
    try {
      const roomId = await sync.createRoom();
      toast(`Room created! Code: ${roomId}. Share it with the patient.`, { duration: 10000 });
      helpers.refresh();
    } catch (error) {
      toast(error.message || "Could not create a sync room.", { type: "error", duration: 8000 });
    }
    return true;
  }
  if (syncAction === "join") {
    const input = document.getElementById("sync-join-input");
    const code = (input?.value || "").trim().toUpperCase();
    if (!code) { toast("Enter a 6-character room code first.", { type: "error" }); return true; }
    try {
      await sync.joinRoom(code);
      toast(`Joined room ${code}! You are now linked.`, { duration: 8000 });
      helpers.refresh();
    } catch (error) {
      toast(error.message || "Could not join that room.", { type: "error", duration: 8000 });
    }
    return true;
  }
  if (syncAction === "copy-code") {
    const code = sync.roomId || store.data.profile.linkedRoomId || "";
    if (!code) { toast("No room code to copy.", { type: "error" }); return true; }
    try {
      await navigator.clipboard.writeText(code);
      toast(`Room code ${code} copied to clipboard.`);
    } catch { toast(`Room code: ${code}`); }
    return true;
  }
  if (syncAction === "test-alert") {
    let position = maps.position;
    if (!position) {
      try { position = await maps.requestPosition(); } catch { /* ignore */ }
    }
    const result = await deliverCaregiverAlert("emergency", position || {});
    toast("🚨 Test emergency alert sent to linked room!", { duration: 5000 });
    return true;
  }
  if (syncAction === "leave") {
    helpers.confirm({
      title: "Disconnect from sync room?",
      message: "Your local data stays, but live updates from the other device will stop.",
      confirmLabel: "Disconnect",
      dangerous: true,
      onConfirm() { sync.leave(); helpers.refresh(); }
    });
    return true;
  }

  return false;
}


export function filterMemories(query) {
  const normalized = query.trim().toLowerCase();
  document.querySelectorAll("#memory-grid > article").forEach((card, index) => {
    const memory = [...store.data.memories].sort((a, b) => String(b.date).localeCompare(String(a.date)))[index];
    const haystack = [memory?.title, memory?.text, memory?.peopleTags, memory?.placeTags, memory?.mood].join(" ").toLowerCase();
    card.hidden = Boolean(normalized && !haystack.includes(normalized));
  });
}
