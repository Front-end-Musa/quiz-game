import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MockRoomGateway } from './mock-room.gateway';

@Injectable({ providedIn: 'root' })
export class MockPlayerSimulator {
  private readonly rooms = inject(MockRoomGateway);
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
        n?.toLocaleLowerCase('ru'),
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
    while (used.has(name.toLocaleLowerCase('ru'))) name = `${base} ${suffix++}`;
    return name;
  }
}
