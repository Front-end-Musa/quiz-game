import { DevelopmentTools, DevelopmentAction } from '../../ports/development-tools';
import { normalizeNickname } from '../../domain/nickname';
import { Injectable, inject, isDevMode } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MockRoomGateway } from './mock-room.gateway';

@Injectable()
export class MockPlayerSimulator implements DevelopmentTools {
  readonly enabled = isDevMode();
  control(code: string, action: DevelopmentAction, roundId: string) {
    return this.rooms.developerAction(code, action, roundId);
  }
  private readonly rooms = inject(MockRoomGateway);
  playLocally(code: string) {
    return this.rooms.playLocally(code);
  }
  add(code: string, name: string) {
    return this.rooms.addSimulated(code, name);
  }
  reset(code: string) {
    return this.rooms.resetSimulated(code);
  }
  async nickname(code: string) {
    const state = await firstValueFrom(this.rooms.observe(code));
    const used = new Set(
      [state?.room.hostNickname, ...(state?.players.map((p) => p.displayName) ?? [])].map((n) =>
        n ? normalizeNickname(n) : undefined,
      ),
    );
    const names = [
      'Смелый Барсук',
      'Быстрый Лис',
      'Мудрая Сова',
      'Весёлый Кит',
      'Ловкий Кот',
      'Тихий Ёж',
    ];
    const base = names[crypto.getRandomValues(new Uint8Array(1))[0] % names.length];
    let name = base;
    let suffix = 2;
    while (used.has(normalizeNickname(name))) name = `${base} ${suffix++}`;
    return name;
  }
}
