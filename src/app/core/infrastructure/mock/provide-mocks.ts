import { BrowserRoomStore, ROOM_STORE } from './room-store';
import { Provider } from '@angular/core';
import { QUIZ_REPOSITORY } from '../../ports/quiz-repository';
import { ROOM_GATEWAY } from '../../ports/room-gateway';
import { RESULT_REPOSITORY } from '../../ports/result-repository';
import { MockQuizRepository } from './mock-quiz.repository';
import { MockRoomGateway } from './mock-room.gateway';
import { MockResultRepository } from './mock-result.repository';

/** Replace these bindings with Firebase adapters when backend work begins. */
export function provideMocks(): Provider[] {
  return [
    { provide: QUIZ_REPOSITORY, useClass: MockQuizRepository },
    BrowserRoomStore,
    { provide: ROOM_STORE, useExisting: BrowserRoomStore },
    MockRoomGateway,
    { provide: ROOM_GATEWAY, useExisting: MockRoomGateway },
    { provide: RESULT_REPOSITORY, useClass: MockResultRepository },
  ];
}
