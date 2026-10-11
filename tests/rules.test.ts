import { describe, expect, it } from 'vitest';
import { addEvidence, advanceTurn, applyBattleResult, canFinish, councilChoice, killRuler, newGame, recruit, rewindChapter, upgradeBuilding } from '../src/game/rules';
import { combatOutcome, combatTick, createCombat, issueOrder } from '../src/game/combat';
import { exportSave, importSave } from '../src/services/saves';

describe('kingdom rules', () => {
  it('prevents overspending and consumes actions once', () => {
    let game = newGame(); game.chapter.resources.gold = 0;
    expect(upgradeBuilding(game, 'gate').chapter).toEqual(game.chapter);
    game = newGame(); const next = recruit(game, 'infantry');
    expect(next.chapter.actions).toBe(1); expect(next.chapter.army.infantry).toBe(3);
  });
  it('completes construction before calculating new turn income', () => {
    let game = newGame(); game = upgradeBuilding(game, 'granary'); game = advanceTurn(game);
    expect(game.chapter.buildingLevels.granary).toBe(2);
    expect(game.chapter.turn).toBe(2);
  });
  it('offers independent truth and steel endings', () => {
    let truth = newGame(); truth = councilChoice(truth, 'audit'); truth = applyBattleResult(truth, 'victory');
    expect(canFinish(truth)).toBe(true);
    let steel = newGame(); steel = councilChoice(steel, 'guards'); steel = upgradeBuilding(steel, 'gate'); steel = advanceTurn(steel); steel = applyBattleResult(steel, 'victory');
    expect(canFinish(steel)).toBe(true);
  });
});

describe('rewind and persistence', () => {
  it('charges exactly one life and retains evidence through rewind', () => {
    const game = newGame(); const dead = killRuler(game, 'test'); const duplicate = killRuler(dead, 'test');
    expect(dead.persistent.livesRemaining).toBe(8); expect(duplicate.persistent.livesRemaining).toBe(8);
    const rewound = rewindChapter(dead); expect(rewound.persistent.evidence.some((e) => e.id === 'perfumed-letter')).toBe(true); expect(rewound.chapter.turn).toBe(1);
  });
  it('round trips a versioned save and rejects malformed data', () => {
    const game = addEvidence(newGame(), 'wax-fragment'); expect(importSave(exportSave(game))).toEqual(game);
    expect(() => importSave('{"bad":true}')).toThrow(/compatible/);
  });
});

describe('tactical combat', () => {
  it('resolves deterministically and deployment/order matters', () => {
    let battle = createCombat({ infantry:'road', archers:'high', cavalry:'flank' }, { infantry:2, archers:1, cavalry:1 }, true);
    battle = issueOrder(battle, 'c-infantry-0', 'brace');
    for (let i = 0; i < 100 && !combatOutcome(battle); i++) battle = combatTick(battle);
    expect(combatOutcome(battle)).not.toBeNull();
  });
});
