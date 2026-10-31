import { Injectable, InjectionToken, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface RoomCredential {
  readonly actorId: string;
  readonly token: string;
  readonly role: 'host' | 'player';
}
export const SESSION_STORAGE = new InjectionToken<Storage | null>('Room session storage', {
  providedIn: 'root',
  factory: () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  },
});
const KEY = 'quiz-session-v1';

@Injectable({ providedIn: 'root' })
export class SessionContext {
  private readonly storage = inject(SESSION_STORAGE);
  private read(): Record<string, RoomCredential> {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(KEY) ?? '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(
          ([, c]) =>
            c &&
            typeof c.actorId === 'string' &&
            typeof c.token === 'string' &&
            (c.role === 'host' || c.role === 'player'),
        ),
      );
    } catch {
      return {};
    }
  }
  readonly changes = new BehaviorSubject<Record<string, RoomCredential>>(this.read());
  get(roomId: string) {
    return this.changes.value[roomId];
  }
  set(roomId: string, credential: RoomCredential) {
    this.save({ ...this.changes.value, [roomId]: credential });
  }
  clear(roomId: string) {
    const next = { ...this.changes.value };
    delete next[roomId];
    this.save(next);
  }
  private save(next: Record<string, RoomCredential>) {
    try {
      this.storage?.setItem(KEY, JSON.stringify(next));
    } catch {
      /* In-tab identity remains usable when storage is blocked. */
    }
    this.changes.next(next);
  }
}
