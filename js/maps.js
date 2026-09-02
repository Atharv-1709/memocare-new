import { store } from "./storage.js";
import { escapeHtml, uid } from "./utils.js";
import { toast } from "./notifications.js";
import { t } from "./i18n.js";
import { alarms, deliverCaregiverAlert, offerCaregiverHandoff } from "./alerts.js";

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS_FALLBACK = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS_FALLBACK = `https://cdn.jsdelivr.net/npm/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

function loadStylesheet(href) {
  return new Promise((resolve, reject) => {
    const existing = [...document.styleSheets].find((sheet) => sheet.href === href);
    if (existing) return resolve(existing);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve(link);
    link.onerror = () => { link.remove(); reject(new Error(`Could not load ${href}`)); };
    document.head.append(link);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") return resolve();
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => { script.remove(); reject(new Error(`Could not load ${src}`)); };
    document.head.append(script);
  });
}

class MapService extends EventTarget {
  constructor() {
    super();
    this.map = null;
    this.userMarker = null;
    this.placeMarkers = [];
    this.zoneCircle = null;
    this.resizeObserver = null;
    this.outsideZone = false;
    this.position = null;
    this.watchId = null;
    this.state = "idle";
    this.containerId = "";
  }

  emit(state, detail = {}) {
    this.state = state;
    this.dispatchEvent(new CustomEvent("state", { detail: { state, position: this.position, ...detail } }));
  }

  async loadLeaflet() {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"], link[href="${LEAFLET_CSS_FALLBACK}"]`)) {
      await loadStylesheet(LEAFLET_CSS).catch(() => loadStylesheet(LEAFLET_CSS_FALLBACK));
    }
    if (!globalThis.L) await loadScript(LEAFLET_JS).catch(() => loadScript(LEAFLET_JS_FALLBACK));
    if (!globalThis.L) throw new Error("The map library could not be loaded.");
    return globalThis.L;
  }

  async init(containerId = "safe-map") {
    this.containerId = containerId;
    const container = document.getElementById(containerId);
    if (!container) return;
    this.emit("loading");
    try {
      const L = await this.loadLeaflet();
      if (!document.getElementById(containerId)) return;
      this.map?.remove();
      container.classList.remove("map-state");
      container.innerHTML = "";
      this.map = L.map(containerId, { zoomControl: true }).setView([28.6139, 77.2090], 11);
      const primaryTiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(this.map);
      let tileErrors = 0;
      primaryTiles.on("tileerror", () => {
        tileErrors += 1;
        if (tileErrors !== 4 || !this.map) return;
        primaryTiles.remove();
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 20,
          subdomains: "abcd",
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
        }).addTo(this.map);
        this.emit("ready", { message: "Map loaded with the backup tile service." });
      });
      this.renderPlaces();
      this.renderSafetyZone();
      this.showPosition();
      this.evaluateSafetyZone();
      this.emit("ready");
      this.resizeObserver?.disconnect();
      if ("ResizeObserver" in window) {
        this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize({ pan: false }));
        this.resizeObserver.observe(container);
      }
      requestAnimationFrame(() => this.map?.invalidateSize({ pan: false }));
      setTimeout(() => this.map?.invalidateSize({ pan: false }), 250);
      setTimeout(() => this.map?.invalidateSize({ pan: false }), 1000);
    } catch (error) {
      console.error("MemoCare map load:", error);
      this.emit("error", { message: "The online map could not load. Saved addresses are still available." });
    }
  }

  renderPlaces() {
    if (!this.map || !globalThis.L) return;
    this.placeMarkers.forEach((marker) => marker.remove());
    this.placeMarkers = store.data.safePlaces
      .filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng)))
      .map((place) => globalThis.L.marker([Number(place.lat), Number(place.lng)])
        .addTo(this.map)
        .bindPopup(`<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.address || place.type || "")}`));
  }

  homePlace() {
    return store.data.safePlaces.find((place) => place.type === "home" && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng))) || null;
  }

  renderSafetyZone() {
    this.zoneCircle?.remove();
    this.zoneCircle = null;
    const home = this.homePlace();
    if (!this.map || !globalThis.L || !home) return;
    this.zoneCircle = globalThis.L.circle([Number(home.lat), Number(home.lng)], {
      radius: store.data.settings.safetyRadiusMeters,
      color: "#16865b",
      fillColor: "#53d394",
      fillOpacity: 0.15,
      weight: 3
    }).addTo(this.map).bindPopup(`Safety zone: ${store.data.settings.safetyRadiusMeters} m around ${escapeHtml(home.name)}`);
  }

  distanceFromHome(position = this.position) {
    const home = this.homePlace();
    if (!home || !position) return null;
    return haversineMeters(position, { lat: Number(home.lat), lng: Number(home.lng) });
  }

  async evaluateSafetyZone() {
    if (!store.data.settings.continuousLocation) return;
    const distance = this.distanceFromHome();
    if (distance === null) return;
    const outside = distance > store.data.settings.safetyRadiusMeters;
    const status = document.getElementById("zone-status");
    if (status) {
      status.className = `banner ${outside ? "banner-danger" : ""}`;
      status.textContent = outside
        ? `Outside safety zone · about ${Math.round(distance)} m from Home. Follow Directions home.`
        : `Inside safety zone · about ${Math.round(distance)} m from Home.`;
    }
    if (outside && !this.outsideZone) {
      this.outsideZone = true;
      alarms.ring({ id: "safety-zone", title: "Safety-zone alert", body: "You are outside the saved safety zone. Open directions home." }).catch(() => {});
      const result = await deliverCaregiverAlert("outside-zone", this.position);
      store.update((data) => data.emergencyEvents.push({ id: uid("event"), type: "outside-zone", title: "Outside safety zone", timestamp: new Date().toISOString(), delivery: result.status }));
      offerCaregiverHandoff(result, { urgent: true });
      this.emit("outside-zone", { distance, delivery: result.status });
    }
    if (!outside) this.outsideZone = false;
  }

  locationOptions() {
    return { enableHighAccuracy: true, timeout: 12000, maximumAge: 30_000 };
  }

  async requestPosition() {
    if (!navigator.geolocation) {
      this.emit("unavailable", { message: "Location is not supported by this browser." });
      throw new Error("Location is not supported by this browser.");
    }
    this.emit("locating");
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition((position) => {
        this.position = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        this.showPosition();
        this.evaluateSafetyZone();
        this.emit("located");
        resolve(this.position);
      }, (error) => {
        const state = error.code === error.PERMISSION_DENIED ? "denied" :
          error.code === error.TIMEOUT ? "timeout" : "unavailable";
        const messages = {
          denied: "Location permission was denied. You can add an address manually.",
          timeout: "Location took too long. Move near a window and try again.",
          unavailable: "Your location is currently unavailable."
        };
        this.emit(state, { message: messages[state] });
        reject(new Error(messages[state]));
      }, this.locationOptions());
    });
  }

  showPosition() {
    if (!this.map || !this.position || !globalThis.L) return;
    const point = [this.position.lat, this.position.lng];
    if (!this.userMarker) {
      this.userMarker = globalThis.L.circleMarker(point, {
        radius: 10,
        color: "#ffffff",
        weight: 4,
        fillColor: "#1565c0",
        fillOpacity: 1
      }).addTo(this.map).bindPopup("Your current position");
    } else this.userMarker.setLatLng(point);
    this.map.setView(point, 16);
  }

  enableContinuous(enabled) {
    if (!enabled) {
      if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      store.update((data) => { data.settings.continuousLocation = false; });
      this.emit("sharing-stopped");
      return;
    }
    if (!navigator.geolocation) throw new Error("Location is not supported.");
    if (this.watchId !== null) return;
    this.watchId = navigator.geolocation.watchPosition((position) => {
      this.position = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      };
      this.showPosition();
      this.evaluateSafetyZone();
      this.emit("sharing");
    }, (error) => {
      this.enableContinuous(false);
      this.emit("error", { message: error.message });
    }, this.locationOptions());
    store.update((data) => { data.settings.continuousLocation = true; });
    this.emit("sharing");
  }

  addPlace(place) {
    const normalized = {
      id: place.id || uid("place"),
      name: String(place.name || "").trim().slice(0, 120),
      type: String(place.type || "other").slice(0, 60),
      address: String(place.address || "").trim().slice(0, 500),
      lat: place.lat === "" ? null : Number(place.lat),
      lng: place.lng === "" ? null : Number(place.lng),
      phone: String(place.phone || "").trim().slice(0, 40),
      notes: String(place.notes || "").trim().slice(0, 500)
    };
    if (!normalized.name || !normalized.address) throw new Error("Place name and address are required.");
    if ((normalized.lat !== null && !Number.isFinite(normalized.lat)) || (normalized.lng !== null && !Number.isFinite(normalized.lng))) {
      throw new Error("Latitude and longitude must be valid numbers.");
    }
    store.update((data) => {
      const index = data.safePlaces.findIndex((item) => item.id === normalized.id);
      if (index >= 0) data.safePlaces[index] = normalized;
      else data.safePlaces.push(normalized);
    });
    this.renderPlaces();
    return normalized;
  }

  directionsUrl(place) {
    if (Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng))) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${place.lat},${place.lng}`)}`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address)}`;
  }

  shareLocation() {
    if (!this.position) throw new Error("Request your current location first.");
    const url = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(this.position.lat)}&mlon=${encodeURIComponent(this.position.lng)}#map=17/${encodeURIComponent(this.position.lat)}/${encodeURIComponent(this.position.lng)}`;
    if (navigator.share) return navigator.share({ title: "My current location", text: "Shared from MemoCare", url });
    return navigator.clipboard.writeText(url).then(() => toast("Location link copied."));
  }

  cleanup() {
    this.enableContinuous(false);
    this.map?.remove();
    this.map = null;
    this.userMarker = null;
    this.placeMarkers = [];
    this.zoneCircle = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }
}

export function haversineMeters(pointA, pointB) {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const latitudeDelta = toRadians(pointB.lat - pointA.lat);
  const longitudeDelta = toRadians(pointB.lng - pointA.lng);
  const latitudeA = toRadians(pointA.lat);
  const latitudeB = toRadians(pointB.lat);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export const maps = new MapService();

maps.addEventListener("state", (event) => {
  const status = document.getElementById("map-status");
  const messages = {
    loading: "Loading the map…",
    ready: "Map ready. Location has not been requested.",
    locating: "Requesting your current location…",
    located: "Current location shown with your permission.",
    denied: event.detail.message || t("location.denied"),
    timeout: event.detail.message || "Location request timed out. Try again.",
    unavailable: event.detail.message || t("location.unavailable"),
    sharing: "Continuous location sharing is active while this page is open.",
    "sharing-stopped": "Continuous location sharing is off.",
    error: event.detail.message || "The map could not load."
  };
  if (status) status.textContent = event.detail.message || messages[event.detail.state] || event.detail.state;
  if (event.detail.state === "error" && !maps.map) {
    const container = document.getElementById(maps.containerId);
    if (container) container.innerHTML = '<div class="error-state"><p>The online map could not load. Saved addresses remain available.</p><button class="button button-secondary" type="button" data-place-action="retry-map">Retry map</button></div>';
  }
});

export function placeForm(place = {}) {
  const value = (key) => escapeHtml(place[key] ?? "");
  return `
    <div class="form-grid">
      <div class="field"><label for="place-name">${t("common.name")}</label><input id="place-name" name="name" value="${value("name")}" placeholder="Home" required></div>
      <div class="field"><label for="place-type">Type</label><select id="place-type" name="type">
        ${["home", "hospital", "pharmacy", "relative", "police", "other"].map((type) => `<option value="${type}" ${place.type === type ? "selected" : ""}>${type}</option>`).join("")}
      </select></div>
      <div class="field field-full"><label for="place-address">Address</label><textarea id="place-address" name="address" required>${value("address")}</textarea></div>
      <div class="field"><label for="place-lat">Latitude (optional)</label><input id="place-lat" name="lat" type="number" step="any" value="${value("lat")}"></div>
      <div class="field"><label for="place-lng">Longitude (optional)</label><input id="place-lng" name="lng" type="number" step="any" value="${value("lng")}"></div>
      <div class="field"><label for="place-phone">Phone (optional)</label><input id="place-phone" name="phone" type="tel" value="${value("phone")}"></div>
      <div class="field"><label for="place-notes">${t("common.notes")}</label><input id="place-notes" name="notes" value="${value("notes")}"></div>
    </div>
    <input type="hidden" name="id" value="${value("id")}">
    <button class="button button-secondary" type="button" data-place-use-current>Use my current coordinates</button>
  `;
}

function placeCard(place) {
  const isPatient = store.data.profile.role === "patient";
  return `
    <article class="card">
      <div class="card-header"><div><span class="status-pill status-info">${escapeHtml(place.type)}</span><h3>${escapeHtml(place.name)}</h3></div></div>
      <p>${escapeHtml(place.address)}</p>
      <div class="row-actions">
        <a class="button button-primary button-small" href="${maps.directionsUrl(place)}" target="_blank" rel="noopener">Directions</a>
        ${place.phone ? `<a class="button button-secondary button-small" href="tel:${escapeHtml(place.phone)}">Call</a>` : ""}
        ${!isPatient ? `
          <button class="button button-secondary button-small" type="button" data-place-action="edit" data-place-id="${place.id}">${t("common.edit")}</button>
          <button class="button button-ghost button-small" type="button" data-place-action="delete" data-place-id="${place.id}">${t("common.delete")}</button>
        ` : ""}
      </div>
    </article>
  `;
}


export function placesPage() {
  const home = maps.homePlace();
  const isPatient = store.data.profile.role === "patient";
  return `
    <section class="page-section">
      <div class="page-intro">
        <div><p class="eyebrow">Location with permission</p><h2>${t("places.title")}</h2><p>MemoCare does not provide professional emergency tracking. Location is used only after you ask.</p></div>
        <div class="page-actions">${!isPatient ? `<button class="button button-primary" type="button" data-place-action="add">${t("places.add")}</button>` : ""}<button class="button button-secondary" type="button" data-place-action="locate">${t("emergency.locate")}</button></div>
      </div>
      ${isPatient ? '<div class="banner"><strong>View only</strong><br>Your caregiver manages safe places and tracking zones.</div>' : ""}
      <div class="dashboard-grid">
        <div class="card span-8 map-shell"><p id="map-status" class="help-text" role="status" aria-live="polite">Loading the map…</p><div id="safe-map" class="map-state"><p>Loading the map…</p></div></div>
        <article class="card span-4">
          <div class="card-header"><div><h3>Safety zone</h3><p class="card-subtitle">Works on laptops and phones while this page is open.</p></div><span class="status-pill ${store.data.settings.continuousLocation ? "status-warning" : "status-safe"}">${store.data.settings.continuousLocation ? "Monitoring" : "Off"}</span></div>
          <p id="zone-status" class="banner" role="status">${home ? `Home is set. Zone radius: ${store.data.settings.safetyRadiusMeters} m.` : "Save Home with coordinates to use the safety zone."}</p>
          <div class="field"><label for="zone-radius">Safety radius (metres)</label><input id="zone-radius" type="number" min="50" max="10000" step="50" value="${store.data.settings.safetyRadiusMeters}" ${isPatient ? "disabled" : ""}></div>
          ${!isPatient ? `<button class="button button-primary button-block" type="button" data-place-action="toggle-zone" ${home ? "" : "disabled"}>${store.data.settings.continuousLocation ? "Stop safety monitoring" : "Start safety monitoring"}</button>` : ""}
          ${home ? `<a class="button button-secondary button-block" href="${maps.directionsUrl(home)}" target="_blank" rel="noopener">Directions home</a>` : ""}
          <button class="button button-secondary button-block" type="button" data-place-action="share">${t("emergency.share")}</button>
          <p class="help-text">Automatic remote messages require the secure caregiver alert endpoint in Settings. Without it, MemoCare sounds the buzzer and asks you to send the prepared message.</p>
        </article>
      </div>

      <div class="safe-place-grid">
        ${store.data.safePlaces.length ? store.data.safePlaces.map(placeCard).join("") : '<div class="empty-state"><p>No safe places saved yet.</p></div>'}
      </div>
    </section>
  `;
}

export async function handleMapAction(target, helpers) {
  const action = target.closest("[data-place-action]")?.dataset.placeAction;
  if (action === "locate") {
    try { await maps.requestPosition(); } catch (error) { toast(error.message, { type: "error" }); }
    return true;
  }
  if (action === "retry-map") {
    await maps.init("safe-map");
    return true;
  }
  if (action === "share") {
    try {
      if (!maps.position) await maps.requestPosition();
      await maps.shareLocation();
    } catch (error) { toast(error.message, { type: "error" }); }
    return true;
  }
  if (action === "toggle-zone") {
    try {
      const enabled = !store.data.settings.continuousLocation;
      const radius = Math.min(10000, Math.max(50, Number(document.getElementById("zone-radius")?.value) || 500));
      store.update((data) => { data.settings.safetyRadiusMeters = radius; });
      maps.renderSafetyZone();
      if (enabled) {
        await alarms.unlock();
        maps.enableContinuous(true);
        if (!maps.position) await maps.requestPosition();
        else await maps.evaluateSafetyZone();
      } else {
        maps.enableContinuous(false);
      }
      helpers.refresh();
    } catch (error) { toast(error.message, { type: "error", duration: 8000 }); }
    return true;
  }
  if (action === "add" || action === "edit") {
    const id = target.closest("[data-place-id]")?.dataset.placeId;
    const place = store.data.safePlaces.find((item) => item.id === id) ?? {};
    helpers.openForm({
      eyebrow: "Safe place",
      title: action === "add" ? "Add safe place" : "Edit safe place",
      body: placeForm(place),
      submitLabel: "Save place",
      onSubmit(form) {
        maps.addPlace(Object.fromEntries(new FormData(form)));
        toast("Safe place saved.");
        helpers.refresh();
      }
    });
    return true;
  }
  if (target.closest("[data-place-use-current]")) {
    try {
      const position = maps.position ?? await maps.requestPosition();
      document.getElementById("place-lat").value = position.lat;
      document.getElementById("place-lng").value = position.lng;
    } catch (error) { toast(error.message, { type: "error" }); }
    return true;
  }
  if (action === "delete") {
    const id = target.closest("[data-place-id]").dataset.placeId;
    const place = store.data.safePlaces.find((item) => item.id === id);
    helpers.confirm({
      title: "Delete safe place?",
      message: place?.name ?? "This saved place",
      confirmLabel: "Delete",
      dangerous: true,
      onConfirm() {
        store.update((data) => { data.safePlaces = data.safePlaces.filter((item) => item.id !== id); });
        helpers.refresh();
      }
    });
    return true;
  }
  return false;
}
