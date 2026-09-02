import test from "node:test";
import assert from "node:assert/strict";
import { COMMANDS, encodeCommand, parseResponse, validateCompartment } from "../js/dispenser-protocol.js";

test("protocol creates only supported compartment commands", () => {
  assert.equal(COMMANDS.dispense(1), "DISPENSE:1");
  assert.equal(COMMANDS.rotate(4), "ROTATE:4");
  assert.throws(() => validateCompartment(0), /between 1 and 4/);
  assert.throws(() => COMMANDS.dispense(5), /between 1 and 4/);
});

test("serial commands are newline terminated and reject line injection", () => {
  assert.equal(encodeCommand("ping"), "PING\n");
  assert.throws(() => encodeCommand("PING\nSTOP"), /line breaks/);
  assert.throws(() => encodeCommand(""), /required/);
});

test("device responses are parsed without discarding error details", () => {
  assert.deepEqual(parseResponse("ALIGNED:3\r\n"), {
    raw: "ALIGNED:3",
    type: "ALIGNED",
    value: "3",
    compartment: 3,
    error: null
  });
  assert.equal(parseResponse("ERROR:Tray jam").error, "Tray jam");
  assert.equal(parseResponse("VENDOR:VALUE").type, "UNKNOWN");
  assert.equal(parseResponse(""), null);
});
