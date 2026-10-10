// Bundled into js/vendor/firebase.js by `npm run vendor:firebase`. Only the
// pieces family sharing uses: Google sign-in and the Firestore database.
export { initializeApp } from 'firebase/app';
export {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from 'firebase/auth';
export {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  getDocsFromServer,
  writeBatch,
} from 'firebase/firestore';
