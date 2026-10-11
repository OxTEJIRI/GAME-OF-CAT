import { buildings, evidenceCatalog, locations, units } from '../content/gameContent';
import type { BattleReport, BuildingId, ChapterState, Evidence, GameState, UnitType } from './types';

export function createChapter(): ChapterState {
  return {
    chapterId: 'missing-seal', turn: 1, actions: 2,
    resources: { gold: 72, food: 14, materials: 26 }, publicOrder: 62,
    buildingLevels: { keep: 1, barracks: 1, granary: 1, gate: 1 }, projects: [],
    army: { infantry: 2, archers: 1, cavalry: 1 }, armyLocation: 'capital', selectedLocation: 'capital',
    scoutedLocations: [], trust: { queen: 0, northernLord: 0, steward: 0 }, flags: {},
    councilResolvedTurn: 0, battleAttempts: 0, log: ['The funeral bells fade. The royal seal is missing.'],
  };
}

export function newGame(): GameState {
  const chapter = createChapter();
  return { version: 1, runId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`, screen: 'funeral',
    persistent: { livesRemaining: 9, evidence: [], seenScenes: [], completedChapters: [], difficulty: 'standard' },
    checkpoint: structuredClone(chapter), chapter, processedOutcomeIds: [] };
}

const fail = (state: GameState, notice: string): GameState => ({ ...state, notice });

export function addEvidence(state: GameState, id: string): GameState {
  if (state.persistent.evidence.some((item) => item.id === id)) return state;
  const evidence = evidenceCatalog[id];
  if (!evidence) return state;
  return { ...state, persistent: { ...state.persistent, evidence: [...state.persistent.evidence, evidence] }, notice: `Evidence retained: ${evidence.title}` };
}

export function upgradeBuilding(state: GameState, id: BuildingId): GameState {
  const level = state.chapter.buildingLevels[id];
  const cost = buildings[id].baseCost;
  if (state.chapter.actions < 1) return fail(state, 'No kingdom actions remain this turn.');
  if (level >= 3 || state.chapter.projects.some((p) => p.building === id)) return fail(state, 'That building cannot be upgraded now.');
  if (state.chapter.resources.gold < cost.gold || state.chapter.resources.materials < cost.materials) return fail(state, 'The treasury lacks the required gold or materials.');
  return { ...state, chapter: { ...state.chapter, actions: state.chapter.actions - 1,
    resources: { ...state.chapter.resources, gold: state.chapter.resources.gold - cost.gold, materials: state.chapter.resources.materials - cost.materials },
    projects: [...state.chapter.projects, { building: id, completesOn: state.chapter.turn + 1 }],
    log: [`${buildings[id].name} upgrade commissioned.`, ...state.chapter.log] }, notice: `${buildings[id].name} will improve next turn.` };
}

export function recruit(state: GameState, type: UnitType): GameState {
  const cost = units[type].cost;
  if (state.chapter.actions < 1) return fail(state, 'No kingdom actions remain this turn.');
  if (state.chapter.resources.gold < cost.gold || state.chapter.resources.food < cost.food) return fail(state, 'Recruitment requires more gold or food.');
  return { ...state, chapter: { ...state.chapter, actions: state.chapter.actions - 1,
    resources: { ...state.chapter.resources, gold: state.chapter.resources.gold - cost.gold, food: state.chapter.resources.food - cost.food },
    army: { ...state.chapter.army, [type]: state.chapter.army[type] + 1 },
    log: [`One ${units[type].name.toLowerCase()} squad recruited.`, ...state.chapter.log] }, notice: `${units[type].name} joined the Crown Guard.` };
}

export type CouncilChoice = 'guards' | 'north' | 'audit' | 'courier';
export function councilChoice(state: GameState, choice: CouncilChoice): GameState {
  if (state.chapter.councilResolvedTurn === state.chapter.turn) return fail(state, 'The council has already ruled on this turn.');
  let next: GameState = structuredClone(state);
  next.chapter.councilResolvedTurn = next.chapter.turn;
  if (choice === 'guards') { next.chapter.flags.palaceGuarded = true; next.chapter.trust.queen += 1; next.chapter.publicOrder -= 4; next.notice = 'Two squads remain inside the palace.'; }
  if (choice === 'north') { next.chapter.flags.northReinforced = true; next.chapter.trust.northernLord += 1; next.chapter.resources.food = Math.max(0, next.chapter.resources.food - 2); next.notice = 'The northern road receives supplies.'; }
  if (choice === 'audit') { next.chapter.trust.steward -= 1; next = addEvidence(next, 'ledger-gap'); }
  if (choice === 'courier') { if (!state.persistent.evidence.some((e) => e.id === 'perfumed-letter')) return fail(state, 'You lack the knowledge to identify the courier.'); next.chapter.flags.courierStopped = true; next.chapter.trust.queen -= 1; next.notice = 'The west-archive courier is detained before dusk.'; }
  next.chapter.log = [`Council ruling: ${choice}.`, ...next.chapter.log];
  return next;
}

export function scout(state: GameState, location: string): GameState {
  if (state.chapter.actions < 1) return fail(state, 'Scouting uses one kingdom action.');
  if (state.chapter.scoutedLocations.includes(location)) return fail(state, 'That route is already scouted.');
  let next: GameState = { ...state, chapter: { ...state.chapter, actions: state.chapter.actions - 1, scoutedLocations: [...state.chapter.scoutedLocations, location], log: [`Scouts report from ${location}.`, ...state.chapter.log] }, notice: 'Enemy composition and a safer approach are now known.' };
  if (location === 'watchtower') next = addEvidence(next, 'wax-fragment');
  return next;
}

export function moveArmy(state: GameState, location: string): GameState {
  if (state.chapter.armyDestination) return fail(state, `The army is already marching to ${state.chapter.armyDestination}.`);
  if (state.chapter.armyLocation === location) return fail(state, 'The royal army is already there.');
  const current = locations.find((item) => item.id === state.chapter.armyLocation);
  if (!current?.connected.includes(location)) return fail(state, 'The army can only march along a connected route.');
  if (state.chapter.resources.food < 2) return fail(state, 'The army needs 2 food to travel.');
  return { ...state, chapter: { ...state.chapter, armyDestination: location, armyArrivesOn: state.chapter.turn + 1, resources: { ...state.chapter.resources, food: state.chapter.resources.food - 2 }, log: [`The royal army began marching to ${location}.`, ...state.chapter.log] }, notice: 'March ordered. The army arrives when the next turn resolves.' };
}

export function advanceTurn(state: GameState): GameState {
  const chapter = structuredClone(state.chapter);
  const nextTurn = chapter.turn + 1;
  if (chapter.armyDestination && chapter.armyArrivesOn && chapter.armyArrivesOn <= nextTurn) {
    chapter.armyLocation = chapter.armyDestination;
    chapter.log = [`The royal army arrived at ${chapter.armyDestination}.`, ...chapter.log];
    delete chapter.armyDestination;
    delete chapter.armyArrivesOn;
  }
  const completed = chapter.projects.filter((p) => p.completesOn <= nextTurn);
  completed.forEach((p) => { chapter.buildingLevels[p.building] += 1; });
  chapter.projects = chapter.projects.filter((p) => p.completesOn > nextTurn);
  const upkeep = Object.values(chapter.army).reduce((sum, n) => sum + n, 0);
  chapter.resources.gold += 8 + chapter.buildingLevels.keep * 2;
  chapter.resources.materials += 3;
  chapter.resources.food += 5 + chapter.buildingLevels.granary * 3 - upkeep;
  if (chapter.resources.food < 0) { chapter.resources.food = 0; chapter.publicOrder -= 8; }
  chapter.turn = nextTurn; chapter.actions = 2;
  chapter.log = [`Turn ${nextTurn}: income collected; ${upkeep} food upkeep paid.`, ...chapter.log];
  let next = { ...state, chapter, notice: `Turn ${nextTurn} begins. Income and upkeep resolved.` };
  if (nextTurn >= 6 && !chapter.battleResult) return killRuler(next, 'The undefended north road let the conspirators enter the palace.');
  if (nextTurn >= 7 && chapter.battleResult && !canFinish(next)) return killRuler(next, 'A hidden blade found the throne before the missing seal was explained.');
  return next;
}

export function applyBattleResult(state: GameState, report: BattleReport): GameState {
  const id = `greyfen-${report.battleId}`;
  if (state.processedOutcomeIds.includes(id)) return state;
  if (report.battleId !== state.chapter.battleAttempts) return fail(state, 'This battle report belongs to a different encounter and was rejected.');
  const unitTypes: UnitType[] = ['infantry', 'archers', 'cavalry'];
  const validCounts = unitTypes.every((type) => Number.isInteger(report.survivors[type]) && Number.isInteger(report.casualties[type]) && report.survivors[type] >= 0 && report.casualties[type] >= 0 && report.survivors[type] + report.casualties[type] === state.chapter.army[type]);
  if (!validCounts) return fail(state, 'The battle report did not match the deployed army and was rejected.');
  const result = report.result;
  let next: GameState = {
    ...state, screen: 'map', processedOutcomeIds: [...state.processedOutcomeIds, id],
    chapter: {
      ...state.chapter, army: { ...report.survivors }, lastBattle: structuredClone(report), battleAttempts: state.chapter.battleAttempts + 1,
      battleResult: result, armyLocation: result === 'retreat' ? 'watchtower' : 'pass',
      resources: { ...state.chapter.resources }, flags: { ...state.chapter.flags }, log: [`Greyfen Pass: ${result}.`, ...state.chapter.log],
    },
  };
  if (result === 'victory') {
    next = { ...next, chapter: { ...next.chapter, resources: { ...next.chapter.resources, gold: next.chapter.resources.gold + 20 }, publicOrder: next.chapter.publicOrder + 8 } };
    next = addEvidence(next, 'pass-orders');
  }
  if (result === 'retreat') next = { ...next, notice: 'The surviving squads withdrew to Crow Watch. Greyfen can be challenged again.' };
  if (result === 'defeat') return killRuler(next, 'The ruler fell after the army broke at Greyfen Pass.');
  return next;
}

export function canFinish(state: GameState): boolean {
  const ids = state.persistent.evidence.map((e) => e.id);
  const truth = ids.includes('ledger-gap') && ids.includes('pass-orders');
  const steel = !!state.chapter.flags.palaceGuarded && state.chapter.buildingLevels.gate >= 2 && state.chapter.battleResult === 'victory';
  const foresight = !!state.chapter.flags.courierStopped && state.chapter.battleResult === 'victory';
  return truth || steel || foresight;
}

export function finishChapter(state: GameState, ending: 'truth' | 'steel'): GameState {
  if (!canFinish(state)) return fail(state, 'The conspiracy is not yet contained. Gather proof or secure the palace.');
  return { ...state, screen: 'ending', chapter: { ...state.chapter, ending }, persistent: { ...state.persistent, completedChapters: ['missing-seal'] }, notice: undefined };
}

export function killRuler(state: GameState, cause: string): GameState {
  if (state.screen === 'death' || state.chapter.flags.deathProcessed) return state;
  const deathId = `death-${state.runId}-${state.persistent.livesRemaining}`;
  if (state.processedOutcomeIds.includes(deathId)) return state;
  let next = addEvidence(state, 'perfumed-letter');
  next = { ...next, screen: 'death', persistent: { ...next.persistent, livesRemaining: Math.max(0, next.persistent.livesRemaining - 1) }, processedOutcomeIds: [...next.processedOutcomeIds, deathId], chapter: { ...next.chapter, flags: { ...next.chapter.flags, deathCauseSet: true } }, notice: cause };
  return next;
}

export function rewindChapter(state: GameState): GameState {
  const chapter = structuredClone(state.checkpoint);
  chapter.log = ['Time folds back to the funeral. Knowledge remains.', ...chapter.log];
  return { ...state, screen: 'kingdom', chapter, processedOutcomeIds: state.processedOutcomeIds.filter((id) => !id.startsWith('greyfen-')), notice: 'The chapter rewound. Evidence and lost lives remain.' };
}

export function trustLabel(value: number) { return value >= 2 ? 'Loyal' : value >= 1 ? 'Cooperative' : value <= -1 ? 'Wary' : 'Neutral'; }
export function hasEvidence(evidence: Evidence[], id: string) { return evidence.some((item) => item.id === id); }
