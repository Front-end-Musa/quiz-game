import { Injectable, InjectionToken, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MOCK_PLAYERS, MOCK_ROOMS } from '../../../content/quizzes/rooms.mock';
import { GameRoom } from '../../domain/game-room';
import { GamePlayer } from '../../domain/game-player';

export interface StoredRoom {
  readonly room: GameRoom;
  readonly players: readonly GamePlayer[];
  readonly hostToken: string;
  readonly playerTokens: Readonly<Record<string, string>>;
}
export interface RoomStore {
  readonly changes: BehaviorSubject<readonly StoredRoom[] | undefined>;
  readonly persistent: boolean;
  transact<T>(
    change: (rooms: readonly StoredRoom[]) => { rooms: readonly StoredRoom[]; result: T },
  ): Promise<T>;
}
export const ROOM_STORE = new InjectionToken<RoomStore>('LocalRoomStore');
const seed = (): StoredRoom[] =>
  MOCK_ROOMS.map((room) => ({
    room: structuredClone(room),
    players: structuredClone(MOCK_PLAYERS.filter((p) => p.roomId === room.id)),
    hostToken: crypto.randomUUID(),
    playerTokens: {},
  }));

/** Used by tests and as a truthful in-memory fallback when IndexedDB is unavailable. */
export class MemoryRoomStore implements RoomStore {
  readonly persistent = false;
  readonly changes = new BehaviorSubject<readonly StoredRoom[] | undefined>(seed());
  async transact<T>(
    change: (rooms: readonly StoredRoom[]) => { rooms: readonly StoredRoom[]; result: T },
  ): Promise<T> {
    const next = change(this.changes.value ?? []);
    this.changes.next(next.rooms);
    return next.result;
  }
}

@Injectable()
export class BrowserRoomStore implements RoomStore, OnDestroy {
  readonly changes = new BehaviorSubject<readonly StoredRoom[] | undefined>(undefined);
  private database: IDBDatabase | null = null;
  private channel: BroadcastChannel | null = null;
  private readonly ready = this.initialize();
  get persistent() {
    return this.database !== null;
  }

  private async initialize() {
    try {
      this.database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('quiz-local-rooms-v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Database blocked'));
      });
      await this.write((rooms) => ({ rooms, result: undefined }));
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('quiz-local-rooms-v1');
        this.channel.onmessage = () => {
          void this.reload().catch(() => undefined);
        };
      }
      this.database.onversionchange = () => {
        this.database?.close();
        this.database = null;
      };
    } catch {
      this.database?.close();
      this.database = null;
      this.changes.next(seed());
    }
  }

  async transact<T>(
    change: (rooms: readonly StoredRoom[]) => { rooms: readonly StoredRoom[]; result: T },
  ): Promise<T> {
    await this.ready;
    if (!this.database) {
      const next = change(this.changes.value ?? seed());
      this.changes.next(next.rooms);
      return next.result;
    }
    const result = await this.write(change);
    this.channel?.postMessage('updated');
    return result;
  }

  private write<T>(
    change: (rooms: readonly StoredRoom[]) => { rooms: readonly StoredRoom[]; result: T },
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = this.database!.transaction('state', 'readwrite');
      const store = transaction.objectStore('state');
      const read = store.get('rooms');
      let next: { rooms: readonly StoredRoom[]; result: T };
      read.onsuccess = () => {
        try {
          next = change(read.result ?? seed());
          store.put(next.rooms, 'rooms');
        } catch {
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        this.changes.next(next.rooms);
        resolve(next.result);
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('Room storage failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Room storage aborted'));
    });
  }

  private reload() {
    return new Promise<void>((resolve, reject) => {
      if (!this.database) return resolve();
      const transaction = this.database.transaction('state', 'readonly');
      const read = transaction.objectStore('state').get('rooms');
      read.onsuccess = () => {
        this.changes.next(read.result ?? []);
        resolve();
      };
      read.onerror = () => reject(read.error);
    });
  }
  ngOnDestroy() {
    this.channel?.close();
    this.database?.close();
  }
}
