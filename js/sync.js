/**
 * MemoCare Sync — Firebase Firestore real-time caregiver ↔ patient link
 *
 * Room structure in Firestore:  careRooms/{roomId}
 * {
 *   roomId, createdAt, patientName, caregiverName,
 *   medications: [...],
 *   doseHistory: [...],
 *   appointments: [...],
 *   reminders: [...],
 *   lastUpdatedBy: "caregiver" | "patient",
 *   lastUpdatedAt: ISO string
 * }
 */

import { firebaseConfig } from "../config/auth-config.js";
import { store } from "./storage.js";
import { toast } from "./notifications.js";

const FIRESTORE_VERSION = "10.14.1";
const FIRESTORE_URL = `https://www.gstatic.com/firebasejs/${FIRESTORE_VERSION}/firebase-firestore.js`;
const APP_URL = `https://www.gstatic.com/firebasejs/${FIRESTORE_VERSION}/firebase-app.js`;

const SYNCED_FIELDS = ["medications", "doseHistory", "appointments", "reminders"];

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

class SyncService extends EventTarget {
  constructor() {
    super();
    this.db = null;
    this.api = null;
    this.roomId = null;
    this.unsubscribe = null;
    this.status = "idle"; // idle | connecting | connected | error | no-config
    this._remoteUpdateCallback = null;
    this._ignoreNextSnapshot = false;
  }

  get configured() {
    return Boolean(firebaseConfig);
  }

  get linked() {
    return this.status === "connected" && Boolean(this.roomId);
  }

  async _init() {
    if (this.db) return true;
    if (!firebaseConfig) {
      this.status = "no-config";
      return false;
    }
    try {
      const [{ initializeApp, getApps }, firestoreApi] = await Promise.all([
        import(APP_URL),
        import(FIRESTORE_URL)
      ]);
      // Reuse existing app if already initialized (e.g. by auth.js)
      const existingApps = getApps();
      const app = existingApps.length ? existingApps[0] : initializeApp(firebaseConfig);
      this.api = firestoreApi;
      this.db = firestoreApi.getFirestore(app);
      return true;
    } catch (err) {
      console.error("MemoCare Sync init failed:", err);
      this.status = "error";
      return false;
    }
  }

  /**
   * Create a brand new room (called by the patient or initial caregiver).
   * Returns the room ID.
   */
  async createRoom() {
    const ready = await this._init();
    if (!ready) throw new Error("Firebase is not configured. Add your Firebase config to config/auth-config.js.");

    const roomId = generateRoomId();
    const ref = this.api.doc(this.db, "careRooms", roomId);
    const role = store.data.profile.role;
    await this.api.setDoc(ref, {
      roomId,
      createdAt: new Date().toISOString(),
      patientName: role === "patient" ? (store.data.profile.name || "Patient") : "",
      caregiverName: role === "caregiver" ? (store.data.profile.name || "Caregiver") : "",
      medications: store.data.medications,
      doseHistory: store.data.doseHistory.slice(-100),
      appointments: store.data.appointments,
      reminders: store.data.reminders,
      lastUpdatedBy: role,
      lastUpdatedAt: new Date().toISOString()
    });

    store.update((data) => { data.profile.linkedRoomId = roomId; });
    await this._subscribe(roomId);
    return roomId;
  }

  /**
   * Join an existing room with a known room ID.
   */
  async joinRoom(roomId) {
    const clean = String(roomId).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length !== 6) throw new Error("Room code must be 6 characters (e.g. ABC123).");

    const ready = await this._init();
    if (!ready) throw new Error("Firebase is not configured. Add your Firebase config to config/auth-config.js.");

    const ref = this.api.doc(this.db, "careRooms", clean);
    const snap = await this.api.getDoc(ref);
    if (!snap.exists()) throw new Error(`Room "${clean}" was not found. Check the code and try again.`);

    // Update name fields for this role
    const role = store.data.profile.role;
    await this.api.updateDoc(ref, {
      [`${role}Name`]: store.data.profile.name || role
    });

    store.update((data) => { data.profile.linkedRoomId = clean; });
    await this._subscribe(clean);

    // Pull existing data from room into local store
    const roomData = snap.data();
    this._applyRemoteData(roomData);
    return clean;
  }

  /**
   * Reconnect to a previously linked room (called on app start).
   */
  async reconnect() {
    const roomId = store.data.profile.linkedRoomId;
    if (!roomId) return;
    const ready = await this._init();
    if (!ready) return;
    await this._subscribe(roomId);
  }

  async _subscribe(roomId) {
    // Tear down existing subscription
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.roomId = roomId;
    this.status = "connecting";
    this._emit();

    const ref = this.api.doc(this.db, "careRooms", roomId);
    this.unsubscribe = this.api.onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      if (this._ignoreNextSnapshot) {
        this._ignoreNextSnapshot = false;
        return;
      }
      const data = snap.data();
      // Only apply if the last update was from the OTHER role
      const myRole = store.data.profile.role;
      if (data.lastUpdatedBy && data.lastUpdatedBy !== myRole) {
        this._applyRemoteData(data);
        toast(`📲 Medication list updated by your ${data.lastUpdatedBy === "caregiver" ? "caregiver" : "patient"}.`, { type: "info", duration: 5000 });
        this.dispatchEvent(new CustomEvent("remote-update", { detail: data }));
      }
      this.status = "connected";
      this._emit();
    }, (err) => {
      console.error("MemoCare Sync snapshot error:", err);
      this.status = "error";
      this._emit();
    });

    this.status = "connected";
    this._emit();
  }

  _applyRemoteData(roomData) {
    store.update((data) => {
      for (const field of SYNCED_FIELDS) {
        if (Array.isArray(roomData[field])) {
          data[field] = roomData[field];
        }
      }
    });
  }

  /**
   * Push synced data to Firestore. Called after local mutations.
   */
  async push() {
    if (!this.linked || !this.db) return;
    const role = store.data.profile.role;
    const ref = this.api.doc(this.db, "careRooms", this.roomId);
    this._ignoreNextSnapshot = true;
    try {
      await this.api.updateDoc(ref, {
        medications: store.data.medications,
        doseHistory: store.data.doseHistory.slice(-100),
        appointments: store.data.appointments,
        reminders: store.data.reminders,
        lastUpdatedBy: role,
        lastUpdatedAt: new Date().toISOString(),
        [`${role}Name`]: store.data.profile.name || role
      });
    } catch (err) {
      this._ignoreNextSnapshot = false;
      console.error("MemoCare Sync push failed:", err);
    }
  }

  /**
   * Leave the linked room (stops syncing but keeps local data).
   */
  leave() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.roomId = null;
    this.status = "idle";
    store.update((data) => { data.profile.linkedRoomId = ""; });
    this._emit();
  }

  _emit() {
    this.dispatchEvent(new CustomEvent("status-change", { detail: { status: this.status, roomId: this.roomId } }));
  }

  statusLabel() {
    const labels = {
      idle: "Not linked",
      connecting: "Connecting…",
      connected: "Linked · Live",
      error: "Sync error",
      "no-config": "Firebase not configured"
    };
    return labels[this.status] ?? this.status;
  }
}

export const sync = new SyncService();
