# MemoCare repository audit

Audit date: 2026-07-31
Audited branch baseline: `main`

## Scope inspected

All HTML, CSS, JavaScript, manifests, service worker files, icons, face-recognition model manifests/shards, map/geolocation code, camera/QR code, voice code, authentication UI, reminders, local storage, PWA paths, and Arduino additions were reviewed. Local asset references, JavaScript source, inline scripts, locales, manifest icons, and model files were also checked mechanically.

## Findings and fixes

| Area | Baseline finding | Resolution |
|---|---|---|
| Architecture | Main features were spread across oversized pages with inline styles/scripts, global functions, and duplicated listeners | Added a modular SPA (`js/*`, `css/*`, `locales/*`) while keeping legacy tools available |
| Buttons | Contact add handler was wired multiple times; medicine delete button had no label; AI navigation called an undefined function; game links were broken | Removed duplicate wiring, labelled/fixed actions, corrected navigation, and routed legacy emergency buttons to real help |
| Console/runtime | Unguarded JSON parsing could halt multiple pages; missing `dark-mode.css`; fragile IDs/field names in `medicine.html` | Added validated storage/recovery, compatibility CSS, corrected ID coercion and medication field handling |
| Assets/paths | Games linked to missing `games/index.html`; one manifest omitted icons; two manifests conflicted | Corrected links and consolidated to one valid manifest |
| PWA | Service worker logged install but cached nothing and had no fetch strategy | Added versioned app-shell precache, navigation fallback, safe same-origin runtime caching, activation cleanup, and no cross-origin auth caching |
| Mobile layout | Legacy multipage navigation and cards were dense/inconsistent | Added responsive 390 px/narrow-mobile, tablet, and desktop layouts with bottom nav/sidebar |
| Accessibility | Small/inconsistent controls, weak focus visibility, missing high-contrast/reduced-motion controls, colour-dependent status | Added semantic shell, skip link, labelled controls, large touch targets, visible focus, text sizing, high contrast, reduced motion, large-button, simplified mode, and text status |
| Storage | Plain scattered LocalStorage access, corrupted JSON crashes, no schema/import validation | Added one versioned data layer, legacy migration, schema normalization, corruption isolation, validated import/export, and delete-all confirmation |
| Authentication | Passwords were stored in browser data and the UI implied authentication without a provider | Removed credential storage; added an optional real Firebase adapter for email/password, Google, phone OTP, reset, persistence, and logout; guest remains usable |
| Voice | Recognition logic was scattered and lacked overlap prevention, reliable state, silence timeout, or graceful fallback | Added one voice service with language selection, typed fallback, editable/preserved transcript, cancel/clear, timeout, and speech playback controls |
| Maps | Legacy safety page began continuous `watchPosition` on load and used paid/remote routing assumptions | Main app uses Leaflet/OSM without a paid key, explicit one-shot location, opt-in watch only, permission/error states, safe places, share and external directions; legacy page now uses one-shot lookup |
| Emergency | Several pages falsely claimed family was notified or help was on the way | Removed delivery claims and routed users to direct calls/location controls; delivery is never claimed without a real service |
| Medications | Limited fields, broken details lookup, no schedule state/history/stock/undo | Added comprehensive medicine data, timeline, taken/skipped/postponed/missed outcomes, adherence, stock warnings, duplicate warnings, confirmations, and undo |
| QR/camera | Untrusted scanned/entered values were injected into HTML; malformed QR URLs could throw | Added length limits, escaping, safe URL parsing, explicit camera request, stop/retry states, and fixed visible delete action |
| Profiles/people | Legacy profile storage had no central validation and duplicate add handlers | Added normalized people/profile data and fixed duplicate wiring; new Important People supports photo, phone, relationship, memories, identification and voice input |
| Caregiver | Dashboard could imply remote visibility/delivery without authorization | Added privacy toggles and honest local summaries; server-backed linking/alerts remain disabled until authorization and confirmed delivery exist |
| Code quality | Duplicate CSS/listeners, inline onclick use, globals, dead manifest, mojibake, unreachable/brittle code | New app uses modules and delegated listeners; dead manifest removed; critical legacy mojibake/actions repaired without deleting working games/face tools |
| Arduino | No device integration or firmware existed | Added a protocol module, Web Serial service, safe demo, UI/logs/timeouts/retry/STOP, and non-blocking two-servo firmware |
| Reported post-merge failures | Role login was one mixed form; games/face tools remained disconnected legacy pages; alarms were absent; map had no resize/tile fallback; safety/lost/check-in events were local-only; simplified mode mainly hid CSS details | Added distinct Patient/Caregiver panels, integrated games and face recognition from scratch, active simplified-home/navigation behavior, schedule alarms, laptop map resizing/fallback, safety-zone monitoring/directions, Puter AI, and verified caregiver endpoint/message handoff states |

## Security review

- No service-account JSON, service-role key, password, or private credential is committed.
- `config/auth-config.js` is intentionally unconfigured and documents public client configuration only.
- Dynamic content in the new application is escaped before HTML rendering.
- Sensitive guest records stay in the current browser unless the user exports them.
- Private authenticated API responses are not cached by the service worker.

## Features that looked functional but were not

- Original authentication was local credential storage, not identity-provider authentication.
- Emergency overlays claimed notification delivery without a notification transport.
- Original service worker did not provide offline behavior.
- The legacy medicine details page looked up numeric IDs as strings and used inconsistent property names.
- Continuous location began without a direct user choice.
- The empty medicine delete control was visually present but unusable.
- Some game “Games” navigation targeted a file that did not exist.

## Audit outcome

The primary experience is the modular application at `index.html`. Games and face recognition are now first-class SPA routes rather than depending on legacy pages. Legacy pages remain for backward-compatible bookmarks.
