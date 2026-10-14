import { Game } from '../src/sim/game';
import { createInitialState } from '../src/core/state';

export const T0 = 1_700_000_000_000;

export function newGame(seed = 42, mutate?: (g: Game) => void): Game {
  const state = createInitialState(T0, seed);
  const g = new Game(state, { seed, now: () => T0 });
  mutate?.(g);
  return g;
}

/** A game with the shop open and some cash. */
export function openGame(seed = 42, money = 0): Game {
  const g = newGame(seed);
  g.shopMgr.openShop();
  if (money) g.economy.earn(money, false);
  return g;
}

export function setLevel(g: Game, level: number): void {
  g.state.player.level = level;
}
