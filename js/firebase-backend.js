// Family sharing on Firebase: Google sign-in + a Firestore database.
// Loaded only on phones where sharing is set up.
//
// Data lives under families/{familyId}/{units|slots|parts}/{id}. Who may read
// and write it is decided by the Firestore security rules (see firestore.rules),
// not by this code.

import { COLLECTIONS } from './sync.js';

const BATCH_LIMIT = 450; // Firestore allows 500 writes per batch

export async function connectFirebase(config, familyId, { loadSdk = () => import('./vendor/firebase.js') } = {}) {
  const fb = await loadSdk();
  const app = fb.initializeApp(config);
  const auth = fb.getAuth(app);
  // Keeps a copy on the phone, so the catalog works offline and edits sync when back online.
  const db = fb.initializeFirestore(app, {
    localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
  });
  const ref = (col) => fb.collection(db, 'families', familyId, col);

  // Finish a sign-in that fell back to a full-page redirect (popup blocked).
  fb.getRedirectResult(auth).catch(() => {});

  return {
    onUser(callback) {
      return fb.onAuthStateChanged(auth, callback);
    },
    async signIn() {
      const provider = new fb.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await fb.signInWithPopup(auth, provider);
      } catch (err) {
        if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/operation-not-supported-in-this-environment') {
          await fb.signInWithRedirect(auth, provider);
          return;
        }
        if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
        throw err;
      }
    },
    signOut() {
      return fb.signOut(auth);
    },

    backend: {
      async fetchAll() {
        const data = {};
        for (const col of COLLECTIONS) {
          const snap = await fb.getDocsFromServer(ref(col));
          data[col] = snap.docs.map((d) => d.data());
        }
        return data;
      },
      subscribe(onData, onError) {
        const stops = COLLECTIONS.map((col) =>
          fb.onSnapshot(ref(col), (snap) => onData(col, snap.docs.map((d) => d.data())), onError),
        );
        return () => stops.forEach((stop) => stop());
      },
      async write({ upserts, deletes }) {
        const ops = [
          ...upserts.map((u) => (batch) => batch.set(fb.doc(ref(u.col), u.id), u.data)),
          ...deletes.map((d) => (batch) => batch.delete(fb.doc(ref(d.col), d.id))),
        ];
        for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
          const batch = fb.writeBatch(db);
          ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
          await batch.commit();
        }
      },
    },
  };
}

/** Plain-language messages for the errors people will actually hit. */
export function syncErrorMessage(err) {
  const code = err?.code ?? '';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return "This Google account isn't on the family list. Sign in with a family account.";
  }
  if (code === 'unavailable' || code === 'firestore/unavailable') return "You're offline. Changes will sync when you're back online.";
  if (code === 'auth/unauthorized-domain') return 'This web address is not allowed to sign in yet. Add it under Firebase → Authentication → Settings → Authorized domains.';
  if (code === 'auth/network-request-failed') return 'Could not reach Google. Check your internet connection.';
  return err?.message || 'Something went wrong with sharing.';
}
