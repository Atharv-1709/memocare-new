/*
 * ──────────────────────────────────────────────────────────────────────────
 *  MemoCare  ·  Firebase Configuration
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  SETUP (free, ~3 minutes):
 *  1. Go to https://console.firebase.google.com
 *  2. Click "Add project" → give it any name (e.g. "memomemo") → Continue
 *  3. In the project sidebar: Build → Firestore Database → Create database
 *     • Choose "Start in test mode" → Next → pick a region → Enable
 *  4. In the project sidebar: Project Settings (⚙ gear icon)
 *     → "Your apps" → click the </> Web icon → Register app (any name)
 *     → Copy the firebaseConfig object shown
 *  5. Replace `null` below with that config object, for example:
 *
 *     export const firebaseConfig = {
 *       apiKey: "AIza...",
 *       authDomain: "my-project.firebaseapp.com",
 *       projectId: "my-project",
 *       storageBucket: "my-project.appspot.com",
 *       messagingSenderId: "123456789",
 *       appId: "1:123456789:web:abc..."
 *     };
 *
 *  This is a PUBLIC client identifier — it is safe to put in source code.
 *  NEVER place Admin SDK credentials, service-account JSON, passwords,
 *  or private keys here.
 * ──────────────────────────────────────────────────────────────────────────
 */
export const firebaseConfig = {
  apiKey: "AIzaSyAP2jwnWdLQwlupbWjYLCKIFaGpdqQaR6w",
  authDomain: "memocare-new.firebaseapp.com",
  projectId: "memocare-new",
  storageBucket: "memocare-new.firebasestorage.app",
  messagingSenderId: "734803503189",
  appId: "1:734803503189:web:41375598a151c8f7718cdc"
};