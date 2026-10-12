import { useEffect, useRef, useState } from 'react';
import { refs, units } from '../content/gameContent';
import { DEPLOYMENT_LIMIT, RALLY_COOLDOWN, battleHonours, combatOutcome, combatTick, createCombat, crownAdvantage, focusTarget, issueOrder, planDeployment, rally, shiftLane, summarizeCombat, unitName, type CombatEvent, type CombatState, type CombatUnit, type Lane, type Order } from '../game/combat';
import { applyBattleResult } from '../game/rules';
import type { GameState, UnitType } from '../game/types';
import { gameAudio, type AudioCue } from '../services/audio';
import { TutorialCallout, type TutorialControls } from './common';
import './battle.css';

type Commit = (next: GameState | ((s: GameState) => GameState)) => void;
type Fx = { id: string; kind: 'damage' | 'spark' | 'arrow' | 'banner' | 'tag' | 'ring'; lane: Lane; x: number; fromLane?: Lane; fromX?: number; text?: string; tone?: 'crown' | 'raiders'; spread?: number };

const TICK_MS = 650;
const FX_LIFE_MS = 1100;
const unitTypes: UnitType[] = ['infantry', 'archers', 'cavalry'];
const lanes: Lane[] = ['high', 'road', 'flank'];
const laneTop: Record<Lane, number> = { high: 22, road: 51, flank: 78 };
const laneLabel: Record<Lane, string> = { high: 'High ground', road: 'Central road', flank: 'Open flank' };
const orderKeys: Record<Order, string> = { advance: 'A', hold: 'H', brace: 'B', regroup: 'G' };
const fieldX = (x: number) => Math.max(3, Math.min(94, x));
const isActive = (unit: CombatUnit) => unit.hp > 0 && !unit.routed;
const enemyIntel: Record<Lane, string[]> = { high: ['Infantry', 'Archers'], road: ['Infantry'], flank: ['Cavalry'] };

export function Battle({ game, commit, tutorial }: { game: GameState; commit: Commit; tutorial: TutorialControls }) {
  return <>
    {tutorial.state.active && tutorial.state.step === 'deployment' && <TutorialCallout className="tutorial-battle tutorial-deployment" title="Place the three arms" onSkip={tutorial.skip}>Choose a lane for each troop type, then begin. Reserves replace losses after the fight.</TutorialCallout>}
    {tutorial.state.active && tutorial.state.step === 'battle' && <TutorialCallout className="tutorial-battle tutorial-orders" title="Command while time moves" onSkip={tutorial.skip}>Select any Crown squad, issue any order, and pause whenever you need time to read the field. Tap a raider to focus your attack.</TutorialCallout>}
    <BattleCore game={game} commit={commit} tutorial={tutorial} />
  </>;
}

/** Turn one tick of combat events into short-lived visual effects. */
function effectsFor(events: CombatEvent[], units: CombatUnit[], stamp: number): Fx[] {
  const fx: Fx[] = [];
  const hitsOn = new Map<string, number>();
  events.slice(0, 14).forEach((event, index) => {
    const id = `${stamp}-${index}`;
    const victimTone = event.side === 'crown' ? 'raiders' : 'crown';
    if (event.kind === 'hit' || event.kind === 'volley' || event.kind === 'charge') {
      // Several hits on one squad in a tick fan out instead of stacking on top of each other.
      const nth = hitsOn.get(event.targetId!) ?? 0; hitsOn.set(event.targetId!, nth + 1);
      fx.push({ id: `${id}-d`, kind: 'damage', lane: event.lane, x: event.x, text: `−${event.amount}`, tone: victimTone, spread: nth });
      fx.push({ id: `${id}-s`, kind: 'spark', lane: event.lane, x: event.x, tone: victimTone });
      if (event.kind === 'volley') { const shooter = units.find((unit) => unit.id === event.unitId); if (shooter) fx.push({ id: `${id}-a`, kind: 'arrow', lane: event.lane, x: event.x, fromLane: shooter.lane, fromX: shooter.x, tone: event.side === 'crown' ? 'crown' : 'raiders' }); }
      if (event.kind === 'charge') fx.push({ id: `${id}-c`, kind: 'banner', lane: event.lane, x: event.x, text: 'Charge!', tone: event.side === 'crown' ? 'crown' : 'raiders' });
    }
    if (event.kind === 'fall') fx.push({ id: `${id}-f`, kind: 'tag', lane: event.lane, x: event.x, text: 'Fallen', tone: victimTone });
    if (event.kind === 'rout') fx.push({ id: `${id}-r`, kind: 'tag', lane: event.lane, x: event.x, text: 'Routed', tone: victimTone });
    if (event.kind === 'rally') fx.push({ id: `${id}-g`, kind: 'ring', lane: event.lane, x: event.x, tone: 'crown' });
  });
  return fx;
}

/** At most one sound per kind per tick, loudest moments first. */
function soundsFor(events: CombatEvent[]): AudioCue[] {
  const has = (kind: CombatEvent['kind']) => events.some((event) => event.kind === kind);
  const cues: AudioCue[] = [];
  if (has('rally')) cues.push('rally');
  if (has('charge')) cues.push('charge');
  if (has('fall')) cues.push('fall');
  if (has('rout')) cues.push('rout');
  if (has('volley')) cues.push('arrow');
  if (has('hit')) cues.push(events.some((event) => event.kind === 'hit' && event.amount && event.amount >= 7) ? 'clash' : 'hit');
  return cues;
}

function planAdvice(deployment: Record<UnitType, Lane>, fielded: Record<UnitType, number>) {
  const tips: { good: boolean; text: string }[] = [];
  if (fielded.infantry) tips.push(deployment.infantry === 'road' ? { good: true, text: 'Infantry hold the road. Brace them when riders close in.' } : { good: false, text: 'The central road is open. Raider infantry will push straight through.' });
  if (fielded.archers) tips.push(deployment.archers === 'high' ? { good: true, text: 'Archers on the ridge strike 45% harder.' } : { good: false, text: 'Archers off the ridge lose their height advantage.' });
  if (fielded.cavalry) tips.push(deployment.cavalry === 'flank' ? { good: true, text: 'Cavalry on the open flank can build a charge (+35%).' } : { good: false, text: 'Cavalry need the open flank to charge.' });
  return tips;
}

function BattleCore({ game, commit, tutorial }: { game: GameState; commit: Commit; tutorial: TutorialControls }) {
  const [deployment, setDeployment] = useState<Record<UnitType, Lane>>({ infantry: 'road', archers: 'high', cavalry: 'flank' });
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [selected, setSelected] = useState('c-infantry-0');
  const [pauseReason, setPauseReason] = useState('Orders remain available while paused.');
  const [fx, setFx] = useState<Fx[]>([]);
  const [shake, setShake] = useState(false);
  const [intro, setIntro] = useState(false);
  const stamp = useRef(0);
  const outcome = combat ? combatOutcome(combat) : null;
  const scouted = game.chapter.scoutedLocations.includes('pass') || game.chapter.scoutedLocations.includes('watchtower');
  const plan = planDeployment(game.chapter.army);

  useEffect(() => {
    if (!combat || paused || outcome) return;
    const id = window.setInterval(() => setCombat((current) => current ? combatTick(current) : current), TICK_MS / speed);
    return () => clearInterval(id);
  }, [!!combat, paused, outcome, speed]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) { setPaused(true); setPauseReason('Battle paused because the tab became hidden.'); } };
    document.addEventListener('visibilitychange', visibility); return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  // Every new batch of events becomes effects and sound; effects expire on their own.
  useEffect(() => {
    if (!combat?.events.length) return;
    stamp.current += 1;
    const born = effectsFor(combat.events, combat.units, stamp.current);
    setFx((current) => [...current.slice(-30), ...born]);
    soundsFor(combat.events).forEach((cue, index) => window.setTimeout(() => void gameAudio.cue(cue), index * 70));
    if (combat.events.some((event) => event.kind === 'charge' || event.kind === 'fall')) { setShake(true); window.setTimeout(() => setShake(false), 360); }
    const ids = new Set(born.map((item) => item.id));
    const timer = window.setTimeout(() => setFx((current) => current.filter((item) => !ids.has(item.id))), FX_LIFE_MS);
    return () => clearTimeout(timer);
  }, [combat?.events]);

  // Keep a living Crown squad selected.
  useEffect(() => {
    if (!combat) return;
    const current = combat.units.find((unit) => unit.id === selected);
    if (current && isActive(current)) return;
    const next = combat.units.find((unit) => unit.side === 'crown' && isActive(unit));
    if (next) setSelected(next.id);
  }, [combat, selected]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!combat || outcome) return;
      const pressed = event.key.toLowerCase();
      if (event.key === ' ') { event.preventDefault(); setPaused((value) => !value); }
      const crownIds = combat.units.filter((unit) => unit.side === 'crown' && unit.hp > 0).map((unit) => unit.id);
      const number = Number(event.key); if (number >= 1 && number <= crownIds.length) { setSelected(crownIds[number - 1]); void gameAudio.cue('select'); }
      const keys: Record<string, Order> = { a: 'advance', h: 'hold', b: 'brace', g: 'regroup' };
      if (keys[pressed]) { setCombat(issueOrder(combat, selected, keys[pressed])); void gameAudio.cue('order'); }
      if (pressed === 'w') { setCombat(shiftLane(combat, selected, -1)); void gameAudio.cue('order'); }
      if (pressed === 's') { setCombat(shiftLane(combat, selected, 1)); void gameAudio.cue('order'); }
      if (pressed === 'r') setCombat(rally(combat));
      if (pressed === 'f') setSpeed((value) => value === 1 ? 2 : 1);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [combat, selected, outcome]);
  useEffect(() => { if (outcome) { void gameAudio.cue(outcome === 'victory' ? 'victory' : 'defeat'); tutorial.complete('battle'); } }, [outcome]);
  useEffect(() => { if (combat) tutorial.complete('deployment'); }, [!!combat]);
  useEffect(() => { if (combat?.message.endsWith('issued.') || combat?.message.startsWith('Rally!')) tutorial.complete('battle'); }, [combat?.message]);

  const begin = () => {
    setCombat(createCombat(deployment, game.chapter.army, scouted, game.chapter.battleAttempts));
    setPaused(false); setIntro(true);
    window.setTimeout(() => setIntro(false), 1900);
    void gameAudio.cue('drums'); window.setTimeout(() => void gameAudio.cue('horn'), 650);
  };

  if (!combat) {
    const tips = planAdvice(deployment, plan.deployed);
    return <main className="battle-prep cinematic-prep"><section><p className="kicker">Greyfen Pass · deployment</p><h1>Hold the road. Break their false banner.</h1><div className="battle-objective"><b>Objective</b><span>Route every raider squad. Rally once morale breaks; retreat preserves survivors.</span></div><p>{scouted ? 'Scouts reveal archers on the ridge and cavalry on the eastern flank.' : 'Enemy positions are uncertain. The ridge may conceal ranged troops.'}</p><p className="deployment-limit">Field limit: {DEPLOYMENT_LIMIT} squads. Reserves remain safe and replace losses after battle.</p>
      <div className="lane-plan" aria-label="Battle plan by lane">{lanes.map((lane) => <div key={lane} className="lane-plan-row"><span className="lane-plan-name">{laneLabel[lane]}</span><span className="lane-plan-side crown">{unitTypes.filter((type) => plan.deployed[type] && deployment[type] === lane).map((type) => <i key={type} className={`squad-chip ${type}`}>{units[type].name} ×{plan.deployed[type]}</i>)}</span><span className="lane-plan-vs" aria-hidden="true">vs</span><span className="lane-plan-side raiders">{scouted ? enemyIntel[lane].map((name) => <i key={name} className="squad-chip enemy">{name}</i>) : <i className="squad-chip unknown">Unknown</i>}</span></div>)}</div>
      <ul className="plan-tips">{tips.map((tip) => <li key={tip.text} className={tip.good ? 'good' : 'risk'}>{tip.text}</li>)}</ul>
      <div className="deployment-grid">{unitTypes.map((type) => <article key={type} className={`deploy-${type}`}><div className={`deploy-crest ${type}`} aria-hidden="true" /><h3>{units[type].name} <span>{plan.deployed[type]} fielded · {plan.reserves[type]} reserve</span></h3><p>{units[type].note}</p><label>Starting lane<select value={deployment[type]} onChange={(event) => { setDeployment({ ...deployment, [type]: event.target.value as Lane }); void gameAudio.cue('select'); }}><option value="high">High ground</option><option value="road">Central road</option><option value="flank">Open flank</option></select></label></article>)}</div></section>
      <aside><img src={refs.north} alt="Grey-brown tabby Northern Lord candidate with yellow-green eyes, dark fur cloak, leather clothing, and round metal brooch." /><p><b>Northern Lord candidate</b><span>Portrait from supplied reference</span></p><blockquote>“Infantry for the road. Bows above it. Give the horses room, or do not bring them.”</blockquote><button className="primary full" onClick={begin}>Begin battle</button><button className="full" onClick={() => commit({ ...game, screen: 'map' })}>Return to map</button></aside></main>;
  }

  const selectedUnit = combat.units.find((unit) => unit.id === selected);
  const target = selectedUnit?.targetId ? combat.units.find((unit) => unit.id === selectedUnit.targetId) : undefined;
  const advantage = Math.round(crownAdvantage(combat) * 100);
  const order = (value: Order) => { setCombat(issueOrder(combat, selected, value)); void gameAudio.cue('order'); };
  const move = (direction: -1 | 1) => { setCombat(shiftLane(combat, selected, direction)); void gameAudio.cue('order'); };
  const retreat = () => commit(applyBattleResult(game, summarizeCombat(combat, 'retreat')));
  const tapUnit = (unit: CombatUnit) => {
    if (unit.side === 'crown') { if (isActive(unit)) { setSelected(unit.id); void gameAudio.cue('select'); } return; }
    if (selectedUnit && isActive(selectedUnit) && isActive(unit)) { setCombat(focusTarget(combat, selectedUnit.id, unit.id)); void gameAudio.cue('order'); }
  };

  return <main className={`battle-screen cinematic-battle ${paused ? 'is-paused' : ''}`}>
    <header>
      <div><p className="kicker">Objective: break the false banner</p><h1>Greyfen Pass</h1></div>
      <div className="battle-status"><span>Battle time {combat.tick}</span><b>{paused ? 'Orders paused' : speed === 2 ? 'Battle running · 2×' : 'Battle running'}</b><div className="balance" role="meter" aria-label="Crown share of battlefield strength" aria-valuemin={0} aria-valuemax={100} aria-valuenow={advantage}><span style={{ width: `${advantage}%` }} /></div><small className="balance-labels"><i>Crown {advantage}%</i><i>Raiders {100 - advantage}%</i></small></div>
      <div className="battle-actions"><button className="speed-toggle" aria-pressed={speed === 2} onClick={() => { setSpeed(speed === 1 ? 2 : 1); void gameAudio.cue('select'); }}>Speed {speed}× <kbd>F</kbd></button><button onClick={() => { setPaused(!paused); setPauseReason('Orders remain available while paused.'); void gameAudio.cue('select'); }}>{paused ? 'Resume' : 'Pause'} <kbd>Space</kbd></button><button className="danger" onClick={retreat}>Retreat</button></div>
    </header>
    <section className={`battlefield ${shake ? 'shake' : ''}`} aria-label="Animated tactical battlefield">
      <div className="weather" aria-hidden="true" /><div className="ridge">HIGH GROUND</div><div className="road">CENTRAL ROAD</div><div className="flank">OPEN FLANK</div>
      {combat.units.map((unit) => <button key={unit.id} title={unit.side === 'raiders' ? 'Tap to focus the selected squad on this raider' : undefined} aria-label={`${unit.side} ${unit.type}, ${Math.round(unit.hp)} health, ${Math.round(unit.morale)} morale`} className={`unit troop ${unit.side} ${unit.type} ${unit.order} ${unit.routed ? 'routed' : ''} ${unit.hp <= 0 ? 'fallen' : ''} ${selected === unit.id ? 'selected' : ''} ${target?.id === unit.id ? 'targeted' : ''}`} style={{ left: `${fieldX(unit.x)}%`, top: `${laneTop[unit.lane]}%` }} onClick={() => tapUnit(unit)}><span className="troop-figure" aria-hidden="true" /><span className="unit-readout"><b>{unit.type}</b><i className="health"><span style={{ width: `${unit.hp}%` }} /></i><i className="morale"><span style={{ width: `${unit.morale}%` }} /></i><small>{Math.round(unit.hp)} health · {Math.round(unit.morale)} morale</small></span></button>)}
      <div className="fx-layer" aria-hidden="true">{fx.map((item) => <i key={item.id} className={`fx fx-${item.kind} ${item.tone ?? ''}`} style={{ left: `${fieldX(item.x)}%`, top: `${laneTop[item.lane]}%`, ...(item.spread !== undefined ? { '--spread-x': `${[0, -26, 26, -48, 48][item.spread % 5]}px`, '--spread-y': `${-item.spread * 12}px`, animationDelay: `${item.spread * 90}ms` } : {}), ...(item.kind === 'arrow' ? { '--from-x': `${fieldX(item.fromX ?? item.x)}%`, '--from-y': `${laneTop[item.fromLane ?? item.lane] - 4}%`, '--to-x': `${fieldX(item.x)}%`, '--to-y': `${laneTop[item.lane] - 4}%` } : {}) } as React.CSSProperties}>{item.text}</i>)}</div>
      {intro && <div className="battle-intro" aria-hidden="true"><b>The horns sound</b><span>Greyfen Pass</span></div>}
      {paused && !outcome && <div className="pause-veil"><b>Paused</b><span>{pauseReason}</span></div>}
    </section>
    <footer className="command-deck">
      <div className="selected-unit">
        {selectedUnit && <div className="unit-card"><b>Selected: {unitName(selectedUnit)}</b><span>{selectedUnit.order} order · {laneLabel[selectedUnit.laneTarget ?? selectedUnit.lane]}{selectedUnit.laneTarget ? ' (moving)' : ''}{target ? ` · focus: ${unitName(target)}` : ''}</span><div className="unit-card-bars"><i className="health"><span style={{ width: `${selectedUnit.hp}%` }} /></i><i className="morale"><span style={{ width: `${selectedUnit.morale}%` }} /></i></div></div>}
        <ol className="battle-feed" aria-live="polite" aria-label="Battle feed">{combat.log.map((line, index) => <li key={`${index}-${line}`} className={index === 0 ? 'latest' : ''}>{line}</li>)}</ol>
      </div>
      <div className="orders">
        {(['advance', 'hold', 'brace', 'regroup'] as Order[]).map((value) => <button key={value} className={selectedUnit?.order === value ? 'active' : ''} onClick={() => order(value)}>{value} <kbd>{orderKeys[value]}</kbd></button>)}
        <button className="lane-move" aria-label="Move squad up a lane" title="Move squad up a lane (W)" onClick={() => move(-1)}>↑ <kbd>W</kbd></button>
        <button className="lane-move" aria-label="Move squad down a lane" title="Move squad down a lane (S)" onClick={() => move(1)}>↓ <kbd>S</kbd></button>
        <button className="rally" disabled={combat.rallyCooldown > 0} style={{ '--cooldown': `${(combat.rallyCooldown / RALLY_COOLDOWN) * 100}%` } as React.CSSProperties} onClick={() => setCombat(rally(combat))}>Rally {combat.rallyCooldown ? `· ${combat.rallyCooldown}` : 'ready'} <kbd>R</kbd></button>
      </div>
    </footer>
    {outcome && <BattleResult combat={combat} outcome={outcome} onClaim={() => commit(applyBattleResult(game, summarizeCombat(combat, outcome)))} />}
  </main>;
}

function BattleResult({ combat, outcome, onClaim }: { combat: CombatState; outcome: 'victory' | 'defeat'; onClaim(): void }) {
  const honours = battleHonours(combat, outcome);
  const summary = summarizeCombat(combat, outcome);
  return <div className="modal-backdrop battle-result"><section className={`modal result-${outcome}`} role="dialog" aria-modal="true" aria-label="Battle result">
    <p className="kicker">Battle result</p>
    <h2>{outcome === 'victory' ? 'The false banner falls.' : 'The royal line breaks.'}</h2>
    {outcome === 'victory' && <div className="honours" role="img" aria-label={`${honours.stars} of 3 battle honours`}>{[0, 1, 2].map((index) => <span key={index} className={index < honours.stars ? 'won' : ''} style={{ animationDelay: `${0.25 + index * 0.22}s` }}>★</span>)}</div>}
    <p>{outcome === 'victory' ? 'Greyfen is secure. Surviving raiders carried counterfeit royal orders.' : 'Your ruler is trapped beyond the broken infantry line.'}</p>
    <dl className="battle-stats"><div><dt>Raiders felled</dt><dd>{honours.felled}</dd></div><div><dt>Raiders routed</dt><dd>{honours.routed}</dd></div><div><dt>Damage dealt</dt><dd>{honours.damage}</dd></div><div><dt>Battle time</dt><dd>{combat.tick}</dd></div></dl>
    {honours.champion && <p className="champion">Champion of the field: <b>{honours.champion.name}</b> · {honours.champion.damage} damage</p>}
    <div className="casualty-preview">{unitTypes.map((type) => <span key={type}>{units[type].name}: {summary.survivors[type]} survive, {summary.casualties[type]} lost</span>)}</div>
    <button className="primary" onClick={onClaim}>{outcome === 'victory' ? 'Claim the field' : 'Face the final blow'}</button>
  </section></div>;
}
