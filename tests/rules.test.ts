import { describe, expect, it } from 'vitest';
import { addEvidence, advanceTurn, applyBattleResult, canFinish, councilChoice, killRuler, moveArmy, newGame, recruit, rewindChapter, upgradeBuilding } from '../src/game/rules';
import { DEPLOYMENT_LIMIT, MAX_BATTLE_TICKS, combatOutcome, combatTick, createCombat, issueOrder, planDeployment, summarizeCombat, type Lane } from '../src/game/combat';
import type { BattleReport, GameState, UnitType } from '../src/game/types';
import { exportSave, importSave, validateGameState } from '../src/services/saves';

const balanced = { infantry: 'road', archers: 'high', cavalry: 'flank' } as const;
const types: UnitType[] = ['infantry', 'archers', 'cavalry'];
function simulate(deployment: Record<UnitType, Lane>, counts = { infantry: 2, archers: 1, cavalry: 1 }, scouted = true, battleId = 0) {
  let battle = createCombat(deployment, counts, scouted, battleId);
  for (let index = 0; index <= MAX_BATTLE_TICKS && !combatOutcome(battle); index++) battle = combatTick(battle);
  const result = combatOutcome(battle);
  if (!result) throw new Error('Battle failed to resolve.');
  return { battle, report: summarizeCombat(battle, result) };
}

function completeReport(game: GameState, result: BattleReport['result'] = 'victory'): BattleReport {
  return { battleId: game.chapter.battleAttempts, result, survivors: { ...game.chapter.army }, casualties: { infantry: 0, archers: 0, cavalry: 0 }, deployed: { ...game.chapter.army }, reserves: { infantry: 0, archers: 0, cavalry: 0 }, ticks: 50 };
}

describe('kingdom rules and campaign timing', () => {
  it('prevents overspending and makes recruitment increase deployable strength', () => {
    let game = newGame(); game.chapter.resources.gold = 0;
    expect(upgradeBuilding(game, 'gate').chapter).toEqual(game.chapter);
    game = newGame(); const recruited = recruit(game, 'infantry');
    expect(recruited.chapter.actions).toBe(1); expect(recruited.chapter.army.infantry).toBe(3);
    expect(planDeployment(recruited.chapter.army).deployed.infantry).toBe(3);
  });

  it('uses a six-squad field limit and retains additional recruits as reserves', () => {
    const plan = planDeployment({ infantry: 4, archers: 3, cavalry: 2 });
    expect(Object.values(plan.deployed).reduce((sum, count) => sum + count, 0)).toBe(DEPLOYMENT_LIMIT);
    expect(plan.reserves).toEqual({ infantry: 2, archers: 1, cavalry: 0 });
  });

  it('completes construction before income and movement before the new turn begins', () => {
    let game = newGame(); game = upgradeBuilding(game, 'granary'); game = moveArmy(game, 'watchtower');
    expect(game.chapter.armyLocation).toBe('capital'); expect(game.chapter.armyDestination).toBe('watchtower');
    game = advanceTurn(game);
    expect(game.chapter.buildingLevels.granary).toBe(2); expect(game.chapter.armyLocation).toBe('watchtower'); expect(game.chapter.armyDestination).toBeUndefined(); expect(game.chapter.turn).toBe(2);
  });

  it('rejects non-adjacent and overlapping march orders without spending another turn action', () => {
    const game = newGame(); const invalid = moveArmy(game, 'pass');
    expect(invalid.chapter.resources.food).toBe(game.chapter.resources.food);
    const marching = moveArmy(game, 'watchtower'); const overlap = moveArmy(marching, 'orchard');
    expect(overlap.chapter.armyDestination).toBe('watchtower'); expect(overlap.chapter.actions).toBe(2);
  });
});

describe('battle integration and immutability', () => {
  it('carries exact casualties into campaign state without mutating the source state', () => {
    const game = newGame(); const before = structuredClone(game);
    const report: BattleReport = { battleId: 0, result: 'victory', survivors: { infantry: 1, archers: 1, cavalry: 1 }, casualties: { infantry: 1, archers: 0, cavalry: 0 }, deployed: { infantry: 2, archers: 1, cavalry: 1 }, reserves: { infantry: 0, archers: 0, cavalry: 0 }, ticks: 61 };
    const resolved = applyBattleResult(game, report);
    expect(game).toEqual(before); expect(resolved.chapter.army).toEqual(report.survivors); expect(resolved.chapter.lastBattle).toEqual(report);
    expect(resolved.chapter.resources.gold).toBe(game.chapter.resources.gold + 20);
  });

  it('applies a battle report once and allows a new encounter after retreat recovery', () => {
    let game = newGame();
    const retreat: BattleReport = { battleId: 0, result: 'retreat', survivors: { infantry: 1, archers: 1, cavalry: 1 }, casualties: { infantry: 1, archers: 0, cavalry: 0 }, deployed: { infantry: 2, archers: 1, cavalry: 1 }, reserves: { infantry: 0, archers: 0, cavalry: 0 }, ticks: 12 };
    game = applyBattleResult(game, retreat); const duplicate = applyBattleResult(game, retreat);
    expect(duplicate).toBe(game); expect(game.chapter.armyLocation).toBe('watchtower'); expect(game.chapter.battleAttempts).toBe(1);
    game = moveArmy(game, 'pass'); expect(game.chapter.armyLocation).toBe('watchtower'); game = advanceTurn(game); expect(game.chapter.armyLocation).toBe('pass');
    const second = completeReport(game, 'victory'); const won = applyBattleResult(game, second);
    expect(won.chapter.battleAttempts).toBe(2); expect(won.chapter.battleResult).toBe('victory');
  });

  it('clears chapter battle outcomes on rewind but never double-charges a life', () => {
    let game = newGame(); game = applyBattleResult(game, completeReport(game, 'victory')); game = killRuler(game, 'test'); const duplicateDeath = killRuler(game, 'test');
    expect(duplicateDeath.persistent.livesRemaining).toBe(8);
    const rewound = rewindChapter(game);
    expect(rewound.processedOutcomeIds.some((id) => id.startsWith('greyfen-'))).toBe(false);
    expect(rewound.processedOutcomeIds.some((id) => id.startsWith('death-'))).toBe(true);
    expect(rewound.persistent.evidence.some((evidence) => evidence.id === 'perfumed-letter')).toBe(true);
  });

  it('requires a victory as well as evidence, defence, or foresight to end the chapter', () => {
    let truth = newGame(); truth = councilChoice(truth, 'audit'); expect(canFinish(truth)).toBe(false); truth = applyBattleResult(truth, completeReport(truth)); expect(canFinish(truth)).toBe(true);
    let steel = newGame(); steel = councilChoice(steel, 'guards'); steel = upgradeBuilding(steel, 'gate'); steel = advanceTurn(steel); expect(canFinish(steel)).toBe(false); steel = applyBattleResult(steel, completeReport(steel)); expect(canFinish(steel)).toBe(true);
    let foresight = addEvidence(newGame(), 'perfumed-letter'); foresight = councilChoice(foresight, 'courier'); expect(canFinish(foresight)).toBe(false);
  });
});

describe('tactical combat', () => {
  it('resolves every valid lane deployment without stalling', () => {
    const lanes: Lane[] = ['high', 'road', 'flank'];
    for (const infantry of lanes) for (const archers of lanes) for (const cavalry of lanes) {
      const { battle } = simulate({ infantry, archers, cavalry });
      expect(combatOutcome(battle)).not.toBeNull(); expect(battle.tick).toBeLessThanOrEqual(MAX_BATTLE_TICKS);
    }
  });

  it('allows melee squads to change lanes to reach the last enemy', () => {
    let battle = createCombat({ infantry: 'road', archers: 'road', cavalry: 'road' }, { infantry: 1, archers: 0, cavalry: 0 }, true);
    battle.units = battle.units.filter((unit) => unit.side === 'crown' || unit.id === 'r-archers-1');
    for (let index = 0; index <= MAX_BATTLE_TICKS && !combatOutcome(battle); index++) battle = combatTick(battle);
    expect(combatOutcome(battle)).not.toBeNull(); expect(battle.units.find((unit) => unit.side === 'crown')?.lane).toBe('high');
  });

  it('is deterministic for identical inputs and orders', () => {
    const run = () => { let battle = createCombat(balanced, { infantry: 3, archers: 2, cavalry: 1 }, true); battle = issueOrder(battle, 'c-infantry-0', 'brace'); for (let index = 0; index < 90 && !combatOutcome(battle); index++) battle = combatTick(battle); return battle; };
    expect(run()).toEqual(run());
  });

  it('makes deployment alter the resulting casualties or victory state', () => {
    const prepared = simulate(balanced, { infantry: 2, archers: 1, cavalry: 1 }, false).report;
    const exposed = simulate({ infantry: 'high', archers: 'flank', cavalry: 'road' }, { infantry: 2, archers: 1, cavalry: 1 }, false).report;
    expect({ result: prepared.result, casualties: prepared.casualties }).not.toEqual({ result: exposed.result, casualties: exposed.casualties });
  });

  it('makes recruited field squads improve the battle result', () => {
    const base = simulate(balanced, { infantry: 2, archers: 1, cavalry: 1 }, false).report;
    const reinforced = simulate(balanced, { infantry: 3, archers: 2, cavalry: 1 }, false).report;
    const totalLosses = (report: BattleReport) => types.reduce((sum, type) => sum + report.casualties[type], 0);
    expect(reinforced.result === 'victory' || totalLosses(reinforced) < totalLosses(base)).toBe(true);
  });
});

describe('save validation', () => {
  it('round trips a complete save', () => { const game = addEvidence(newGame(), 'wax-fragment'); expect(importSave(exportSave(game))).toEqual(game); });
  it('migrates earlier version-1 saves that predate encounter counters', () => {
    const legacy: any = structuredClone(newGame()); delete legacy.chapter.battleAttempts; delete legacy.checkpoint.battleAttempts; legacy.chapter.battleResult = 'victory'; legacy.processedOutcomeIds = ['greyfen-victory'];
    const migrated = importSave(JSON.stringify(legacy)); expect(migrated.chapter.battleAttempts).toBe(1); expect(migrated.checkpoint.battleAttempts).toBe(0); expect(migrated.processedOutcomeIds).toEqual(['greyfen-0']);
  });
  it.each([
    ['screen', (save: any) => { save.screen = 'hacked'; }],
    ['resource range', (save: any) => { save.chapter.resources.gold = -1; }],
    ['building ID', (save: any) => { save.chapter.projects = [{ building: 'forge', completesOn: 2 }]; }],
    ['location ID', (save: any) => { save.chapter.armyLocation = 'nowhere'; }],
    ['evidence ID', (save: any) => { save.persistent.evidence = [{ id: 'fake' }]; }],
    ['nested army count', (save: any) => { save.chapter.army.infantry = Number.NaN; }],
  ])('rejects malformed nested %s data', (_name, mutate) => {
    const save: any = structuredClone(newGame()); mutate(save); expect(validateGameState(save).ok).toBe(false); expect(() => importSave(JSON.stringify(save))).toThrow(/rejected/i);
  });
  it('reports malformed JSON clearly', () => expect(() => importSave('{broken')).toThrow(/valid JSON/i));
});
