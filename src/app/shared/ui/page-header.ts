import { Component, input } from '@angular/core';
@Component({
  selector: 'app-page-header',
  template: `<header class="page-heading">
    <p class="eyebrow">{{ eyebrow() }}</p>
    <h1>{{ title() }}</h1>
    @if (description()) {
      <p class="lead">{{ description() }}</p>
    }
    <ng-content />
  </header>`,
})
export class PageHeader {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input('');
}
