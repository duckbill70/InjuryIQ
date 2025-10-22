import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import auth, {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  signInAnonymously as fbSignInAnonymously,
  FirebaseAuthTypes,
  signInWithCredential,
  GoogleAuthProvider,
} from '@react-native-firebase/auth';
import { getApps, getApp } from '@react-native-firebase/app';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

type AuthContextValue = {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInAnonymously: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
//const authInstance = auth();

//New Code
// Ensure the default app exists, then reuse it everywhere in this module.
function ensureApp() {
  if (getApps().length === 0) {
    // For React Native Firebase, the app is typically auto-initialized
    // If not, we need to initialize it with proper config
    console.warn('Firebase app not found - this should be auto-initialized in React Native');
    // In production, this would need proper configuration
    // For now, just return null and let the auth() call handle it
    return null;
  }
  return getApp(); // "[DEFAULT]"
}

const app = ensureApp();           // <-- key change
const authInstance = auth(app || undefined);    // bind auth to the default app
//End new code

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    //Google SignIn Credts from Firebase
    GoogleSignin.configure({
      webClientId: '617743365174-dijqqb2ep90cuvuhttm4q77iuvvo1jbi.apps.googleusercontent.com'
    })

    const unsub = onAuthStateChanged(authInstance, u => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const api = useMemo<AuthContextValue>(() => ({
    user,
    loading,

    async signInWithGoogle() {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true }); // no-op on iOS
      await GoogleSignin.signIn();

      const { idToken } = await GoogleSignin.getTokens();
      if (!idToken) throw new Error('No idToken from Google Sign-In. Check webClientId and iOS URL scheme.');
     
      const cred = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(authInstance, cred);
    },

    async signUp(email, password) {
      await createUserWithEmailAndPassword(authInstance, email.trim(), password);
    },
    async signIn(email, password) {
      await signInWithEmailAndPassword(authInstance, email.trim(), password);
    },
    async signOut() {
      //Google Clean Up
      try {
        await GoogleSignin.signOut
      } catch {}
      await fbSignOut(authInstance);
    },
    async signInAnonymously() {
      await fbSignInAnonymously(authInstance);
    },
    async sendPasswordReset(email) {
      await sendPasswordResetEmail(authInstance, email.trim());
    },
  }), [user, loading]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
