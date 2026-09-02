# MemoCare

MemoCare is an accessible, offline-capable memory, medication, safety, and daily-assistance PWA for older adults, people with cognitive impairment, caregivers, and families. It is a support tool—not a medical device, prescribing system, or professional emergency-tracking service.

## What MemoCare does

- Presents a calm daily orientation with date, time, medication timeline, reminders, appointments, people, and routines.
- Stores medication schedules, dose outcomes, stock warnings, memories, safe places, people, preferences, and dispenser logs in a validated local data layer.
- Offers Important People, a searchable Memory Journal, guided routines, Safe Places, “I’m lost” support, and configurable emergency contacts.
- Supports English, Hindi, and Urdu, including an RTL Urdu layout and localized dates/times.
- Provides reusable speech recognition and speech synthesis controls with typed fallback.
- Connects to a two-servo Arduino prototype through Web Serial, with a safe demo mode when hardware is unavailable.
- Works as a static PWA with an offline app shell.
- Provides separate Patient and Caregiver entry panels, three integrated memory games, local face enrollment/recognition, and a Puter.js AI helper.

## Feature list

- Responsive desktop sidebar and mobile bottom navigation
- Light, dark, high-contrast, large-text, large-button, reduced-motion, and simplified modes
- Medication CRUD, duplicate warnings, dose status, adherence history, undo, low-stock warnings, photos, and compartments
- Web Serial connection, device status, newline protocol, explicit dispense confirmation, one controlled retry, emergency stop, calibration settings, and logs
- Important People with photos, phone links, notes, relationship details, and voice input
- Memory Journal with photos, people/place tags, mood, search, and filtering
- Step-by-step routines with next/back/completion and read-aloud
- Safe places with OpenStreetMap/Leaflet, explicit geolocation, external directions, sharing, and optional continuous location
- Laptop/phone safety-zone monitoring with a configurable radius, directions home, local buzzer, and caregiver escalation
- Schedule/medicine alarms while MemoCare is open, plus browser notifications when permission is granted
- Emergency contact calls, configurable regional number, medical card, location sharing, audible alert, lost mode, and verified endpoint delivery status
- Memory matching, sequence, and word-recall games rebuilt inside the main PWA
- Face recognition rebuilt around saved Important People photos and local model files (assistance only—not authentication)
- Puter.js AI assistance without an embedded API key, with medical and emergency safety boundaries
- Local data validation, legacy migration, corruption recovery, import/export, and delete-all
- Optional Firebase Authentication adapter for guest, email/password, Google, phone OTP, reset, session, and logout

## Design reference

The editable liquid-glass desktop and mobile UI reference is available in
[Figma](https://www.figma.com/design/UzuBLe9aPW3VrSt3bZa3yg).

## Installation

No production build step is required.

```bash
git clone https://github.com/hacerzai/memomemo.git
cd memomemo
npm test
```

## Local development

Serve the repository over HTTP; browser permission APIs do not work reliably from `file://`.

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`. Use Chrome or Edge desktop for Web Serial.

## Deployment

The repository is a static site. Deploy the repository root to GitHub Pages, Cloudflare Pages, Netlify, or another static host. HTTPS is required in production for service workers, microphone, camera, geolocation, and Web Serial.

For Cloudflare Pages:

- Build command: leave empty (or run `npm test` in CI)
- Build output directory: `.`
- Configuration: `wrangler.jsonc`
- Security and cache headers: `_headers`

Do not add secrets to the repository. Set any backend configuration through the hosting provider’s encrypted environment or a deliberately public client configuration file.

## PWA installation

Open MemoCare over HTTPS, then use the browser’s Install/App menu. `manifest.webmanifest` provides app identity, icons, shortcuts, colours, and display settings. `sw.js` caches only the same-origin app shell and local static resources; it intentionally does not cache authentication or private cross-origin API responses.

## Authentication setup

Guest mode is fully usable and stores data only in the browser.

To enable real cloud sign-in:

1. Create a Firebase project and enable Email/Password, Google, and (if required) Phone providers.
2. Add the deployed domains under Firebase Authentication → Authorized domains.
3. Copy only the Firebase **web client configuration** into `config/auth-config.js`.
4. Configure Firestore/security rules or another authorized backend before enabling health-data sync or patient/caregiver linking.
5. Keep Admin SDK/service-account keys, service-role keys, private API keys, and passwords off the client and out of git.

Phone OTP requires Firebase’s reCAPTCHA flow and provider/region support. Secure caregiver invitation codes, QR linking, guest-to-account cloud migration, and confirmed remote alerts require a server-side authorization/data model; MemoCare does not imitate them when no backend exists.

### Caregiver message delivery

“I am okay,” emergency, “I’m lost,” and outside-zone events use the saved Emergency Contact. A static PWA cannot silently send SMS by itself:

- Without a backend, MemoCare opens a pre-addressed SMS on mobile or WhatsApp Web on desktop and labels the event `pending` until the user sends it.
- For automatic delivery, configure an authorized HTTPS notification endpoint in **Settings → Verified caregiver alert delivery**. The endpoint receives a minimal JSON event and must send the SMS/push message. MemoCare marks delivery only after a successful HTTP response.
- Keep Twilio credentials, Firebase Admin keys, service accounts, and all other private credentials on the server. Never enter them in the frontend setting.

## Map setup

Basic maps use Leaflet with OpenStreetMap tiles and need no paid API key. Location is requested only after a user action. Saved places remain readable offline; map tiles and live location require connectivity/browser permission. Directions open the user’s external maps application.

Continuous location is off by default and starts only after explicit opt-in. Save a Home place with coordinates, choose a 50–10,000 m radius, and select **Start safety monitoring**. Monitoring, the zone buzzer, and directions work on laptop and mobile while the Safe Places page remains open. MemoCare does not provide background or professional emergency tracking.

The map uses automatic container resizing and falls back to a second OpenStreetMap-compatible tile service when the primary tiles repeatedly fail.

## Alarm support

Enable alarms in Settings from a user action so the browser can unlock audio. MemoCare checks medicine schedules, reminders, and appointments every 15 seconds while the app is open. It does not alarm for “as needed” medicine entries. Installed PWAs and background tabs may still be paused by the operating system; keep an independent medication alarm for safety.

## Puter AI

The AI screen loads the official Puter.js v2 browser script and calls `puter.ai.chat`. Puter may ask the user to sign in and uses its user-pays model. No AI provider key is stored in MemoCare. AI output is escaped before rendering and is explicitly restricted from diagnosis, dosage changes, or claiming that an alert was sent.

## Language system

Translations live in:

- `locales/en.json`
- `locales/hi.json`
- `locales/ur.json`

Add a locale JSON file, register its metadata in `js/i18n.js`, and expose it in the selector. Urdu sets `dir="rtl"` for the complete document. Preferences are stored in the local profile and can be included in an authorized account profile by a configured backend. Medication names are stored exactly as entered; MemoCare does not silently machine-translate them.

## Voice support and browser limitations

MemoCare selects `en-IN`, `hi-IN`, or `ur-PK` for voice APIs. Speech recognition support varies by browser, operating system, installed speech engine, and network. The reusable voice service:

- prevents overlapping sessions;
- exposes listening, processing, complete, denied, unsupported, cancelled, and error states;
- preserves partial text;
- supports cancel, clear, editable transcripts, and silence timeout;
- stops when its dialog closes.

Speech synthesis provides read, pause, resume, replay, stop, rate, and voice selection where the browser exposes them. Typed input remains available everywhere.

## Arduino components

- Arduino UNO R4 WiFi or UNO-compatible board
- Two SG90-class servos (rotation and flap)
- Regulated external 5 V supply sized for both servos
- Common ground wiring
- Rotating tray/carousel and a mechanically safe flap
- USB data cable

The educational prototype has no pill identity, pill arrival, weight, jam, or position sensor. It must not be the sole medication-safety system.

## Arduino wiring

| Connection | Default | Notes |
|---|---:|---|
| Rotation servo signal | D9 | Change `ROTATION_SERVO_PIN` if needed |
| Flap servo signal | D10 | Change `FLAP_SERVO_PIN` if needed |
| Both servo red wires | External regulated +5 V | Do not use the Arduino 5 V pin under significant load |
| Both servo brown/black wires | External supply GND | Connect this GND to Arduino GND |
| Arduino GND | External supply GND | Common ground is mandatory |
| USB | Computer ↔ Arduino | Data/serial connection |

### External servo power warning

Do not power two SG90 servos directly from the Arduino 5 V pin under significant load. Use a suitable regulated external 5 V supply. Connect the external supply ground and Arduino ground together. Verify polarity before power-up; reversed polarity can damage the servos and board.

## Firmware upload

1. Open `arduino/memocare_pill_dispenser/memocare_pill_dispenser.ino` in Arduino IDE.
2. Install/select the board’s supported `Servo` library.
3. Select the connected board and port.
4. Review pins, angles, and durations at the top of the sketch.
5. Disconnect pill loads during first calibration.
6. Upload, open Serial Monitor at **115200 baud**, choose newline ending, and send `PING`.
7. Confirm `READY`, test `HOME`, then `ROTATE:n`, and test the flap only while observing the mechanism.

The sketch controls exactly two servos, uses a `millis()` state machine, rejects overlapping commands, keeps the flap closed at startup, and accepts `STOP` during any state.

## Web Serial connection

1. Use current Chrome or Edge desktop over HTTPS or localhost.
2. Open **Pill Dispenser**.
3. Turn off Demo mode.
4. Select **Connect pill dispenser** and choose the Arduino serial device.
5. Add/assign a medication to compartment 1–4.
6. Review the medication, dosage, time, and compartment.
7. Confirm one dispense while watching the machine.
8. Confirm whether the pill physically arrived; only then mark the medication taken.

Permission cancellation leaves the app unchanged. Disconnection clears pending commands and exposes reconnect controls. A timed-out or missing-pill cycle is logged and may offer one explicitly confirmed retry—never an automatic loop.

## Serial protocol

Commands and responses are UTF-8/ASCII lines terminated by `\n`, at 115200 baud.

| Web command | Purpose |
|---|---|
| `PING` | Request `READY`/`BUSY` |
| `STATUS` | Return current state and angles |
| `HOME` | Move carousel to the home/first compartment |
| `ROTATE:1` … `ROTATE:4` | Align one compartment without dispensing |
| `DISPENSE:1` … `DISPENSE:4` | Run the guarded rotation/flap sequence |
| `OPEN_FLAP` / `CLOSE_FLAP` | Confirmed manual maintenance control |
| `STOP` | Cancel movement and close the flap |

Expected responses include `READY`, `BUSY`, `ROTATING:n`, `ALIGNED:n`, `FLAP_OPEN`, `FLAP_CLOSED`, `DISPENSED:n`, `STATUS:…`, and `ERROR:message`. See `docs/SERIAL_PROTOCOL.md` for the state sequence and timeout behaviour.

## Calibration

With pills removed:

1. Adjust `COMPARTMENT_ANGLES` so each pocket aligns with the chute.
2. Adjust `HOME_ANGLE`/first compartment alignment.
3. Set `FLAP_CLOSED_ANGLE` to close without servo binding.
4. Set `FLAP_OPEN_ANGLE` only as far as needed.
5. Tune `ALIGN_SETTLE_MS`, `FLAP_OPEN_DURATION_MS`, and smooth step settings.
6. Test each `ROTATE:n`, then manual flap controls, then an empty `DISPENSE:n`.

Stop immediately if a servo chatters, stalls, gets hot, or drives against a hard stop.

## Demo mode

Demo mode is enabled by default. It simulates ordered `ROTATING`, `ALIGNED`, `FLAP_OPEN`, `FLAP_CLOSED`, `DISPENSED`, and `READY` responses without selecting a serial device or moving hardware. Demo records are labelled as demo activity.

## Troubleshooting

| Problem | Check |
|---|---|
| Connect button says unsupported | Use Chrome/Edge desktop over HTTPS or localhost |
| Device chooser is empty | Use a data-capable USB cable; close Serial Monitor; reinstall board driver if applicable |
| Arduino resets when servos move | Use a regulated external 5 V supply and common ground |
| Tray aligns incorrectly | Recalibrate `COMPARTMENT_ANGLES` with pills removed |
| Flap opens before expected | Press STOP, remove power, inspect mechanics, and verify the unmodified state-machine firmware |
| `BUSY` repeats | Wait for `READY`; press STOP if movement is unsafe |
| Alignment/flap timeout | Stop, inspect power/mechanics/cable, then reconnect; do not repeatedly dispense |
| Map is blank or partial | Resize/reopen Safe Places, check connectivity/content blockers, and use Retry; a backup tile source activates after repeated tile failures |
| Alarm is silent | Enable alarms from Settings, allow sound/notifications, keep MemoCare open, and check system volume |
| Caregiver message says pending | Send the prepared SMS/WhatsApp message, or configure an authorized HTTPS alert endpoint |
| Face recognition finds nobody | Add a clear front-facing photo under Important People, enroll it, allow camera permission, and improve lighting |
| Puter AI does not answer | Check connectivity, disable blockers for `js.puter.com`, and complete Puter sign-in if requested |
| Microphone/camera denied | Reset the site permission in browser settings and retry from the relevant control |
| Saved data was corrupt | MemoCare isolates the raw value and starts from a validated safe schema; import a known-good export if available |

## Privacy and medical disclaimer

Guest data remains in the current browser profile. Export files can contain sensitive health, contact, location, and memory information—store them securely. Cloud authentication alone does not enable health-data sync. A backend must enforce patient/caregiver authorization before any private data is shared.

MemoCare does not prescribe medication, recommend doses, modify medical instructions, verify pill identity, guarantee pill delivery, replace a clinician, or replace emergency services. Configure the correct regional emergency number and keep independent medication and emergency plans.

## Quality checks

```bash
npm test
```

This runs protocol/storage unit tests, JavaScript syntax checks, inline-script parsing, local asset/path checks, duplicate-ID checks, locale JSON checks, and manifest icon checks. Manual/device coverage is documented in `docs/TESTING_CHECKLIST.md`.

## Project documentation

- `docs/REPOSITORY_AUDIT.md` — initial issues and remediation
- `docs/TESTING_CHECKLIST.md` — automated results and manual acceptance matrix
- `docs/SERIAL_PROTOCOL.md` — command/state reference
- `docs/REMAINING_LIMITATIONS.md` — honest setup and platform limitations
