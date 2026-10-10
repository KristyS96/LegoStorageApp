// Family sharing settings. Fill FIREBASE_CONFIG in from the Firebase console:
// Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config.
// These values only identify the project and are safe to publish; who can read
// and write the data is controlled by the security rules (firestore.rules).
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBiAl8wWUrOVvB6OZo4HqqPzUIAaqj_etA',
  authDomain: 'lego-storage-24393.firebaseapp.com',
  projectId: 'lego-storage-24393',
  storageBucket: 'lego-storage-24393.firebasestorage.app',
  messagingSenderId: '511966520632',
  appId: '1:511966520632:web:63a1d63a338e881d45cdcd',
  measurementId: 'G-2WBQWGVNZM',
};

// All family data is stored under families/{FAMILY_ID}.
export const FAMILY_ID = 'family';
