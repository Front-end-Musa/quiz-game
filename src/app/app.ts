import { Component, inject } from '@angular/core';
import { FirebaseConnection } from './core/infrastructure/firebase/firebase-connection';
import { OwnerAccess } from './core/infrastructure/firebase/owner-access';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly firebase = inject(FirebaseConnection, { optional: true });
  readonly owner = inject(OwnerAccess, { optional: true });
  constructor() { void this.firebase?.ready().catch(() => {}); }
}
