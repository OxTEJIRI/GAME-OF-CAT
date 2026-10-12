import type { BattleReport, UnitType } from './types';

export type Lane = 'high' | 'road' | 'flank';
export type Order = 'advance' | 'hold' | 'brace' | 'regroup';
export type Side = 'crown' | 'raiders';
export type CombatUnit = { id: string; side: Side; type: UnitType; lane: Lane; x: number; hp: number; morale: number; order: Order; routed: boolean; dealt: number; targetId?: string; laneTarget?: Lane };
/** What happened during one tick, so the presentation can animate and sound it without re-deriving combat. */
export type CombatEvent = { kind: 'hit' | 'volley' | 'charge' | 'fall' | 'rout' | 'rally' | 'move'; side: Side; unitId: string; targetId?: string; amount?: number; lane: Lane; x: number };
export type CombatState = { battleId: number; tick: number; units: CombatUnit[]; reserves: Record<UnitType, number>; deployed: Record<UnitType, number>; rallyCooldown: number; message: string; events: CombatEvent[]; log: string[] };

export const DEPLOYMENT_LIMIT = 6;
export const MAX_BATTLE_TICKS = 220;
export const RALLY_COOLDOWN = 12;
const LOG_LENGTH = 5;
const unitTypes: UnitType[] = ['infantry', 'archers', 'cavalry'];
const lanes: Lane[] = ['high', 'road', 'flank'];
const stats: Record<UnitType, { damage: number; range: number; speed: number }> = {
  infantry: { damage: 7, range: 8, speed: 2.2 }, archers: { damage: 5, range: 34, speed: 1.2 }, cavalry: { damage: 10, range: 9, speed: 4.4 },
};
const laneNames: Record<Lane, string> = { high: 'the ridge', road: 'the road', flank: 'the open flank' };
const sideName = (side: Side) => side === 'crown' ? 'Crown' : 'Raider';
export const unitName = (unit: Pick<CombatUnit, 'side' | 'type'>) => `${sideName(unit.side)} ${unit.type}`;
const ambientLines = ['Steel meets steel at Greyfen.', 'Shields lock across the pass.', 'Snow and arrows fall together.', 'Banners lean into the wind.'];

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
    id: `c-${type}-${index}`, side: 'crown', type, lane: deployment[type], x: 12 - index * 2.4 - typeIndex, hp: 100, morale: 100, order: 'advance', routed: false, dealt: 0,
  })));
  const laneSlots: Record<Lane, number> = { high: 0, road: 0, flank: 0 };
  crown.forEach((unit) => { unit.x = 9 + laneSlots[unit.lane] * 17; laneSlots[unit.lane] += 1; });
  const raiders: CombatUnit[] = [
    { id: 'r-infantry-1', side: 'raiders', type: 'infantry', lane: 'road', x: 82, hp: scouted ? 86 : 100, morale: 86, order: 'advance', routed: false, dealt: 0 },
    { id: 'r-infantry-2', side: 'raiders', type: 'infantry', lane: 'high', x: 87, hp: 100, morale: 82, order: 'advance', routed: false, dealt: 0 },
    { id: 'r-archers-1', side: 'raiders', type: 'archers', lane: 'high', x: 94, hp: 85, morale: 78, order: 'hold', routed: false, dealt: 0 },
    { id: 'r-cavalry-1', side: 'raiders', type: 'cavalry', lane: 'flank', x: 90, hp: 92, morale: 80, order: 'advance', routed: false, dealt: 0 },
  ];
  const message = 'The horns sound. Orders may be changed while paused.';
  return { battleId, tick: 0, units: [...crown, ...raiders], reserves: plan.reserves, deployed: plan.deployed, rallyCooldown: 0, message, events: [], log: [message] };
}

const laneDistance = (a: Lane, b: Lane) => Math.abs(lanes.indexOf(a) - lanes.indexOf(b));
const sameLaneDistance = (a: CombatUnit, b: CombatUnit) => Math.abs(a.x - b.x);
const distance = (a: CombatUnit, b: CombatUnit) => sameLaneDistance(a, b) + laneDistance(a.lane, b.lane) * 18;
const isActive = (unit: CombatUnit) => unit.hp > 0 && !unit.routed;
function chooseTarget(unit: CombatUnit, enemies: CombatUnit[]) {
  const ordered = unit.targetId ? enemies.find((enemy) => enemy.id === unit.targetId) : undefined;
  return ordered ?? [...enemies].sort((a, b) => distance(unit, a) - distance(unit, b) || a.id.localeCompare(b.id))[0];
}
function stepLaneToward(unit: CombatUnit, lane: Lane) { const from = lanes.indexOf(unit.lane); const to = lanes.indexOf(lane); unit.lane = lanes[from + Math.sign(to - from)]; }
const withLog = (log: string[], message: string) => log[0] === message ? log : [message, ...log].slice(0, LOG_LENGTH);

/** The most dramatic event of a tick becomes the battle feed line. */
function describe(events: CombatEvent[], units: CombatUnit[], tick: number) {
  const byId = (id?: string) => units.find((unit) => unit.id === id);
  const fall = events.find((event) => event.kind === 'fall');
  if (fall) { const target = byId(fall.targetId)!; return `${unitName(target)} falls on ${laneNames[target.lane]}!`; }
  const rout = events.find((event) => event.kind === 'rout');
  if (rout) { const target = byId(rout.targetId)!; return target.side === 'raiders' ? `${unitName(target)} break and flee!` : `${unitName(target)} are breaking. Rally them!`; }
  const charge = events.find((event) => event.kind === 'charge');
  if (charge) { const unit = byId(charge.unitId)!; return `${unitName(unit)} charge into the ${byId(charge.targetId)!.type}!`; }
  if (events.some((event) => event.kind === 'hit' || event.kind === 'volley')) return ambientLines[tick % ambientLines.length];
  return 'The lines close across Greyfen.';
}

export function combatTick(state: CombatState): CombatState {
  if (combatOutcome(state)) return state;
  const units = state.units.map((unit) => ({ ...unit }));
  const events: CombatEvent[] = [];
  const actingIds = units.filter(isActive).map((unit) => unit.id);
  for (const id of actingIds) {
    const unit = units.find((candidate) => candidate.id === id)!;
    if (!isActive(unit)) continue;
    const enemies = units.filter((enemy) => enemy.side !== unit.side && isActive(enemy));
    if (!enemies.length) continue;
    if (unit.targetId && !enemies.some((enemy) => enemy.id === unit.targetId)) delete unit.targetId;
    if (unit.laneTarget && unit.laneTarget !== unit.lane) {
      stepLaneToward(unit, unit.laneTarget);
      events.push({ kind: 'move', side: unit.side, unitId: unit.id, lane: unit.lane, x: unit.x });
      if (unit.lane === unit.laneTarget) delete unit.laneTarget;
      continue;
    }
    delete unit.laneTarget;
    const target = chooseTarget(unit, enemies);
    if (unit.order === 'regroup') { unit.morale = Math.min(100, unit.morale + 8); unit.order = 'hold'; continue; }
    const rangedAcrossLanes = unit.type === 'archers' && sameLaneDistance(unit, target) <= stats.archers.range - laneDistance(unit.lane, target.lane) * 8;
    const inRange = (unit.lane === target.lane && sameLaneDistance(unit, target) <= stats[unit.type].range) || rangedAcrossLanes;
    if (!inRange && unit.order === 'advance') {
      const horizontalGap = sameLaneDistance(unit, target);
      if (unit.lane !== target.lane && (horizontalGap <= 30 || unit.x >= target.x)) stepLaneToward(unit, target.lane);
      else unit.x += (unit.side === 'crown' ? 1 : -1) * stats[unit.type].speed;
    }
    const canAttack = (unit.lane === target.lane && sameLaneDistance(unit, target) <= stats[unit.type].range) || (unit.type === 'archers' && sameLaneDistance(unit, target) <= stats.archers.range - laneDistance(unit.lane, target.lane) * 8);
    if (!canAttack) continue;
    let damage = stats[unit.type].damage;
    if (unit.type === 'archers' && unit.lane === 'high') damage *= 1.45;
    const charging = unit.type === 'cavalry' && unit.lane === 'flank' && sameLaneDistance(unit, target) > 3;
    if (charging) damage *= 1.35;
    if (target.order === 'brace' && target.type === 'infantry' && unit.type === 'cavalry') damage *= 0.35;
    if (unit.order === 'hold') damage *= 0.75;
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage); target.morale = Math.max(0, target.morale - damage * 0.55);
    unit.dealt += dealt;
    events.push({ kind: charging ? 'charge' : unit.type === 'archers' ? 'volley' : 'hit', side: unit.side, unitId: unit.id, targetId: target.id, amount: Math.round(damage), lane: target.lane, x: target.x });
    if (target.hp <= 0) events.push({ kind: 'fall', side: unit.side, unitId: unit.id, targetId: target.id, lane: target.lane, x: target.x });
    else if (target.morale <= 18) { target.routed = true; events.push({ kind: 'rout', side: unit.side, unitId: unit.id, targetId: target.id, lane: target.lane, x: target.x }); }
  }
  const message = describe(events, units, state.tick);
  return { ...state, tick: state.tick + 1, units, rallyCooldown: Math.max(0, state.rallyCooldown - 1), message, events, log: withLog(state.log, message) };
}

const ordered = (state: CombatState, units: CombatUnit[], message: string): CombatState => ({ ...state, units, message, events: [], log: withLog(state.log, message) });

export function issueOrder(state: CombatState, id: string, order: Order): CombatState {
  return ordered(state, state.units.map((unit) => unit.id === id && unit.side === 'crown' ? { ...unit, order } : unit), `${order[0].toUpperCase()}${order.slice(1)} order issued.`);
}

/** Direct a Crown squad at one visible enemy; it advances until that enemy falls or routs. */
export function focusTarget(state: CombatState, id: string, targetId: string): CombatState {
  const unit = state.units.find((candidate) => candidate.id === id && candidate.side === 'crown' && isActive(candidate));
  const target = state.units.find((candidate) => candidate.id === targetId && candidate.side === 'raiders' && isActive(candidate));
  if (!unit || !target) return state;
  return ordered(state, state.units.map((candidate) => candidate.id === id ? { ...candidate, targetId, order: 'advance' } : candidate), 'Attack order issued.');
}

/** Shift a Crown squad one lane up (-1) or down (+1); the move takes its next action. */
export function shiftLane(state: CombatState, id: string, direction: -1 | 1): CombatState {
  const unit = state.units.find((candidate) => candidate.id === id && candidate.side === 'crown' && isActive(candidate));
  if (!unit) return state;
  const index = lanes.indexOf(unit.laneTarget ?? unit.lane) + direction;
  if (index < 0 || index >= lanes.length) return ordered(state, state.units, 'No road lies that way.');
  return ordered(state, state.units.map((candidate) => candidate.id === id ? { ...candidate, laneTarget: lanes[index] } : candidate), 'Move order issued.');
}

export function rally(state: CombatState): CombatState {
  if (state.rallyCooldown > 0) return state;
  const message = 'Rally! The Crown Guard finds its nerve.';
  const units = state.units.map((unit) => unit.side === 'crown' && unit.hp > 0 ? { ...unit, morale: Math.min(100, unit.morale + 35), routed: false } : unit);
  const events: CombatEvent[] = units.filter((unit) => unit.side === 'crown' && unit.hp > 0).map((unit) => ({ kind: 'rally', side: 'crown', unitId: unit.id, lane: unit.lane, x: unit.x }));
  return { ...state, rallyCooldown: RALLY_COOLDOWN, units, message, events, log: withLog(state.log, message) };
}

const strength = (state: CombatState, side: Side) => state.units.filter((unit) => unit.side === side && unit.hp > 0).reduce((total, unit) => total + unit.hp + unit.morale * 0.5, 0);
/** Share of remaining fighting strength held by the Crown, 0–1, for the battle balance bar. */
export function crownAdvantage(state: CombatState) { const crown = strength(state, 'crown'); const raiders = strength(state, 'raiders'); return crown + raiders === 0 ? 0.5 : crown / (crown + raiders); }

export function combatOutcome(state: CombatState): 'victory' | 'defeat' | null {
  const crown = state.units.some((unit) => unit.side === 'crown' && isActive(unit)); const raiders = state.units.some((unit) => unit.side === 'raiders' && isActive(unit));
  if (!raiders) return 'victory'; if (!crown) return 'defeat';
  if (state.tick >= MAX_BATTLE_TICKS) return strength(state, 'crown') > strength(state, 'raiders') ? 'victory' : 'defeat';
  return null;
}
export function summarizeCombat(state: CombatState, result: BattleReport['result']): BattleReport {
  const survivors: Record<UnitType, number> = { ...state.reserves }; const casualties: Record<UnitType, number> = { infantry: 0, archers: 0, cavalry: 0 };
  for (const unit of state.units.filter((candidate) => candidate.side === 'crown')) { if (unit.hp > 0) survivors[unit.type] += 1; else casualties[unit.type] += 1; }
  return { battleId: state.battleId, result, survivors, casualties, deployed: { ...state.deployed }, reserves: { ...state.reserves }, ticks: state.tick };
}

/** Post-battle honours: 3 stars for no losses, 2 for one, otherwise 1 (0 on defeat). */
export function battleHonours(state: CombatState, result: 'victory' | 'defeat') {
  const crown = state.units.filter((unit) => unit.side === 'crown');
  const raiders = state.units.filter((unit) => unit.side === 'raiders');
  const lost = crown.filter((unit) => unit.hp <= 0).length;
  const champion = [...crown].sort((a, b) => b.dealt - a.dealt || a.id.localeCompare(b.id))[0];
  return {
    stars: result === 'defeat' ? 0 : lost === 0 ? 3 : lost === 1 ? 2 : 1,
    lost,
    felled: raiders.filter((unit) => unit.hp <= 0).length,
    routed: raiders.filter((unit) => unit.hp > 0 && unit.routed).length,
    damage: Math.round(crown.reduce((sum, unit) => sum + unit.dealt, 0)),
    champion: champion && champion.dealt > 0 ? { name: unitName(champion), damage: Math.round(champion.dealt) } : undefined,
  };
}
