import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FirebaseConnection } from '../../core/infrastructure/firebase/firebase-connection';
import { Button } from '../../shared/ui/button';
import { adminError } from './admin-error';
@Component({
  selector: 'app-admin-account', imports: [ReactiveFormsModule, Button], styleUrl: './admin.scss',
  template: `<section class="stack"><h2>Мой доступ</h2><p>{{ connection.user()?.email }}</p><p>Google и пароль относятся к одной учётной записи. Права владельца нельзя передать из панели.</p>
    <button class="text-button" [disabled]="busy()" (click)="reauthenticate()">Подтвердить вход через Google</button>
    <form class="panel stack" [formGroup]="form" (ngSubmit)="save()"><h3>Установить новый пароль</h3>
      <label>Новый пароль (не менее 12 символов)<input type="password" formControlName="password" autocomplete="new-password" minlength="12" required /></label>
      <label>Повторите пароль<input type="password" formControlName="confirm" autocomplete="new-password" required /></label>
      <button appButton [disabled]="busy() || form.invalid">Сохранить пароль</button>
    </form>
    @if (error()) { <p role="alert">{{ error() }}</p> } @if (notice()) { <p role="status">{{ notice() }}</p> }
  </section>`,
})
export class AdminAccount {
  readonly connection = inject(FirebaseConnection);
  readonly busy = signal(false); readonly error = signal(''); readonly notice = signal('');
  readonly form = new FormGroup({ password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(12)] }),
    confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }) }, {
      validators: (control) => control.get('password')?.value === control.get('confirm')?.value ? null : { mismatch: true },
    });
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try { await action(); } catch (error) { this.error.set(adminError(error)); }
    finally { this.busy.set(false); this.form.reset(); }
  }
  save() { return this.run(async () => { if (this.form.invalid) return; await this.connection.setOwnerPassword(this.form.controls.password.value); this.notice.set('Пароль установлен. Вход через Google также доступен.'); }); }
  reauthenticate() { return this.run(async () => { await this.connection.reauthenticate(); this.notice.set('Вход подтверждён. Можно публиковать изменения и менять пароль.'); }); }
}
