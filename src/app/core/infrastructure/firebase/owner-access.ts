import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { onIdTokenChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { CanActivateFn, Router } from '@angular/router';
import { FirebaseConnection } from './firebase-connection';
import { OWNER_EMAIL } from '../../domain/admin-quiz';

@Injectable()
export class OwnerAccess {
  private readonly connection = inject(FirebaseConnection);
  readonly allowed = signal(false);
  readonly checking = signal(true);
  private generation = 0;
  private activeUid?: string;
  private stopOwner = () => {};
  constructor() {
    const stopAuth = onIdTokenChanged(this.connection.auth, (user) => {
      const generation = ++this.generation;
      this.checking.set(true);
      // Preserve the editor during a routine refresh of the same owner's token.
      // A changed identity loses access immediately, before any asynchronous reads.
      if (user?.uid !== this.activeUid || !user) this.allowed.set(false);
      this.activeUid = user?.uid;
      this.stopOwner();
      if (!user) { this.checking.set(false); return; }
      void this.hasClaim(user).then((eligible) => {
        if (generation !== this.generation) return;
        if (!eligible) { this.allowed.set(false); this.checking.set(false); return; }
        this.stopOwner = onSnapshot(doc(this.connection.db, 'adminConfiguration', 'owner'), (snapshot) => {
          const owner = snapshot.data();
          if (generation === this.generation) this.allowed.set(owner?.['enabled'] === true &&
            owner['uid'] === user.uid && owner['email'] === OWNER_EMAIL);
          this.checking.set(false);
        }, () => { if (generation === this.generation) { this.allowed.set(false); this.checking.set(false); } });
      }).catch(() => { if (generation === this.generation) { this.allowed.set(false); this.checking.set(false); } });
    });
    inject(DestroyRef).onDestroy(() => { ++this.generation; stopAuth(); this.stopOwner(); });
  }
  private async hasClaim(user: User, refresh = false) {
    if (!user.emailVerified || user.email?.toLowerCase() !== OWNER_EMAIL) return false;
    return (await user.getIdTokenResult(refresh)).claims['admin'] === true;
  }
  async check(refresh = false): Promise<boolean> {
    try {
      await this.connection.ready();
      const user = this.connection.auth.currentUser;
      if (!user || !await this.hasClaim(user, refresh)) return false;
      const owner = (await getDoc(doc(this.connection.db, 'adminConfiguration', 'owner'))).data();
      const allowed = owner?.['enabled'] === true && owner['uid'] === user.uid && owner['email'] === OWNER_EMAIL;
      this.allowed.set(allowed);
      return allowed;
    } catch { this.allowed.set(false); return false; }
  }
}
export const ownerGuard: CanActivateFn = async () => {
  const access = inject(OwnerAccess, { optional: true });
  const connection = inject(FirebaseConnection, { optional: true });
  const router = inject(Router);
  if (!await access?.check()) return router.createUrlTree(['/admin/login']);
  await connection?.adminSession();
  return true;
};
