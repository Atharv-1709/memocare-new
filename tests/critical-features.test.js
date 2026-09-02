import test from "node:test";
import assert from "node:assert/strict";
import { validateData, SCHEMA_VERSION, store } from "../js/storage.js";
import { shuffle } from "../js/games.js";
import { haversineMeters } from "../js/maps.js";
import { renderAuth } from "../js/auth.js";
import { caregiverMessageUrl } from "../js/alerts.js";

test("schema migrates alarm and safety-zone settings safely", () => {
  const { data } = validateData({
    schemaVersion: 2,
    settings: {
      alarmsEnabled: true,
      safetyRadiusMeters: 999999,
      caregiverAlertEndpoint: "https://alerts.example.test/send"
    }
  });
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(data.settings.alarmsEnabled, true);
  assert.equal(data.settings.safetyRadiusMeters, 10000);
  assert.equal(data.settings.caregiverAlertEndpoint, "https://alerts.example.test/send");
});

test("game shuffle preserves every card exactly once", () => {
  const values = ["a", "b", "c", "d"];
  const shuffled = shuffle(values, () => 0.25);
  assert.deepEqual([...shuffled].sort(), values);
  assert.notEqual(shuffled, values);
});

test("safety-zone distance uses real geographic metres", () => {
  const distance = haversineMeters({ lat: 28.6139, lng: 77.2090 }, { lat: 28.6229, lng: 77.2090 });
  assert.ok(distance > 990 && distance < 1015, `expected about 1 km, got ${distance}`);
});

test("authentication starts with distinct patient and caregiver panels", () => {
  const markup = renderAuth("start");
  assert.match(markup, /Patient panel/);
  assert.match(markup, /Caregiver panel/);
  assert.match(renderAuth("patient"), /Continue as patient guest/);
  assert.match(renderAuth("caregiver"), /Continue as caregiver guest/);
});

test("caregiver message handoff addresses the saved emergency contact", () => {
  store.data.profile.emergencyContactId = "caregiver-one";
  store.data.people = [{ id: "caregiver-one", phone: "+91 98765 43210" }];
  const url = caregiverMessageUrl("I am okay.", "whatsapp");
  assert.match(url, /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.match(decodeURIComponent(url), /I am okay/);
});
