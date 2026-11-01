import { Provider } from '@angular/core';
import { QUIZ_REPOSITORY } from '../../ports/quiz-repository';
import { ROOM_GATEWAY } from '../../ports/room-gateway';
import { RESULT_REPOSITORY } from '../../ports/result-repository';
import { FirebaseConnection } from './firebase-connection';
import { FirestoreQuizRepository, FirestoreResultRepository } from './firestore-repositories';
import { FirestoreRoomGateway } from './firestore-room.gateway';
import { OwnerAccess } from './owner-access';
import { AdminRepository } from './admin.repository';
import { GameDefaultsRepository } from './game-defaults.repository';

export function provideFirebase(): Provider[] {
  return [FirebaseConnection, FirestoreQuizRepository, FirestoreRoomGateway, OwnerAccess, AdminRepository, GameDefaultsRepository,
    { provide: QUIZ_REPOSITORY, useExisting: FirestoreQuizRepository },
    { provide: ROOM_GATEWAY, useExisting: FirestoreRoomGateway },
    { provide: RESULT_REPOSITORY, useClass: FirestoreResultRepository }];
}
