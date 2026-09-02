# MemoCare serial protocol

Transport: Web Serial / USB serial
Baud: 115200
Framing: one ASCII command or response per line, terminated by `\n`

## Commands

| Command | Accepted while busy | Result |
|---|---|---|
| `PING` | Yes | `BUSY` or `READY` |
| `STATUS` | Yes | `STATUS:<state>,ROTATION=<angle>,FLAP=<angle>[,COMPARTMENT=<n>]` |
| `STOP` | Yes | `ERROR:STOPPED`, close flap, `FLAP_CLOSED`, `READY` |
| `HOME` | No | Rotate to compartment 1/home |
| `ROTATE:n` | No | Align compartment 1–4 without opening flap |
| `DISPENSE:n` | No | Run one guarded automatic dispense |
| `OPEN_FLAP` | No | Explicit maintenance control |
| `CLOSE_FLAP` | No | Explicit maintenance control |

Invalid, overlapping, out-of-range, or overlong commands return `ERROR:*` or `BUSY`.

## Automatic dispense sequence

```text
Web       -> DISPENSE:3
Firmware  -> ROTATING:3
Firmware  -> ALIGNED:3
Firmware  -> FLAP_OPEN
Firmware  -> FLAP_CLOSED
Firmware  -> DISPENSED:3
Firmware  -> READY
```

The state machine cannot reach automatic flap opening until rotation finishes, `ALIGNED:n` is emitted, and the alignment-settle interval completes. New movement commands return `BUSY`. `STOP` is always accepted.

The browser prepares waiters before writing `DISPENSE:n`, verifies the aligned compartment, and applies ordered timeouts:

- alignment: 10 seconds;
- flap open: 14 seconds;
- flap closed: 18 seconds;
- dispensed: 22 seconds.

On timeout or disconnect, pending promises reject, the failure is logged, and the UI does not mark a dose taken. The user must confirm physical pill arrival. A reported missing pill offers at most one explicitly confirmed retry.

## Safety boundary

The firmware and web app do not identify pills, sense pill arrival, or detect all jams. `DISPENSED:n` means the commanded mechanical sequence completed—not that a correct pill was delivered.
