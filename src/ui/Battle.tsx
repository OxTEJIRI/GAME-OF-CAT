import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { refs, units } from '../content/gameContent';
import { DEPLOYMENT_LIMIT, RALLY_COOLDOWN, battleHonours, combatOutcome, combatTick, createCombat, crownAdvantage, focusTarget, issueOrder, planDeployment, rally, shiftLane, summarizeCombat, unitName, type CombatEvent, type CombatState, type CombatUnit, type Lane, type Order } from '../game/combat';
import { applyBattleResult } from '../game/rules';
import type { GameState, UnitType } from '../game/types';
import { gameAudio, type AudioCue } from '../services/audio';
import type { TutorialControls } from './common';
import type { Projector } from './Battlefield3D';
import { GuideCoach } from './Guide';
const Battlefield3D = lazy(() => import('./Battlefield3D').then((module) => ({ default: module.Battlefield3D })));
import './battle.css';

type Commit = (next: GameState | ((s: GameState) => GameState)) => void;
type Fx = { id: string; kind: 'damage' | 'spark' | 'arrow' | 'banner' | 'tag' | 'ring'; lane: Lane; x: number; fromLane?: Lane; fromX?: number; text?: string; tone?: 'crown' | 'raiders'; spread?: number };

const TICK_MS = 650;
const FX_LIFE_MS = 1100;
const unitTypes: UnitType[] = ['infantry', 'archers', 'cavalry'];
const lanes: Lane[] = ['high', 'road', 'flank'];
const laneTop: Record<Lane, number> = { high: 22, road: 51, flank: 78 };
const laneLabel: Record<Lane, string> = { high: 'High ground', road: 'Central road', flank: 'Open flank' };
const laneShort: Record<Lane, string> = { high: 'Ridge', road: 'Road', flank: 'Flank' };
const orderKeys: Record<Order, string> = { advance: 'A', hold: 'H', brace: 'B', regroup: 'G' };
const fieldX = (x: number) => Math.max(3, Math.min(94, x));
const isActive = (unit: CombatUnit) => unit.hp > 0 && !unit.routed;
const enemyIntel: Record<Lane, string[]> = { high: ['Infantry', 'Archers'], road: ['Infantry'], flank: ['Cavalry'] };

export function Battle({ game, commit, tutorial }: { game: GameState; commit: Commit; tutorial: TutorialControls }) {
  return <BattleCore game={game} commit={commit} tutorial={tutorial} />;
}

/** Small heraldic glyphs for squad types: shield, bow, and horse. */
function UnitGlyph({ type }: { type: UnitType }) {
  const paths: Record<UnitType, string> = {
    infantry: 'M12 2 20 5v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z',
    archers: 'M6 3q12 9 0 18M6 3v18M4 12h16m-3-3 3 3-3 3',
    cavalry: 'M5 21v-6l3-5-2-4 4 1 3-3 1 4 4 3v3l-3-1-2 3v5',
  };
  return <svg className={`unit-glyph ${type}`} viewBox="0 0 24 24" aria-hidden="true"><path d={paths[type]} /></svg>;
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
  const [projector, setProjector] = useState<Projector | null>(null);
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
    const place = (type: UnitType, lane: Lane) => { setDeployment({ ...deployment, [type]: lane }); void gameAudio.cue('order'); };
    return <main className="battle-prep cinematic-prep war-room">
      <section className="prep-main">
        <header className="prep-head"><p className="kicker">Greyfen Pass · deployment</p><h1>Hold the road. Break their false banner.</h1></header>
        <div className="battle-objective"><b>Objective</b><span>Rout every raider squad. Rally when morale breaks; retreat preserves survivors.</span></div>
        <div className="war-table" aria-label="War table: your deployment against scouted raiders">
          <span className="war-table-title">War table · Greyfen Pass</span>
          {lanes.map((lane) => <div key={lane} className={`war-lane lane-${lane}`}>
            <span className="war-lane-name">{laneLabel[lane]}</span>
            <span className="war-lane-crown">{unitTypes.filter((type) => plan.deployed[type] && deployment[type] === lane).map((type) => <i key={type} className={`war-token crown ${type}`} title={`${units[type].name} ×${plan.deployed[type]}`}><UnitGlyph type={type} /><b>{plan.deployed[type]}</b></i>)}</span>
            <span className="war-lane-path" aria-hidden="true" />
            <span className="war-lane-raiders">{scouted ? enemyIntel[lane].map((name) => <i key={name} className={`war-token raiders ${name.toLowerCase()}`} title={`Raider ${name.toLowerCase()}`}><UnitGlyph type={name.toLowerCase() as UnitType} /></i>) : <i className="war-token unknown" title="Unscouted">?</i>}</span>
          </div>)}
          <p className="war-table-intel">{scouted ? 'Scouts report archers on the ridge, infantry on the road, and riders on the open flank.' : 'Enemy positions unknown. Scouting Crow Watch would reveal them.'}</p>
        </div>
        <div className="deploy-planner" role="group" aria-label="Choose a starting lane for each squad">{unitTypes.map((type) => <article key={type} className={`deploy-card ${type} ${plan.deployed[type] ? '' : 'empty'}`}>
          <div className="deploy-card-head"><UnitGlyph type={type} /><h3>{units[type].name}</h3><small>{plan.deployed[type]} fielded · {plan.reserves[type]} reserve</small></div>
          <div className="lane-choice" role="radiogroup" aria-label={`${units[type].name} starting lane`}>{lanes.map((lane) => <button key={lane} role="radio" aria-checked={deployment[type] === lane} className={deployment[type] === lane ? 'chosen' : ''} disabled={!plan.deployed[type]} onClick={() => place(type, lane)}>{laneShort[lane]}</button>)}</div>
        </article>)}</div>
      </section>
      <aside className="prep-aside">
        <GuideCoach tutorial={tutorial} game={game} view="prep" placement="inline" />
        <figure className="commander"><img src={refs.northCourt} alt="The grey tabby Northern Lord in a heavy fur cloak, receiving a sealed letter." /><figcaption><b>Northern Lord</b><span>Frontier commander · your field adviser</span></figcaption></figure>
        <div className="prep-brief">
          <blockquote>“Infantry for the road. Bows above it. Give the horses room, or do not bring them.”</blockquote>
          <ul className="plan-tips">{tips.map((tip) => <li key={tip.text} className={tip.good ? 'good' : 'risk'}>{tip.text}</li>)}</ul>
          <p className="deployment-limit">Field limit: {DEPLOYMENT_LIMIT} squads. Reserves remain safe and replace losses after battle.</p>
        </div>
        <div className="prep-actions"><button className="primary full" data-guide="begin-battle" onClick={begin}>Begin battle</button><button className="full" onClick={() => commit({ ...game, screen: 'map' })}>Return to map</button></div>
      </aside>
    </main>;
  }

  const selectedUnit = combat.units.find((unit) => unit.id === selected);
  // With the 3D field ready, effects sit on the squads; otherwise they use the flat lane layout.
  const fxPlace = (item: Fx) => { if (!projector) return { left: `${fieldX(item.x)}%`, top: `${laneTop[item.lane]}%` }; const point = projector(item.lane, item.x, item.kind === 'ring' ? .2 : 1.3); return { left: `${point.left}px`, top: `${point.top}px` }; };
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
    <section className={`battlefield ${shake ? 'shake' : ''} ${projector ? 'projected' : ''}`} aria-label="Animated tactical battlefield">
      <Suspense fallback={<div className="battlefield-world webgl-fallback" aria-label="Loading three-dimensional battlefield" />}><Battlefield3D combat={combat} selected={selected} targeted={target?.id} paused={paused || !!outcome} onSelect={(id) => { const unit = combat.units.find((candidate) => candidate.id === id); if (unit) tapUnit(unit); }} onProjector={(next) => setProjector(() => next)} /></Suspense>
      <div className="weather" aria-hidden="true" /><div id="lane-label-high" className="ridge">HIGH GROUND</div><div id="lane-label-road" className="road">CENTRAL ROAD</div><div id="lane-label-flank" className="flank">OPEN FLANK</div>
      {combat.units.map((unit) => <button key={unit.id} id={`hud-${unit.id}`} title={unit.side === 'raiders' ? 'Tap to focus the selected squad on this raider' : undefined} aria-label={`${unit.side} ${unit.type}, ${Math.round(unit.hp)} health, ${Math.round(unit.morale)} morale`} className={`unit troop ${unit.side} ${unit.type} ${unit.order} ${unit.routed ? 'routed' : ''} ${unit.hp <= 0 ? 'fallen' : ''} ${selected === unit.id ? 'selected' : ''} ${target?.id === unit.id ? 'targeted' : ''}`} style={projector ? undefined : { left: `${fieldX(unit.x)}%`, top: `${laneTop[unit.lane]}%` }} onClick={() => tapUnit(unit)}><span className="troop-figure" aria-hidden="true" /><span className="unit-readout"><b>{unit.type}</b><i className="health"><span style={{ width: `${unit.hp}%` }} /></i><i className="morale"><span style={{ width: `${unit.morale}%` }} /></i><small>{Math.round(unit.hp)} health · {Math.round(unit.morale)} morale</small></span></button>)}
      <div className="fx-layer" aria-hidden="true">{fx.filter((item) => !(projector && item.kind === 'arrow')).map((item) => <i key={item.id} className={`fx fx-${item.kind} ${item.tone ?? ''}`} style={{ ...fxPlace(item), ...(item.spread !== undefined ? { '--spread-x': `${[0, -26, 26, -48, 48][item.spread % 5]}px`, '--spread-y': `${-item.spread * 12}px`, animationDelay: `${item.spread * 90}ms` } : {}), ...(item.kind === 'arrow' ? { '--from-x': `${fieldX(item.fromX ?? item.x)}%`, '--from-y': `${laneTop[item.fromLane ?? item.lane] - 4}%`, '--to-x': `${fieldX(item.x)}%`, '--to-y': `${laneTop[item.lane] - 4}%` } : {}) } as React.CSSProperties}>{item.text}</i>)}</div>
      {intro && <div className="battle-intro" aria-hidden="true"><b>The horns sound</b><span>Greyfen Pass</span></div>}
      <GuideCoach tutorial={tutorial} game={game} view="battle" placement="battle" />
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
