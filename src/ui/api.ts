import type { Game } from '../sim/game';
import type { SfxName } from '../audio/audio';

export type PlacementRequest = { kind: string; mode: 'buy' } | { kind: string; mode: 'move'; uid: number } | { kind: string; mode: 'pending'; index: number };

export interface ConfirmOpts {
  icon: string;
  title: string;
  text: string;
  okLabel: string;
  onOk: () => void;
  danger?: boolean;
}

/** What panels and widgets may ask of the app (keeps them decoupled from UIManager). */
export interface AppApi {
  readonly game: Game;
  startPlacement(req: PlacementRequest): void;
  confirm(opts: ConfirmOpts): void;
  openPanel(id: string | null): void;
  toast(text: string, icon?: string, kind?: 'info' | 'good' | 'bad' | 'gold'): void;
  showAchievements(): void;
  sfx(name: SfxName): void;
  spendFeedback(amount: number): void;
}
