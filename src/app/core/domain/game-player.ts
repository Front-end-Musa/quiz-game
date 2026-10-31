/** Hosts are room owners, not competing GamePlayers. */
export interface GamePlayer {
  readonly id: string;
  readonly roomId: string;
  readonly displayName: string;
  readonly isMock: boolean;
  readonly joinedOrder: number;
  readonly connectionStatus: 'connected' | 'disconnected';
  readonly participationStatus: 'active' | 'removed';
}
