import type { UnitType } from './types';

export type Lane = 'high' | 'road' | 'flank';
export type Order = 'advance' | 'hold' | 'brace' | 'regroup';
export type CombatUnit = {
  id: string; side: 'crown' | 'raiders'; type: UnitType; lane: Lane; x: number;
  hp: number; morale: number; order: Order; routed: boolean;
};
export type CombatState = { tick: number; units: CombatUnit[]; rallyCooldown: number; message: string };

const stats: Record<UnitType, { damage: number; range: number; speed: number }> = {
  infantry: { damage: 7, range: 8, speed: 2.2 },
  archers: { damage: 5, range: 34, speed: 1.2 },
  cavalry: { damage: 10, range: 9, speed: 4.4 },
};

export function createCombat(deployment: Record<UnitType, Lane>, counts: Record<UnitType, number>, scouted: boolean): CombatState {
  const crown = (Object.keys(deployment) as UnitType[]).flatMap((type, i) =>
    Array.from({ length: Math.min(counts[type], 2) }, (_, n) => ({ id: `c-${type}-${n}`, side: 'crown' as const, type, lane: deployment[type], x: 12 - n * 3 - i, hp: 100, morale: 100, order: 'advance' as const, routed: false })),
  );
  const raiders: CombatUnit[] = [
    { id: 'r-infantry-1', side: 'raiders', type: 'infantry', lane: 'road', x: 82, hp: scouted ? 86 : 100, morale: 86, order: 'advance', routed: false },
    { id: 'r-infantry-2', side: 'raiders', type: 'infantry', lane: 'high', x: 87, hp: 100, morale: 82, order: 'advance', routed: false },
    { id: 'r-archers-1', side: 'raiders', type: 'archers', lane: 'high', x: 94, hp: 85, morale: 78, order: 'hold', routed: false },
    { id: 'r-cavalry-1', side: 'raiders', type: 'cavalry', lane: 'flank', x: 90, hp: 92, morale: 80, order: 'advance', routed: false },
  ];
  return { tick: 0, units: [...crown, ...raiders], rallyCooldown: 0, message: 'The horns sound. Orders may be changed while paused.' };
}

const distance = (a: CombatUnit, b: CombatUnit) => Math.abs(a.x - b.x) + (a.lane === b.lane ? 0 : 18);

export function combatTick(state: CombatState): CombatState {
  const units = state.units.map((u) => ({ ...u }));
  const living = units.filter((u) => u.hp > 0 && !u.routed);
  for (const unit of living) {
    const enemies = living.filter((e) => e.side !== unit.side);
    if (!enemies.length) continue;
    const target = enemies.sort((a, b) => distance(unit, a) - distance(unit, b))[0];
    const inRange = distance(unit, target) <= stats[unit.type].range;
    if (!inRange && unit.order === 'advance') unit.x += (unit.side === 'crown' ? 1 : -1) * stats[unit.type].speed;
    if (inRange) {
      let damage = stats[unit.type].damage;
      if (unit.type === 'archers' && unit.lane === 'high') damage *= 1.45;
      if (unit.type === 'cavalry' && unit.lane === 'flank' && distance(unit, target) > 3) damage *= 1.35;
      if (target.order === 'brace' && target.type === 'infantry' && unit.type === 'cavalry') damage *= 0.35;
      if (unit.order === 'hold') damage *= 0.75;
      target.hp = Math.max(0, target.hp - damage);
      target.morale = Math.max(0, target.morale - damage * 0.55);
      if (target.morale <= 18 && target.hp > 0) target.routed = true;
    }
    if (unit.order === 'regroup') { unit.morale = Math.min(100, unit.morale + 6); unit.order = 'hold'; }
  }
  return { ...state, tick: state.tick + 1, units, rallyCooldown: Math.max(0, state.rallyCooldown - 1), message: 'Steel meets steel at Greyfen.' };
}

export function issueOrder(state: CombatState, id: string, order: Order): CombatState {
  return { ...state, units: state.units.map((u) => u.id === id ? { ...u, order } : u), message: `${order[0].toUpperCase()}${order.slice(1)} order issued.` };
}

export function rally(state: CombatState): CombatState {
  if (state.rallyCooldown > 0) return state;
  return { ...state, rallyCooldown: 12, units: state.units.map((u) => u.side === 'crown' && u.hp > 0 ? { ...u, morale: Math.min(100, u.morale + 35), routed: false } : u), message: 'Rally! The Crown Guard finds its nerve.' };
}

export function combatOutcome(state: CombatState): 'victory' | 'defeat' | null {
  const crown = state.units.some((u) => u.side === 'crown' && u.hp > 0 && !u.routed);
  const raiders = state.units.some((u) => u.side === 'raiders' && u.hp > 0 && !u.routed);
  if (!raiders) return 'victory';
  if (!crown) return 'defeat';
  return null;
}
