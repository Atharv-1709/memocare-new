# MemoCare testing checklist

## Automated in this repository

Run `npm test`.

- [x] JavaScript modules parse
- [x] Legacy inline scripts parse
- [x] Relative assets and links resolve
- [x] HTML IDs are unique within each file
- [x] Locale JSON files parse and expose required navigation labels
- [x] Manifest icon paths resolve
- [x] Corrupted/non-object stored data returns a safe schema
- [x] Medication fields and unsafe numeric ranges are normalized
- [x] Invalid named records are dropped
- [x] Protocol creates valid compartment commands only
- [x] Commands are newline terminated and reject line injection
- [x] Device responses and detailed errors parse correctly
- [x] Schema v3 migrates alarm, safety-radius, and caregiver-endpoint settings safely
- [x] Memory-game shuffle preserves the complete card set
- [x] Safety-zone distance is calculated in geographic metres
- [x] Patient and Caregiver panels render as distinct entry flows
- [x] Prepared caregiver message targets the saved emergency contact number

## Browser acceptance matrix

Use clean profiles and test at desktop (1440×900), tablet (768×1024), Android/mobile (390×844), and narrow mobile (320×568). Check the browser console after every group.

| Workflow | Expected result |
|---|---|
| Guest mode | App opens without sign-in; data survives reload |
| Patient/Caregiver entry | Separate panels set the selected role and expose the appropriate guest/account path |
| Sign-up/login/logout/reset | Real provider UI runs only after Firebase configuration; password is never placed in MemoCare storage |
| Google / phone OTP | Provider or reCAPTCHA opens; cancellation returns a clear state |
| Language | English/Hindi/Urdu navigation and critical controls update; Urdu sets full-document RTL; date/time locale changes |
| Voice dictation | One session at a time; typed text remains editable; cancel/clear/timeout work |
| Voice denied/unsupported | Clear denied/unsupported state; typed fallback remains usable |
| Speech playback | Read, pause, resume, replay, stop, speed, and voice controls work when exposed |
| Map | Map sizes after render; no location prompt on page load |
| Location denied/unavailable/timeout | Plain-language status and retry; no false tracking claim |
| Safe place CRUD | Add/edit/delete persists; directions opens external map |
| Location sharing/watch | Sharing requires action; continuous watch requires explicit opt-in and shows active status |
| Safety zone | Home coordinates and radius render; outside transition rings once, shows directions, and records endpoint delivery/pending handoff honestly |
| Medication CRUD | All fields persist; edit/delete confirmations work; duplicate warning appears |
| Dose outcomes | Taken/skipped/postponed/missed history persists; taken confirmation and undo work |
| Low stock | Stock at/below threshold shows warning |
| Import/export | Export downloads JSON; valid import restores; invalid import is rejected |
| Corrupted storage | Raw value is isolated; safe profile opens with recovery message |
| Emergency | Direct configured phone links work; no delivery is claimed; location and lost mode request permission |
| Check-in/emergency delivery | Saved number is used; HTTPS endpoint success is `delivered`; absent/failed endpoint is visibly pending and opens a prepared message |
| Alarms | Enabling unlocks sound; matching medicine/reminder/appointment rings once per minute; as-needed medicine does not auto-ring |
| Games | Matching, sequence, and word recall work with mouse, keyboard and touch; reset controls restore state |
| Face recognition | Models load, photo enrollment creates 128-value descriptor, camera start/stop cleans tracks, unknown state is clear |
| Puter AI | Prompt submits through Puter.js; errors are visible; output is escaped; safety prompt blocks diagnosis/dosage guidance |
| Accessibility | Keyboard-only flow, focus rings, skip link, text size, contrast, large buttons, reduced motion, and simplified home/navigation work |
| Offline/PWA | Reload after first online visit loads shell; offline indicator shows; cross-origin auth/map calls are not cached as private data |
| Mobile navigation | Bottom nav stays reachable without covering content; desktop sidebar is hidden |

## Web Serial and demo acceptance

- [ ] Unsupported browser clearly recommends demo/Chromium desktop
- [ ] Permission cancellation does not change device state
- [ ] Connect displays the selected USB identifiers where available
- [ ] Accidental disconnect clears busy state and pending waiters
- [ ] Reconnect succeeds after reselecting the device
- [x] Demo emits ordered rotating/aligned/flap/dispensed/ready states (automated test)
- [ ] Real successful dispense follows the documented response sequence
- [ ] `BUSY` prevents overlapping device commands
- [ ] Alignment timeout never opens the flap from the web workflow
- [ ] Flap timeout records failure and never marks a dose taken
- [ ] Emergency stop closes the flap and resolves to `READY`
- [ ] A missing pill logs failure and offers one controlled, explicit retry only
- [ ] Serial log shows newline commands/responses

## Firmware bench acceptance (pills removed)

- [ ] Sketch compiles for the documented target board with its Servo library
- [ ] Both servos use external regulated 5 V power and common ground
- [ ] Startup moves/holds flap safely closed without repeated jumps
- [ ] Each compartment aligns after calibration
- [ ] Automatic flap cannot open before `ALIGNED:n`
- [ ] Commands during movement return `BUSY`
- [ ] `STOP` is accepted in every state and closes the flap
- [ ] USB reconnect does not trigger a dispense or repeated sudden movement
- [ ] Manual controls require a user confirmation in the web app

Unchecked items require an actual supported browser/provider/device or calibrated hardware and must be completed before clinical or unsupervised prototype use.

### Current workspace verification boundary

The automated suite passes. Visual browser automation could not start in the current restricted workspace because the browser runner was not permitted to bind its control socket. Desktop/mobile visual acceptance, real camera recognition, map tiles/geolocation, alarm audibility, Puter sign-in, and a real caregiver endpoint must therefore be completed in a normal Chrome/Edge environment before exhibition use.
