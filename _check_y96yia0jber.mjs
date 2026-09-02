import { store } from "./storage.js";
import { escapeHtml, formatTime, todayKey, uid } from "./utils.js";
import { getLanguageMeta, t } from "./i18n.js";
import { toast } from "./notifications.js";
import { sync } from "./sync.js";


const statuses = ["taken", "skipped", "missed", "postponed"];

export function medicationForm(medication = {}) {
  const value = (key, fallback = "") => escapeHtml(medication[key] ?? fallback);
  return `
    <div class="form-grid">
      <div class="field">
        <label for="med-name">${t("med.name")}</label>
        <input id="med-name" name="name" maxlength="120" value="${value("name")}" required>
      </div>
      <div class="field">
        <label for="med-dosage">${t("med.dosage")}</label>
        <input id="med-dosage" name="dosage" maxlength="100" value="${value("dosage")}" required>
      </div>
      <div class="field">
        <label for="med-form">${t("med.form")}</label>
        <select id="med-form" name="form">
          ${["tablet", "capsule", "liquid", "injection", "other"].map((item) => `<option value="${item}" ${medication.form === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="med-time">${t("med.time")}</label>
        <input id="med-time" name="time" type="time" value="${value("time", "08:00")}" required>
      </div>
      <div class="field">
        <label for="med-frequency">${t("med.frequency")}</label>
        <select id="med-frequency" name="frequency">
          ${["daily", "weekdays", "weekends", "as-needed"].map((item) => `<option value="${item}" ${medication.frequency === item ? "selected" : ""}>${item.replace("-", " ")}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="med-food">${t("med.food")}</label>
        <select id="med-food" name="foodTiming">
          ${[["any", "Any time"], ["before", "Before food"], ["after", "After food"], ["with", "With food"]].map(([item, label]) => `<option value="${item}" ${medication.foodTiming === item ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="med-start">${t("med.start")}</label>
        <input id="med-start" name="startDate" type="date" value="${value("startDate")}">
      </div>
      <div class="field">
        <label for="med-end">${t("med.end")}</label>
        <input id="med-end" name="endDate" type="date" value="${value("endDate")}">
      </div>
      <div class="field">
        <label for="med-colour">${t("med.colour")}</label>
        <input id="med-colour" name="color" type="color" value="${value("color", "#4f8edc")}">
      </div>
      <div class="field">
        <label for="med-shape">${t("med.shape")}</label>
        <select id="med-shape" name="shape">
          ${["round", "oval", "capsule", "square", "other"].map((item) => `<option value="${item}" ${medication.shape === item ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="med-prescriber">${t("med.prescriber")}</label>
        <input id="med-prescriber" name="prescriber" maxlength="120" value="${value("prescriber")}">
      </div>
      <div class="field field-full">
        <label for="med-instructions">${t("med.instructions")}</label>
        <textarea id="med-instructions" name="instructions" maxlength="500">${value("instructions")}</textarea>
      </div>
      <div class="field field-full">
        <label for="med-notes">${t("med.notes")}</label>
        <textarea id="med-notes" name="notes" maxlength="1000">${value("notes")}</textarea>
      </div>
      <div class="field field-full">
        <label for="med-photo">Medicine or packaging photo (optional)</label>
        <input id="med-photo" name="photoFile" type="file" accept="image/jpeg,image/png,image/webp">
        <input type="hidden" name="existingPhoto" value="${value("photo")}">
        <small>Stored on this device. The photo does not verify pill identity.</small>
      </div>
    </div>
    <input type="hidden" name="id" value="${value("id")}">
    <div class="banner banner-warning">
      <strong>Enter only instructions given by a qualified professional.</strong>
      <p>${t("medical.disclaimer")}</p>
    </div>
  `;
}

export async function formToMedication(form) {
  const values = Object.fromEntries(new FormData(form));
  let photo = values.existingPhoto || "";
  if (form.elements.photoFile?.files?.[0]) {
    photo = await compressImage(form.elements.photoFile.files[0], 800, 0.82);
  }
  return {
    id: values.id || uid("med"),
    name: values.name.trim(),
    dosage: values.dosage.trim(),
    form: values.form,
    time: values.time,
    frequency: values.frequency,
    startDate: values.startDate,
    endDate: values.endDate,
    foodTiming: values.foodTiming,
    instructions: values.instructions.trim(),
    color: values.color,
    shape: values.shape,
    prescriber: values.prescriber.trim(),
    notes: values.notes.trim(),

    photo,
    active: true,
    createdAt: values.id
      ? store.data.medications.find((item) => item.id === values.id)?.createdAt ?? new Date().toISOString()
      : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function duplicateOf(medication) {
  return store.data.medications.find((item) =>
    item.id !== medication.id &&
    item.name.trim().toLowerCase() === medication.name.trim().toLowerCase() &&
    item.dosage.trim().toLowerCase() === medication.dosage.trim().toLowerCase() &&
    item.time === medication.time
  );
}

export function saveMedication(medication) {
  if (!medication.name || !medication.dosage || !medication.time) {
    throw new Error("Medicine name, dosage, and time are required.");
  }
  const duplicate = duplicateOf(medication);
  if (duplicate) throw new Error("A medication with the same name, dosage, and time already exists.");
  store.update((data) => {
    const index = data.medications.findIndex((item) => item.id === medication.id);
    if (index >= 0) data.medications[index] = medication;
    else data.medications.push(medication);
  });
  sync.push(); // fire-and-forget sync to linked room
  return medication;

}

export function dueMedications(date = new Date()) {
  const day = date.getDay();
  const key = todayKey(date);
  return store.data.medications
    .filter((medication) => {
      if (!medication.active) return false;
      if (medication.startDate && medication.startDate > key) return false;
      if (medication.endDate && medication.endDate < key) return false;
      if (medication.frequency === "weekdays" && [0, 6].includes(day)) return false;
      if (medication.frequency === "weekends" && ![0, 6].includes(day)) return false;
      return medication.frequency !== "as-needed";
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function doseStatus(medicationId, date = todayKey()) {
  const recorded = store.data.doseHistory
    .filter((item) => item.medicationId === medicationId && item.date === date)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.status;
  if (recorded) return recorded;
  if (date === todayKey()) {
    const medication = store.data.medications.find((item) => item.id === medicationId);
    const [hour, minute] = String(medication?.time || "").split(":").map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) {
      const dueAt = new Date();
      dueAt.setHours(hour, minute, 0, 0);
      if (Date.now() > dueAt.getTime() + 60 * 60 * 1000) return "missed";
    }
  }
  return "due";
}

export function recordDose(medicationId, status, { source = "manual", note = "" } = {}) {
  if (!statuses.includes(status)) throw new Error("Invalid dose status.");
  const medication = store.data.medications.find((item) => item.id === medicationId);
  if (!medication) throw new Error("Medication not found.");
  const event = {
    id: uid("dose"),
    medicationId,
    medicationName: medication.name,
    status,
    date: todayKey(),
    scheduledTime: medication.time,
    timestamp: new Date().toISOString(),
    source,
    note
  };
  store.update((data) => {
    data.doseHistory.push(event);
  });
  sync.push();
  return event;

}

export function undoDose(eventId) {
  let removed = null;
  store.update((data) => {
    const index = data.doseHistory.findIndex((item) => item.id === eventId);
    if (index < 0) return;
    removed = data.doseHistory[index];
    data.doseHistory.splice(index, 1);
  });
  sync.push();
  return removed;

}

export function adherenceSummary(days = 7) {
  const after = new Date();
  after.setDate(after.getDate() - days + 1);
  const latestByDose = new Map();
  store.data.doseHistory
    .filter((item) => new Date(item.timestamp) >= after)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .forEach((item) => latestByDose.set(`${item.medicationId}:${item.date}`, item));
  const relevant = [...latestByDose.values()];
  const summary = { taken: 0, skipped: 0, missed: 0, postponed: 0, total: relevant.length };
  relevant.forEach((item) => { if (summary[item.status] !== undefined) summary[item.status] += 1; });
  summary.rate = summary.total ? Math.round((summary.taken / summary.total) * 100) : 0;
  return summary;
}

export function medicationCard(medication, { timeline = false } = {}) {
  const status = doseStatus(medication.id);
  return `
    <article class="${timeline ? "timeline-item" : "card medication-card"}" style="--pill-color:${escapeHtml(medication.color)}" data-medication-id="${medication.id}">
      ${!timeline && medication.photo ? `<img src="${escapeHtml(medication.photo)}" alt="" class="medication-photo">` : ""}
      ${timeline ? `<div class="timeline-time">${escapeHtml(formatTime(medication.time, getLanguageMeta().locale))}</div>` : ""}
      <div class="data-row-main">
        <div style="display:flex;align-items:center;gap:.65rem">
          ${timeline ? "" : '<div class="pill-visual" aria-hidden="true"></div>'}
          <div>
            <h3>${escapeHtml(medication.name)}</h3>
            <p>${escapeHtml(medication.dosage)} · ${escapeHtml(medication.foodTiming === "any" ? "Any food timing" : `${medication.foodTiming} food`)}</p>
          </div>
        </div>
        <span class="status-pill status-info">${escapeHtml(status)}</span>
      </div>
      <div class="row-actions">
        ${medication.instructions ? `<button class="button button-small button-secondary" type="button" data-read-text="${escapeHtml(`${medication.name}. ${medication.dosage}. ${medication.instructions}`)}">${t("common.readAloud")}</button>` : ""}
        ${timeline ? `
          <button class="button button-small button-success" type="button" data-dose-status="taken" data-medication-id="${medication.id}">${t("med.taken")}</button>
          <button class="button button-small button-secondary" type="button" data-dose-status="postponed" data-medication-id="${medication.id}">${t("med.later")}</button>
          <button class="button button-small button-ghost" type="button" data-dose-status="skipped" data-medication-id="${medication.id}">${t("med.skip")}</button>
        ` : (store.data.profile.role !== "patient" ? `
          <button class="button button-small button-secondary" type="button" data-med-action="edit" data-medication-id="${medication.id}">${t("common.edit")}</button>
          <button class="button button-small button-ghost" type="button" data-med-action="delete" data-medication-id="${medication.id}">${t("common.delete")}</button>
        ` : "")}
      </div>
    </article>
  `;
}



export function medicationPage() {
  const summary = adherenceSummary();
  const isPatient = store.data.profile.role === "patient";
  return `
    <section class="page-section">
      <div class="page-intro">
        <div><p class="eyebrow">Medication safety</p><h2>${t("medications.title")}</h2><p>Keep the schedule exactly as prescribed. MemoCare never changes a dose.</p></div>
        ${!isPatient ? `<div class="page-actions"><button class="button button-primary" type="button" data-med-action="add">${t("medications.add")}</button></div>` : ""}
      </div>
      <div class="banner banner-warning"><strong>Medical disclaimer</strong><br>${t("medical.disclaimer")}</div>
      ${isPatient ? '<div class="banner"><strong>View only</strong><br>Your caregiver manages your medication list.</div>' : ""}
      <div class="summary-row">
        <div class="summary-item"><strong>${store.data.medications.length}</strong><span>medications</span></div>
        <div class="summary-item"><strong>${summary.rate}%</strong><span>7-day recorded adherence</span></div>
        <div class="summary-item"><strong>${store.data.doseHistory.filter((item) => item.status === "missed").length}</strong><span>recorded missed</span></div>
      </div>
      <div class="data-list">
        ${store.data.medications.length ? store.data.medications.map((item) => medicationCard(item)).join("") : `<div class="empty-state"><div><div class="empty-icon">✚</div><p>${t("medications.empty")}</p>${!isPatient ? `<button class="button button-primary" type="button" data-med-action="add">${t("medications.add")}</button>` : ""}</div></div>`}
      </div>
    </section>
  `;
}


export function todayMedicationTimeline() {
  const due = dueMedications();
  return due.length
    ? `<div class="timeline">${due.map((item) => medicationCard(item, { timeline: true })).join("")}</div>`
    : '<div class="empty-state"><p>No scheduled medication for today.</p></div>';
}

export function handleMedicationAction(target, helpers) {
  const action = target.closest("[data-med-action]")?.dataset.medAction;
  if (action === "add" || action === "edit") {
    const id = target.closest("[data-medication-id]")?.dataset.medicationId;
    const medication = store.data.medications.find((item) => item.id === id) ?? {};
    helpers.openForm({
      eyebrow: "Medication record",
      title: action === "add" ? "Add medication" : "Edit medication",
      body: medicationForm(medication),
      submitLabel: "Save medication",
      async onSubmit(form) {
        saveMedication(await formToMedication(form));
        toast("Medication saved.");
        helpers.refresh();
      }
    });
    return true;
  }
  if (action === "delete") {
    const id = target.closest("[data-medication-id]").dataset.medicationId;
    const medication = store.data.medications.find((item) => item.id === id);
    helpers.confirm({
      title: "Delete medication?",
      message: `${medication?.name ?? "This medication"} will be removed. Existing adherence history is kept.`,
      confirmLabel: "Delete",
      dangerous: true,
      onConfirm() {
        store.update((data) => { data.medications = data.medications.filter((item) => item.id !== id); });
        sync.push();
        toast("Medication deleted.");
        helpers.refresh();

      }
    });
    return true;
  }
  const doseButton = target.closest("[data-dose-status]");
  if (doseButton) {
    const medication = store.data.medications.find((item) => item.id === doseButton.dataset.medicationId);
    const status = doseButton.dataset.doseStatus;
    helpers.confirm({
      title: status === "taken" ? "Confirm medicine was taken" : `Mark dose as ${status}?`,
      message: `${medication.name} · ${medication.dosage} · scheduled ${formatTime(medication.time, getLanguageMeta().locale)}`,
      confirmLabel: status === "taken" ? "Yes, taken" : `Mark ${status}`,
      onConfirm() {
        const event = recordDose(medication.id, status);
        toast(`Dose marked ${status}.`, {
          actionLabel: "Undo",
          onAction: () => {
            undoDose(event.id);
            helpers.refresh();
          }
        });
        helpers.refresh();
      }
    });
    return true;
  }
  return false;
}
