import test from "node:test";
import assert from "node:assert/strict";
import { getLanguageMeta } from "../js/i18n.js";
import { store } from "../js/storage.js";

test("Urdu metadata enables full right-to-left layout and Urdu speech", () => {
  const urdu = getLanguageMeta("ur");
  assert.equal(urdu.direction, "rtl");
  assert.equal(urdu.locale, "ur-IN");
  assert.match(urdu.speech, /^ur-/);
});

test("dispenser demo emits the guarded response sequence without hardware", async () => {
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  const { dispenser } = await import("../js/dispenser.js");
  store.data.dispenser.activity = [];
  store.data.dispenser.rotationDelay = 1;
  store.data.dispenser.flapDuration = 1;
  dispenser.demoMode = true;

  await dispenser.demoCommand("DISPENSE:2");

  const messages = store.data.dispenser.activity
    .filter((entry) => entry.direction === "device")
    .map((entry) => entry.message);
  assert.deepEqual(messages, [
    "ROTATING:2",
    "ALIGNED:2",
    "FLAP_OPEN",
    "FLAP_CLOSED",
    "DISPENSED:2",
    "READY"
  ]);
});
