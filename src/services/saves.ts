import { evidenceCatalog, locations } from '../content/gameContent';
import type { BattleReport, GameState, Screen, UnitType } from '../game/types';

const KEY = 'game-of-cat-save-v1';
const screens: Screen[] = ['menu', 'funeral', 'kingdom', 'council', 'map', 'journal', 'battle', 'death', 'ending'];
const unitTypes: UnitType[] = ['infantry', 'archers', 'cavalry'];
const buildingIds = ['keep', 'barracks', 'granary', 'gate'] as const;
const trustIds = ['queen', 'northernLord', 'steward'] as const;
const locationIds = new Set(locations.map((location) => location.id));
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isInt = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isShortString = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const isStringArray = (value: unknown, maxItems = 200): value is string[] => Array.isArray(value) && value.length <= maxItems && value.every((item) => isShortString(item, 500));

function validateUnitCounts(value: unknown, max = 100): value is Record<UnitType, number> {
  return isRecord(value) && unitTypes.every((type) => isInt(value[type], 0, max));
}

function validateBattleReport(value: unknown): value is BattleReport {
  if (!isRecord(value) || !isInt(value.battleId, 0, 100) || !['victory', 'retreat', 'defeat'].includes(String(value.result)) || !isInt(value.ticks, 0, 10000)) return false;
  if (!validateUnitCounts(value.survivors) || !validateUnitCounts(value.casualties) || !validateUnitCounts(value.deployed) || !validateUnitCounts(value.reserves)) return false;
  const survivors = value.survivors as Record<UnitType, number>; const casualties = value.casualties as Record<UnitType, number>; const deployed = value.deployed as Record<UnitType, number>; const reserves = value.reserves as Record<UnitType, number>;
  return unitTypes.every((type) =>
    deployed[type] + reserves[type] === survivors[type] + casualties[type] && deployed[type] >= casualties[type],
  );
}

function validateChapter(value: unknown, label: string): string | null {
  if (!isRecord(value)) return `${label} must be an object.`;
  if (value.chapterId !== 'missing-seal') return `${label}.chapterId is unsupported.`;
  if (!isInt(value.turn, 1, 1000) || !isInt(value.actions, 0, 2) || !isInt(value.publicOrder, 0, 100)) return `${label} contains invalid turn, action, or public-order values.`;
  if (!isRecord(value.resources)) return `${label}.resources is invalid.`;
  if (!['gold', 'food', 'materials'].every((id) => isInt((value.resources as Record<string, unknown>)[id], 0, 1_000_000))) return `${label}.resources is invalid.`;
  if (!isRecord(value.buildingLevels)) return `${label}.buildingLevels is invalid.`;
  if (!buildingIds.every((id) => isInt((value.buildingLevels as Record<string, unknown>)[id], 1, 3))) return `${label}.buildingLevels is invalid.`;
  if (!Array.isArray(value.projects) || value.projects.length > 20 || value.projects.some((project) => !isRecord(project) || !buildingIds.includes(project.building as typeof buildingIds[number]) || !isInt(project.completesOn, 1, 1001))) return `${label}.projects is invalid.`;
  if (!validateUnitCounts(value.army)) return `${label}.army is invalid.`;
  if (!locationIds.has(String(value.armyLocation)) || !locationIds.has(String(value.selectedLocation))) return `${label} contains an unknown location.`;
  if (value.armyDestination !== undefined && !locationIds.has(String(value.armyDestination))) return `${label}.armyDestination is unknown.`;
  if ((value.armyDestination === undefined) !== (value.armyArrivesOn === undefined) || (value.armyArrivesOn !== undefined && !isInt(value.armyArrivesOn, 2, 1001))) return `${label} contains an incomplete movement order.`;
  if (!Array.isArray(value.scoutedLocations) || value.scoutedLocations.length > locationIds.size || value.scoutedLocations.some((id) => !locationIds.has(String(id))) || new Set(value.scoutedLocations).size !== value.scoutedLocations.length) return `${label}.scoutedLocations is invalid.`;
  if (!isRecord(value.trust) || !trustIds.every((id) => isInt((value.trust as Record<string, unknown>)[id], -20, 20))) return `${label}.trust is invalid.`;
  if (!isRecord(value.flags) || Object.keys(value.flags).length > 100 || Object.values(value.flags).some((flag) => typeof flag !== 'boolean')) return `${label}.flags is invalid.`;
  if (!isInt(value.councilResolvedTurn, 0, 1000) || !isInt(value.battleAttempts, 0, 100)) return `${label} contains invalid progression counters.`;
  if (value.battleResult !== undefined && !['victory', 'retreat', 'defeat'].includes(String(value.battleResult))) return `${label}.battleResult is invalid.`;
  if (value.ending !== undefined && !['steel', 'truth'].includes(String(value.ending))) return `${label}.ending is invalid.`;
  if (value.lastBattle !== undefined && !validateBattleReport(value.lastBattle)) return `${label}.lastBattle is invalid.`;
  if (value.lastBattle !== undefined && unitTypes.some((type) => (value.lastBattle as BattleReport).survivors[type] !== (value.army as Record<UnitType, number>)[type])) return `${label}.lastBattle survivors do not match the army.`;
  if (!isStringArray(value.log, 500)) return `${label}.log is invalid.`;
  return null;
}

export function validateGameState(value: unknown): { ok: true; value: GameState } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: 'Save data must be a JSON object.' };
  if (value.version !== 1) return { ok: false, error: 'Only save version 1 is supported.' };
  if (!isShortString(value.runId, 100) || !/^[A-Za-z0-9-]+$/.test(value.runId)) return { ok: false, error: 'runId is invalid.' };
  if (!screens.includes(value.screen as Screen)) return { ok: false, error: 'The save references an unsupported screen.' };
  const chapterError = validateChapter(value.chapter, 'chapter') ?? validateChapter(value.checkpoint, 'checkpoint');
  if (chapterError) return { ok: false, error: chapterError };
  if (!isRecord(value.persistent) || !isInt(value.persistent.livesRemaining, 0, 9) || !['story', 'standard'].includes(String(value.persistent.difficulty))) return { ok: false, error: 'persistent campaign settings are invalid.' };
  const persistent = value.persistent as Record<string, unknown>;
  if (!Array.isArray(persistent.evidence) || persistent.evidence.length > Object.keys(evidenceCatalog).length || persistent.evidence.some((item) => !isRecord(item) || !evidenceCatalog[String(item.id)] || JSON.stringify(item) !== JSON.stringify(evidenceCatalog[String(item.id)])) || new Set(persistent.evidence.map((item) => (item as Record<string, unknown>).id)).size !== persistent.evidence.length) return { ok: false, error: 'persistent evidence contains unknown or altered entries.' };
  if (!isStringArray(persistent.seenScenes, 20) || persistent.seenScenes.some((id) => id !== 'funeral')) return { ok: false, error: 'persistent seen-scene IDs are invalid.' };
  if (!isStringArray(persistent.completedChapters, 5) || persistent.completedChapters.some((id) => id !== 'missing-seal')) return { ok: false, error: 'persistent completed-chapter IDs are invalid.' };
  if (!Array.isArray(value.processedOutcomeIds) || value.processedOutcomeIds.length > 200 || value.processedOutcomeIds.some((id) => !isShortString(id, 150) || !/^(greyfen-\d+|death-[A-Za-z0-9-]+-\d+)$/.test(id))) return { ok: false, error: 'processed outcome IDs are invalid.' };
  if (value.notice !== undefined && !isShortString(value.notice, 500)) return { ok: false, error: 'notice is invalid.' };
  return { ok: true, value: value as unknown as GameState };
}

export function isGameState(value: unknown): value is GameState { return validateGameState(value).ok; }
export function saveGame(state: GameState): boolean { try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; } }
function migrateLegacyVersionOne(value: unknown): unknown {
  if (!isRecord(value) || value.version !== 1) return value;
  const migrated = structuredClone(value);
  for (const key of ['chapter', 'checkpoint']) {
    const chapter = migrated[key];
    if (isRecord(chapter) && chapter.battleAttempts === undefined) chapter.battleAttempts = chapter.battleResult ? 1 : 0;
  }
  if (Array.isArray(migrated.processedOutcomeIds)) migrated.processedOutcomeIds = migrated.processedOutcomeIds.map((id) => typeof id === 'string' && /^greyfen-(victory|retreat|defeat)$/.test(id) ? 'greyfen-0' : id);
  return migrated;
}
export function loadGame(): GameState | null { try { const raw = localStorage.getItem(KEY); if (!raw) return null; const result = validateGameState(migrateLegacyVersionOne(JSON.parse(raw))); return result.ok ? result.value : null; } catch { return null; } }
export function hasSave(): boolean { return loadGame() !== null; }
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* unavailable storage */ } }
export function exportSave(state: GameState): string { return JSON.stringify(state, null, 2); }
export function importSave(raw: string): GameState {
  let parsed: unknown;
  try { parsed = migrateLegacyVersionOne(JSON.parse(raw)); } catch { throw new Error('Save data is not valid JSON.'); }
  const result = validateGameState(parsed);
  if (!result.ok) throw new Error(`Save rejected: ${result.error}`);
  return result.value;
}
