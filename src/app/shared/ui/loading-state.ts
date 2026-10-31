import { Component, input } from '@angular/core';
@Component({
  selector: 'app-loading-state',
  template: `<div class="loading-state" role="status">
    <span class="loading-dot" aria-hidden="true"></span>{{ label() }}
  </div>`,
})
export class LoadingState {
  readonly label = input('Секундочку, всё готовим…');
}
