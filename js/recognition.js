import { store } from "./storage.js";
import { escapeHtml } from "./utils.js";
import { toast } from "./notifications.js";

const FACE_API_URL = "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js";
const MODEL_URL = "./models";

class FaceRecognitionService {
  constructor() {
    this.stream = null;
    this.running = false;
    this.frame = 0;
    this.lastRun = 0;
    this.matcher = null;
    this.loading = null;
  }

  status(message, type = "info") {
    const element = document.getElementById("face-status");
    if (element) {
      element.textContent = message;
      element.dataset.type = type;
    }
  }

  async load() {
    if (globalThis.faceapi) return globalThis.faceapi;
    if (this.loading) return this.loading;
    this.loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = FACE_API_URL;
      script.crossOrigin = "anonymous";
      script.onload = () => resolve(globalThis.faceapi);
      script.onerror = () => {
        script.remove();
        this.loading = null;
        reject(new Error("Face recognition library could not load. Check the internet connection and retry."));
      };
      document.head.append(script);
    });
    return this.loading;
  }

  async loadModels() {
    const faceapi = await this.load();
    this.status("Loading face-recognition models…");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    return faceapi;
  }

  async descriptorFromPhoto(photo) {
    const faceapi = await this.loadModels();
    const image = await faceapi.fetchImage(photo);
    const result = await faceapi.detectSingleFace(image, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 }))
      .withFaceLandmarks().withFaceDescriptor();
    if (!result) throw new Error("No clear face was found in that saved photo. Use a front-facing, well-lit photo.");
    return Array.from(result.descriptor);
  }

  async enroll(personId) {
    const person = store.data.people.find((item) => item.id === personId);
    if (!person?.photo) throw new Error("Add a clear photo to this person first.");
    this.status(`Learning ${person.name} from the saved photo…`);
    const descriptor = await this.descriptorFromPhoto(person.photo);
    store.update((data) => {
      const saved = data.people.find((item) => item.id === personId);
      if (saved) saved.faceDescriptor = descriptor;
    });
    this.status(`${person.name} is ready for recognition.`, "success");
    return person;
  }

  buildMatcher(faceapi) {
    const enrolled = store.data.people.filter((person) => person.faceDescriptor?.length === 128);
    if (!enrolled.length) throw new Error("Enroll at least one important person with a clear photo first.");
    this.matcher = new faceapi.FaceMatcher(enrolled.map((person) => new faceapi.LabeledFaceDescriptors(person.id, [new Float32Array(person.faceDescriptor)])), 0.55);
  }

  async start() {
    this.stop();
    const faceapi = await this.loadModels();
    this.buildMatcher(faceapi);
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported in this browser.");
    this.status("Requesting camera permission…");
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 540 } }, audio: false });
    const video = document.getElementById("face-video");
    if (!video) { this.stop(); return; }
    video.srcObject = this.stream;
    await video.play();
    this.running = true;
    this.status("Camera ready. Look toward the camera.", "success");
    this.loop();
  }

  async loop(timestamp = 0) {
    if (!this.running) return;
    this.frame = requestAnimationFrame((next) => this.loop(next));
    if (timestamp - this.lastRun < 500) return;
    this.lastRun = timestamp;
    const video = document.getElementById("face-video");
    const canvas = document.getElementById("face-overlay");
    if (!video || !canvas || video.readyState < 2) return;
    try {
      const faceapi = globalThis.faceapi;
      const result = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks().withFaceDescriptor();
      const width = video.clientWidth || video.videoWidth;
      const height = video.clientHeight || video.videoHeight;
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, width, height);
      if (!result) {
        this.status("No face detected. Move into the frame and improve the lighting.", "warning");
        return;
      }
      const resized = faceapi.resizeResults(result, { width, height });
      faceapi.draw.drawDetections(canvas, resized);
      faceapi.draw.drawFaceLandmarks(canvas, resized);
      const match = this.matcher.findBestMatch(result.descriptor);
      const person = store.data.people.find((item) => item.id === match.label);
      const output = document.getElementById("face-result");
      if (!person || match.label === "unknown") {
        this.status("Face detected, but this person is not enrolled.", "warning");
        if (output) output.innerHTML = '<div class="empty-state"><p>Unknown person</p></div>';
        return;
      }
      const confidence = Math.max(0, Math.round((1 - match.distance) * 100));
      this.status(`Recognized ${person.name} (${confidence}% match).`, "success");
      if (output) output.innerHTML = `<article class="recognized-person"><div class="person-avatar">${person.photo ? `<img src="${escapeHtml(person.photo)}" alt="">` : escapeHtml(person.name.slice(0, 2))}</div><div><h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(person.relationship || "Important person")}</p><p>${escapeHtml(person.memories || person.identification || "")}</p>${person.phone ? `<a class="button button-primary button-small" href="tel:${escapeHtml(person.phone)}">Call ${escapeHtml(person.name)}</a>` : ""}</div></article>`;
    } catch (error) {
      console.error("MemoCare face recognition:", error);
      this.status("Recognition paused after a camera error. Stop and retry.", "error");
    }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const track of this.stream?.getTracks?.() || []) track.stop();
    this.stream = null;
    const video = document.getElementById("face-video");
    if (video) video.srcObject = null;
  }
}

export const faceRecognition = new FaceRecognitionService();

export function recognitionPage() {
  const candidates = store.data.people;
  const ready = candidates.filter((person) => person.faceDescriptor?.length === 128).length;
  return `
    <section class="page-section">
      <div class="page-intro"><div><p class="eyebrow">Private on-device matching</p><h2>Recognize an important person</h2><p>Face images and descriptors remain in this browser. Recognition can make mistakes—always confirm the person yourself.</p></div><div class="page-actions"><a class="button button-primary" href="#people">Add family member</a></div></div>
      <div class="dashboard-grid">
        <article class="card span-8">
          <div class="camera-stage"><video id="face-video" playsinline muted aria-label="Face recognition camera"></video><canvas id="face-overlay" aria-hidden="true"></canvas></div>
          <p id="face-status" class="banner" role="status" aria-live="polite">${ready ? `${ready} enrolled ${ready === 1 ? "person" : "people"}. Start the camera when ready.` : "Enroll a saved person before starting the camera."}</p>
          <div class="row-actions"><button class="button button-primary" type="button" data-face-action="start">Start camera</button><button class="button button-secondary" type="button" data-face-action="stop">Stop camera</button></div>
          <div id="face-result"></div>
        </article>
        <article class="card span-4">
          <div class="card-header"><div><h3>Enrolled people</h3><p class="card-subtitle">Use one clear, front-facing saved photo.</p></div></div>
          <div class="data-list">
            ${candidates.map((person) => `<div class="data-row"><div><strong>${escapeHtml(person.name)}</strong><p>${person.photo ? (person.faceDescriptor?.length === 128 ? "Ready" : "Photo saved · not enrolled") : "Add a photo first"}</p></div><button class="button button-secondary button-small" type="button" data-face-action="enroll" data-person-id="${escapeHtml(person.id)}" ${person.photo ? "" : "disabled"}>${person.faceDescriptor?.length === 128 ? "Re-enroll" : "Enroll"}</button></div>`).join("") || '<div class="empty-state"><div><p>Add a family member with a clear photo first.</p><a class="button button-primary" href="#people">Add family member</a></div></div>'}
          </div>
        </article>
      </div>
    </section>
  `;
}

export async function handleFaceAction(target, helpers) {
  const control = target.closest("[data-face-action]");
  if (!control) return false;
  try {
    if (control.dataset.faceAction === "start") await faceRecognition.start();
    if (control.dataset.faceAction === "stop") { faceRecognition.stop(); faceRecognition.status("Camera stopped."); }
    if (control.dataset.faceAction === "enroll") {
      faceRecognition.stop();
      await faceRecognition.enroll(control.dataset.personId);
      helpers.refresh();
    }
  } catch (error) {
    faceRecognition.stop();
    faceRecognition.status(error.message || "Face recognition could not start.", "error");
    toast(error.message || "Face recognition could not start.", { type: "error", duration: 8000 });
  }
  return true;
}
