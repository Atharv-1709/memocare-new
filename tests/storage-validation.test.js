import test from "node:test";
import assert from "node:assert/strict";
import { SCHEMA_VERSION, validateData } from "../js/storage.js";

test("invalid storage input returns a safe empty schema", () => {
  const result = validateData("not an object");
  assert.equal(result.recovered, true);
  assert.equal(result.data.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(result.data.medications, []);
});

test("medication data is normalized and unsafe ranges are clamped", () => {
  const result = validateData({
    schemaVersion: SCHEMA_VERSION,
    profile: { language: "ur", role: "caregiver" },
    settings: {},
    medications: [{
      name: "Aspirin",
      form: "unknown",
      compartment: 99,
      stock: -40,
      lowStockAt: 5
    }],
    people: [],
    dispenser: { angles: [-20, 40, 220], flapDuration: 20 }
  });
  const [medicine] = result.data.medications;
  assert.equal(medicine.form, "tablet");
  assert.equal(medicine.compartment, 4);
  assert.equal(medicine.stock, 0);
  assert.deepEqual(result.data.dispenser.angles, [0, 40, 180, 150]);
  assert.equal(result.data.dispenser.flapDuration, 500);
  assert.equal(result.data.profile.language, "ur");
});

test("records without required names are dropped", () => {
  const result = validateData({
    schemaVersion: SCHEMA_VERSION,
    medications: [{ dosage: "10 mg" }, null],
    people: [{ relationship: "friend" }],
    dispenser: {}
  });
  assert.equal(result.data.medications.length, 0);
  assert.equal(result.data.people.length, 0);
});
