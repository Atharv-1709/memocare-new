# Remaining limitations

MemoCare is deployable and functional as a static PWA, but several capabilities depend on external setup or hardware and are deliberately not simulated as successful:

- Cloud sign-in requires the project owner’s Firebase web client configuration and enabled providers.
- Authorized patient/caregiver linking, guest-to-cloud migration, and health-data sync require a backend with access-control rules.
- Automatic caregiver SMS/push delivery requires an owner-configured HTTPS notification endpoint. Without it, the app honestly opens a prepared SMS/WhatsApp handoff and records `pending`, not `delivered`.
- Weather requires a weather provider and user consent; the orientation screen remains useful without it.
- Speech recognition, Urdu/Hindi voices, notifications, Web Serial, camera, and share APIs vary by browser/OS.
- Leaflet and live OpenStreetMap-compatible tiles require connectivity; saved place names/addresses remain readable offline. Safety-zone monitoring works only while the Safe Places page is open and the browser permits foreground geolocation.
- Schedule and medicine alarms run while MemoCare is open. Browser/OS background suspension can delay or prevent them, so this prototype must not be the only medication alarm.
- Web Serial is primarily supported on Chromium desktop browsers and requires HTTPS/localhost plus a user-selected device.
- The firmware could not be physically validated without the target board, servos, calibrated mechanics, and external power supply. Follow the bench checklist before loading pills.
- The prototype has no pill identity, presence, jam, weight, or tray-position sensor.
- Integrated face recognition depends on the browser-loaded face-api library, local model files, camera permission, a clear enrolled photo, and good lighting. Accuracy is not guaranteed and it is not identity authentication.
- Puter AI requires internet access and may require the user to sign in/pay through Puter's user-pays model. It must not be used for diagnosis or medication decisions.
- The service worker provides local app-shell/read-only availability, not encrypted multi-device offline synchronization.
- Translation coverage prioritizes navigation, critical controls, core errors, safety states, and main actions; user-entered medicine/person content is never auto-translated.
