import type { GameState } from '../game/types';

const KEY = 'game-of-cat-save-v1';

export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<GameState>;
  return data.version === 1 && typeof data.runId === 'string' && !!data.chapter && !!data.persistent && Array.isArray(data.processedOutcomeIds);
}

export function saveGame(state: GameState): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function loadGame(): GameState | null {
  try { const raw = localStorage.getItem(KEY); if (!raw) return null; const parsed: unknown = JSON.parse(raw); return isGameState(parsed) ? parsed : null; } catch { return null; }
}

export function hasSave(): boolean { return loadGame() !== null; }
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* unavailable storage */ } }

export function exportSave(state: GameState): string { return JSON.stringify(state, null, 2); }
export function importSave(raw: string): GameState { const parsed: unknown = JSON.parse(raw); if (!isGameState(parsed)) throw new Error('This is not a compatible version 1 save.'); return parsed; }
