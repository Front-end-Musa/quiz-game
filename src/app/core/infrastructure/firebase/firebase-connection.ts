import { Injectable, signal } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, getAuth, GoogleAuthProvider, onAuthStateChanged,
  signInAnonymously, signInWithPopup, User, browserSessionPersistence, setPersistence,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail, EmailAuthProvider,
  linkWithCredential, updatePassword, reauthenticateWithPopup,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { environment } from '../../../../environments/environment';

/** Public web configuration; authorization lives in Firestore Rules. */
export const firebaseConfig = {
  apiKey: 'AIzaSyBbQWe-YLBvdrgv5V2-vJVeaUc96jRHvlc',
  authDomain: 'quiz-game-19c55.firebaseapp.com',
  projectId: 'quiz-game-19c55',
  storageBucket: 'quiz-game-19c55.firebasestorage.app',
  messagingSenderId: '720114715199',
  appId: '1:720114715199:web:e6a8f53a2a22a6f35f068a',
};

@Injectable()
export class FirebaseConnection {
  readonly app = initializeApp({ ...firebaseConfig,
    ...(environment.firebaseEmulators ? { projectId: 'demo-quiz-game' } : {}),
  }, 'quiz-game');
  readonly auth = getAuth(this.app);
  readonly db = getFirestore(this.app);
  readonly user = signal<User | null>(null);
  readonly error = signal('');
  readonly status = signal('Подключаемся…');
  private pending?: Promise<User>;
  private adminSessionActive = false;

  constructor() {
    if (environment.firebaseEmulators) {
      connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(this.db, '127.0.0.1', 8080);
    }
    let initialAuthState = true;
    onAuthStateChanged(this.auth, (user) => {
      this.user.set(user);
      if (user) this.pending = Promise.resolve(user);
      else if (!initialAuthState) this.pending = undefined;
      initialAuthState = false;
    });
  }

  ready(): Promise<User> {
    return this.pending ??= this.authenticate().catch((error: unknown) => {
      this.pending = undefined;
      this.error.set('Не удалось подключиться. Проверьте интернет и настройки входа.');
      this.status.set('Нет подключения');
      throw error;
    });
  }

  private async authenticate() {
    await this.auth.authStateReady();
    const user = this.auth.currentUser ?? (await signInAnonymously(this.auth)).user;
    this.user.set(user);
    this.status.set('Подключено');
    this.error.set('');
    return user;
  }

  async google(sessionOnly = false): Promise<boolean> {
    this.error.set('');
    try {
      if (sessionOnly) await this.adminSession();
      const result = await signInWithPopup(this.auth, new GoogleAuthProvider());
      this.user.set(result.user);
      this.pending = Promise.resolve(result.user);
      this.status.set('Подключено');
      return true;
    } catch {
      this.error.set('Не удалось войти через Google. Разрешите всплывающее окно и проверьте разрешённый домен.');
      return false;
    }
  }

  async password(email: string, password: string) {
    await this.adminSession();
    const result = await signInWithEmailAndPassword(this.auth, email, password);
    this.pending = Promise.resolve(result.user);
    this.user.set(result.user);
    this.error.set('');
    this.status.set('Подключено');
  }
  resetPassword(email: string) { return sendPasswordResetEmail(this.auth, email); }
  async adminSession() {
    if (!this.adminSessionActive) {
      await setPersistence(this.auth, browserSessionPersistence);
      this.adminSessionActive = true;
    }
  }
  async logout() {
    await signOut(this.auth);
    this.pending = undefined;
    this.adminSessionActive = false;
    this.user.set(null);
    this.error.set('');
    this.status.set('Вы вышли');
  }
  async reauthenticate() {
    if (!this.auth.currentUser) throw new Error('Войдите заново.');
    await reauthenticateWithPopup(this.auth.currentUser, new GoogleAuthProvider());
  }
  async setOwnerPassword(password: string) {
    const user = this.auth.currentUser;
    if (!user?.email) throw new Error('Войдите через Google.');
    if (user.providerData.some((provider) => provider.providerId === 'password')) await updatePassword(user, password);
    else await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
  }

  report(error: unknown) {
    const code = (error as { code?: string })?.code;
    this.error.set(code === 'permission-denied'
      ? 'Нет доступа к данным. Проверьте правила базы и разрешения ведущего.'
      : 'Данные не загрузились. Проверьте интернет и повторите действие.');
  }
}
