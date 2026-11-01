import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'admin', title: 'Управление — Квиз Круг', loadChildren: () => import('./features/admin/admin.routes').then((module) => module.adminRoutes) },
  {
    path: '',
    pathMatch: 'full',
    title: 'Квиз Круг — играем вместе',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'quizzes',
    title: 'Выбираем тему — Квиз Круг',
    loadComponent: () =>
      import('./features/quiz-library/quiz-library.page').then((m) => m.QuizLibraryPage),
  },
  {
    path: 'quiz/:quizId',
    title: 'О викторине — Квиз Круг',
    loadComponent: () =>
      import('./features/quiz-library/quiz-detail.page').then((m) => m.QuizDetailPage),
  },
  {
    path: 'create-room/:quizId',
    title: 'Новая комната — Квиз Круг',
    loadComponent: () =>
      import('./features/room-setup/create-room.page').then((m) => m.CreateRoomPage),
  },
  {
    path: 'join',
    title: 'Присоединиться — Квиз Круг',
    loadComponent: () => import('./features/join/join.page').then((m) => m.JoinPage),
  },
  {
    path: 'lobby/:roomCode',
    title: 'Все в сборе? — Квиз Круг',
    loadComponent: () => import('./features/host/lobby.page').then((m) => m.LobbyPage),
  },
  {
    path: 'game/:roomCode',
    title: 'Игра — Квиз Круг',
    loadComponent: () => import('./features/player/game.page').then((m) => m.GamePage),
  },
  {
    path: 'results/:roomCode',
    title: 'Результаты — Квиз Круг',
    loadComponent: () => import('./features/results/results.page').then((m) => m.ResultsPage),
  },
  {
    path: 'leaderboard',
    title: 'Таблица результатов — Квиз Круг',
    loadComponent: () =>
      import('./features/results/leaderboard.page').then((m) => m.LeaderboardPage),
  },
  {
    path: '**',
    title: 'Страница не найдена — Квиз Круг',
    loadComponent: () => import('./features/home/not-found.page').then((m) => m.NotFoundPage),
  },
];
