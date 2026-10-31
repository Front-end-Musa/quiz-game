import { Component, input } from '@angular/core';
@Component({
  selector: 'app-badge',
  template: `<span class="badge" [attr.data-tone]="tone()"><ng-content /></span>`,
})
export class Badge {
  readonly tone = input<'neutral' | 'success' | 'pending'>('neutral');
}
