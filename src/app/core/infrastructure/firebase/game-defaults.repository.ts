import { Injectable, inject } from '@angular/core';
import { doc, getDoc } from 'firebase/firestore';
import { RoomSettings } from '../../domain/game-room';
import { FirebaseConnection } from './firebase-connection';

@Injectable()
export class GameDefaultsRepository {
  private readonly connection = inject(FirebaseConnection);
  async get(): Promise<RoomSettings | null> {
    await this.connection.ready();
    const value = (await getDoc(doc(this.connection.db, 'appSettings', 'gameDefaults'))).data();
    if (!value) return null;
    return { questionCount: value['questionCount'], timeLimitSeconds: value['timeLimitSeconds'],
      pointsPerCorrectAnswer: value['pointsPerCorrectAnswer'], speedBonusPoints: value['speedBonusPoints'],
      minPlayers: value['minPlayers'], maxPlayers: value['maxPlayers'] };
  }
}
