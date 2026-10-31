export interface PlayerAnswer {
  readonly id: string;
  readonly commandId: string;
  readonly roomId: string;
  readonly playerId: string;
  readonly questionId: string;
  readonly roundIndex: number;
  readonly optionId: string;
  readonly acceptedAt: number;
}
