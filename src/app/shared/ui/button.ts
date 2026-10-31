import { Directive, input } from '@angular/core';

/** Native buttons and links retain keyboard, submit and navigation semantics. */
@Directive({
  selector: 'button[appButton], a[appButton]',
  host: {
    class: 'button',
    '[class.secondary]': 'variant() === "secondary"',
    '[class.dark]': 'variant() === "dark"',
  },
})
export class Button {
  readonly variant = input<'primary' | 'secondary' | 'dark'>('primary');
}
