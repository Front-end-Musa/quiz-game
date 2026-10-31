import { Component, input } from '@angular/core';
@Component({
  selector: 'app-form-field',
  template: `<div class="form-field">
    <label [for]="fieldId()">{{ label() }}</label
    ><ng-content />
    @if (hint()) {
      <small [id]="fieldId() + '-hint'">{{ hint() }}</small>
    }
    @if (error()) {
      <p class="field-error" [id]="fieldId() + '-error'" role="alert">{{ error() }}</p>
    }
  </div>`,
})
export class FormField {
  readonly fieldId = input.required<string>();
  readonly label = input.required<string>();
  readonly hint = input('');
  readonly error = input('');
}
