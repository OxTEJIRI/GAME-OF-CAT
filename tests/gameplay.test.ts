import { describe, expect, it } from 'vitest';
import { MAX_BATTLE_TICKS, battleHonours, combatOutcome, combatTick, createCombat, crownAdvantage, focusTarget, rally, shiftLane } from '../src/game/combat';
import { advanceTurn, applyBattleResult, killRuler, newGame, rewindChapter } from '../src/game/rules';
import { buildTurnReport, transitionCues } from '../src/ui/feedback';

const balanced = { infantry: 'road', archers: 'high', cavalry: 'flank' } as const;
const army = { infantry: 2, archers: 1, cavalry: 1 };

describe('battle events and commands', () => {
  it('reports hits, volleys, charges, and decisive moments as tick events', () => {
    let battle = createCombat(balanced, army, true);
    const kinds = new Set<string>();
    for (let i = 0; i <= MAX_BATTLE_TICKS && !combatOutcome(battle); i++) { battle = combatTick(battle); battle.events.forEach((event) => kinds.add(event.kind)); }
    for (const kind of ['hit', 'volley', 'charge']) expect(kinds).toContain(kind);
    expect(kinds.has('fall') || kinds.has('rout')).toBe(true);
    expect(battle.log.length).toBeGreaterThan(0);
    expect(battle.log.length).toBeLessThanOrEqual(5);
  });

  it('focuses a squad on a chosen enemy until it falls or routs', () => {
    let battle = createCombat(balanced, army, true);
    battle = focusTarget(battle, 'c-cavalry-0', 'r-archers-1');
    expect(battle.message).toBe('Attack order issued.');
    expect(battle.units.find((unit) => unit.id === 'c-cavalry-0')).toMatchObject({ targetId: 'r-archers-1', order: 'advance' });
    let struck = false;
    for (let i = 0; i < 80 && !combatOutcome(battle) && !struck; i++) { battle = combatTick(battle); struck = battle.events.some((event) => event.unitId === 'c-cavalry-0' && event.targetId === 'r-archers-1'); }
    expect(struck).toBe(true);
    expect(focusTarget(battle, 'r-infantry-1', 'c-infantry-0')).toBe(battle);
  });

  it('moves a squad one lane per action and refuses to leave the field', () => {
    let battle = createCombat(balanced, army, true);
    battle = shiftLane(battle, 'c-archers-0', -1);
    expect(battle.message).toBe('No road lies that way.');
    battle = shiftLane(battle, 'c-cavalry-0', -1);
    battle = shiftLane(battle, 'c-cavalry-0', -1);
    expect(battle.units.find((unit) => unit.id === 'c-cavalry-0')?.laneTarget).toBe('high');
    battle = combatTick(battle); expect(battle.units.find((unit) => unit.id === 'c-cavalry-0')?.lane).toBe('road');
    battle = combatTick(battle); expect(battle.units.find((unit) => unit.id === 'c-cavalry-0')?.lane).toBe('high');
  });

  it('emits a rally event per living squad and starts the cooldown', () => {
    const battle = rally(createCombat(balanced, army, true));
    expect(battle.events.filter((event) => event.kind === 'rally')).toHaveLength(4);
    expect(rally(battle)).toBe(battle);
  });

  it('awards honours from casualties and names the champion', () => {
    let battle = createCombat(balanced, { infantry: 3, archers: 2, cavalry: 1 }, true);
    for (let i = 0; i <= MAX_BATTLE_TICKS && !combatOutcome(battle); i++) battle = combatTick(battle);
    const outcome = combatOutcome(battle)!;
    const honours = battleHonours(battle, outcome);
    expect(honours.stars).toBe(outcome === 'defeat' ? 0 : honours.lost === 0 ? 3 : honours.lost === 1 ? 2 : 1);
    expect(honours.champion?.damage).toBeGreaterThan(0);
    expect(crownAdvantage(battle)).toBeGreaterThanOrEqual(0);
  });
});

describe('turn developments', () => {
  it('brings one development per turn and warns before the lethal turn', () => {
    let game = newGame();
    game = advanceTurn(game); expect(game.chapter.log[0]).toMatch(/palace cat/); expect(game.chapter.publicOrder).toBe(65);
    game = advanceTurn(game); expect(game.chapter.log[0]).toMatch(/Signal fires/);
    game = advanceTurn(game); expect(game.chapter.log[0]).toMatch(/refugees/i);
    game = advanceTurn(game); expect(game.chapter.log[0]).toMatch(/strike within days/);
    expect(advanceTurn(game).screen).toBe('death');
  });

  it('rewards preparation in the events it triggers', () => {
    let game = newGame(); game.chapter.scoutedLocations = ['watchtower'];
    game = advanceTurn(advanceTurn(game));
    expect(game.chapter.log[0]).toMatch(/raider purse/);
  });

  it('warns that a blade is coming after an unresolved Greyfen battle', () => {
    let game = newGame();
    for (let i = 0; i < 4; i++) game = advanceTurn(game);
    game = applyBattleResult(game, { battleId: 0, result: 'retreat', survivors: { ...game.chapter.army }, casualties: { infantry: 0, archers: 0, cavalry: 0 }, deployed: { ...game.chapter.army }, reserves: { infantry: 0, archers: 0, cavalry: 0 }, ticks: 9 });
    game = advanceTurn(game);
    expect(game.screen).not.toBe('death');
    expect(game.chapter.log[0]).toMatch(/blade is being readied/);
  });
});

describe('feedback derivations', () => {
  it('maps state transitions to sounds', () => {
    const game = newGame();
    expect(transitionCues(game, advanceTurn(game))).toEqual(['turn', 'meow']);
    expect(transitionCues(game, { ...game, notice: 'No kingdom actions remain this turn.' })).toEqual(['error']);
    const dead = killRuler({ ...game, screen: 'kingdom' }, 'test');
    expect(transitionCues({ ...game, screen: 'kingdom' }, dead)).toEqual(['toll']);
    expect(transitionCues(dead, rewindChapter(dead))).toEqual(['rewind']);
  });

  it('summarises a turn with deltas, events, and the threat clock', () => {
    const before = newGame(); const after = advanceTurn(before);
    const report = buildTurnReport(before.chapter, after.chapter);
    expect(report.turn).toBe(2);
    expect(report.deltas.find((delta) => delta.label === 'gold')?.value).toBe(10);
    expect(report.lines.some((line) => /palace cat/.test(line))).toBe(true);
    expect(report.warning).toMatch(/4 turns until the conspirators strike/);
  });
});
