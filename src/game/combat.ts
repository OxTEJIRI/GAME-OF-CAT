import type { BattleReport, UnitType } from './types';

export type Lane = 'high' | 'road' | 'flank';
export type Order = 'advance' | 'hold' | 'brace' | 'regroup';
export type CombatUnit = { id: string; side: 'crown' | 'raiders'; type: UnitType; lane: Lane; x: number; hp: number; morale: number; order: Order; routed: boolean };
export type CombatState = { battleId: number; tick: number; units: CombatUnit[]; reserves: Record<UnitType, number>; deployed: Record<UnitType, number>; rallyCooldown: number; message: string };

export const DEPLOYMENT_LIMIT = 6;
export const MAX_BATTLE_TICKS = 220;
const unitTypes: UnitType[] = ['infantry', 'archers', 'cavalry'];
const lanes: Lane[] = ['high', 'road', 'flank'];
const stats: Record<UnitType, { damage: number; range: number; speed: number }> = {
  infantry: { damage: 7, range: 8, speed: 2.2 }, archers: { damage: 5, range: 34, speed: 1.2 }, cavalry: { damage: 10, range: 9, speed: 4.4 },
};

export function planDeployment(counts: Record<UnitType, number>) {
  const deployed: Record<UnitType, number> = { infantry: 0, archers: 0, cavalry: 0 };
  let slots = DEPLOYMENT_LIMIT;
  while (slots > 0 && unitTypes.some((type) => deployed[type] < counts[type])) {
    for (const type of unitTypes) if (slots > 0 && deployed[type] < counts[type]) { deployed[type] += 1; slots -= 1; }
  }
  return { deployed, reserves: { infantry: Math.max(0, counts.infantry - deployed.infantry), archers: Math.max(0, counts.archers - deployed.archers), cavalry: Math.max(0, counts.cavalry - deployed.cavalry) } };
}

export function createCombat(deployment: Record<UnitType, Lane>, counts: Record<UnitType, number>, scouted: boolean, battleId = 0): CombatState {
  const plan = planDeployment(counts);
  const crown = unitTypes.flatMap((type, typeIndex) => Array.from({ length: plan.deployed[type] }, (_, index): CombatUnit => ({
    id: `c-${type}-${index}`, side: 'crown', type, lane: deployment[type], x: 12 - index * 2.4 - typeIndex, hp: 100, morale: 100, order: 'advance', routed: false,
  })));
  const laneSlots: Record<Lane, number> = { high: 0, road: 0, flank: 0 };
  crown.forEach((unit) => { unit.x = 9 + laneSlots[unit.lane] * 17; laneSlots[unit.lane] += 1; });
  const raiders: CombatUnit[] = [
    { id: 'r-infantry-1', side: 'raiders', type: 'infantry', lane: 'road', x: 82, hp: scouted ? 86 : 100, morale: 86, order: 'advance', routed: false },
    { id: 'r-infantry-2', side: 'raiders', type: 'infantry', lane: 'high', x: 87, hp: 100, morale: 82, order: 'advance', routed: false },
    { id: 'r-archers-1', side: 'raiders', type: 'archers', lane: 'high', x: 94, hp: 85, morale: 78, order: 'hold', routed: false },
    { id: 'r-cavalry-1', side: 'raiders', type: 'cavalry', lane: 'flank', x: 90, hp: 92, morale: 80, order: 'advance', routed: false },
  ];
  return { battleId, tick: 0, units: [...crown, ...raiders], reserves: plan.reserves, deployed: plan.deployed, rallyCooldown: 0, message: 'The horns sound. Orders may be changed while paused.' };
}

const laneDistance = (a: Lane, b: Lane) => Math.abs(lanes.indexOf(a) - lanes.indexOf(b));
const sameLaneDistance = (a: CombatUnit, b: CombatUnit) => Math.abs(a.x - b.x);
const distance = (a: CombatUnit, b: CombatUnit) => sameLaneDistance(a, b) + laneDistance(a.lane, b.lane) * 18;
const chooseTarget = (unit: CombatUnit, enemies: CombatUnit[]) => [...enemies].sort((a, b) => distance(unit, a) - distance(unit, b) || a.id.localeCompare(b.id))[0];
function changeLaneToward(unit: CombatUnit, target: CombatUnit) { const from = lanes.indexOf(unit.lane); const to = lanes.indexOf(target.lane); unit.lane = lanes[from + Math.sign(to - from)]; }

export function combatTick(state: CombatState): CombatState {
  if (combatOutcome(state)) return state;
  const units = state.units.map((unit) => ({ ...unit }));
  const actingIds = units.filter((unit) => unit.hp > 0 && !unit.routed).map((unit) => unit.id);
  for (const id of actingIds) {
    const unit = units.find((candidate) => candidate.id === id)!;
    if (unit.hp <= 0 || unit.routed) continue;
    const enemies = units.filter((enemy) => enemy.side !== unit.side && enemy.hp > 0 && !enemy.routed);
    if (!enemies.length) continue;
    const target = chooseTarget(unit, enemies);
    if (unit.order === 'regroup') { unit.morale = Math.min(100, unit.morale + 8); unit.order = 'hold'; continue; }
    const rangedAcrossLanes = unit.type === 'archers' && sameLaneDistance(unit, target) <= stats.archers.range - laneDistance(unit.lane, target.lane) * 8;
    const inRange = (unit.lane === target.lane && sameLaneDistance(unit, target) <= stats[unit.type].range) || rangedAcrossLanes;
    if (!inRange && unit.order === 'advance') {
      const horizontalGap = sameLaneDistance(unit, target);
      if (unit.lane !== target.lane && (horizontalGap <= 30 || unit.x >= target.x)) changeLaneToward(unit, target);
      else unit.x += (unit.side === 'crown' ? 1 : -1) * stats[unit.type].speed;
    }
    const canAttack = (unit.lane === target.lane && sameLaneDistance(unit, target) <= stats[unit.type].range) || (unit.type === 'archers' && sameLaneDistance(unit, target) <= stats.archers.range - laneDistance(unit.lane, target.lane) * 8);
    if (!canAttack) continue;
    let damage = stats[unit.type].damage;
    if (unit.type === 'archers' && unit.lane === 'high') damage *= 1.45;
    if (unit.type === 'cavalry' && unit.lane === 'flank' && sameLaneDistance(unit, target) > 3) damage *= 1.35;
    if (target.order === 'brace' && target.type === 'infantry' && unit.type === 'cavalry') damage *= 0.35;
    if (unit.order === 'hold') damage *= 0.75;
    target.hp = Math.max(0, target.hp - damage); target.morale = Math.max(0, target.morale - damage * 0.55);
    if (target.morale <= 18 && target.hp > 0) target.routed = true;
  }
  return { ...state, tick: state.tick + 1, units, rallyCooldown: Math.max(0, state.rallyCooldown - 1), message: 'Steel meets steel at Greyfen.' };
}

export function issueOrder(state: CombatState, id: string, order: Order): CombatState { return { ...state, units: state.units.map((unit) => unit.id === id && unit.side === 'crown' ? { ...unit, order } : unit), message: `${order[0].toUpperCase()}${order.slice(1)} order issued.` }; }
export function rally(state: CombatState): CombatState { if (state.rallyCooldown > 0) return state; return { ...state, rallyCooldown: 12, units: state.units.map((unit) => unit.side === 'crown' && unit.hp > 0 ? { ...unit, morale: Math.min(100, unit.morale + 35), routed: false } : unit), message: 'Rally! The Crown Guard finds its nerve.' }; }
const strength = (state: CombatState, side: CombatUnit['side']) => state.units.filter((unit) => unit.side === side && unit.hp > 0).reduce((total, unit) => total + unit.hp + unit.morale * 0.5, 0);
export function combatOutcome(state: CombatState): 'victory' | 'defeat' | null {
  const crown = state.units.some((unit) => unit.side === 'crown' && unit.hp > 0 && !unit.routed); const raiders = state.units.some((unit) => unit.side === 'raiders' && unit.hp > 0 && !unit.routed);
  if (!raiders) return 'victory'; if (!crown) return 'defeat';
  if (state.tick >= MAX_BATTLE_TICKS) return strength(state, 'crown') > strength(state, 'raiders') ? 'victory' : 'defeat';
  return null;
}
export function summarizeCombat(state: CombatState, result: BattleReport['result']): BattleReport {
  const survivors: Record<UnitType, number> = { ...state.reserves }; const casualties: Record<UnitType, number> = { infantry: 0, archers: 0, cavalry: 0 };
  for (const unit of state.units.filter((candidate) => candidate.side === 'crown')) { if (unit.hp > 0) survivors[unit.type] += 1; else casualties[unit.type] += 1; }
  return { battleId: state.battleId, result, survivors, casualties, deployed: { ...state.deployed }, reserves: { ...state.reserves }, ticks: state.tick };
}
