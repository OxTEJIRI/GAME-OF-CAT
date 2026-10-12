import { useEffect, useRef, useState } from 'react';
import { buildings } from '../content/gameContent';
import type { BuildingId, ChapterState, GameState } from '../game/types';
import { gameAudio, type AudioCue } from '../services/audio';
import './feedback.css';

const CONSPIRACY_TURN = 6;

/** Sounds that answer a committed state change, derived purely from before/after so every screen gets feedback. */
export function transitionCues(prev: GameState, next: GameState): AudioCue[] {
  const cues: AudioCue[] = [];
  if (prev.screen !== next.screen) {
    if (next.screen === 'death') return ['toll'];
    if (next.screen === 'ending') return ['victory'];
    if (prev.screen === 'death' && next.screen === 'kingdom') return ['rewind'];
    if (next.screen === 'battle') cues.push('drums');
    if (prev.screen === 'funeral' && next.screen === 'kingdom') cues.push('confirm');
  }
  const a = prev.chapter; const b = next.chapter;
  if (a === b) {
    if (next.notice && next.notice !== prev.notice) cues.push('error');
    return cues;
  }
  if (b.turn > a.turn) {
    cues.push('turn');
    if (sum(b.buildingLevels) > sum(a.buildingLevels)) cues.push('build');
    if (newLogLines(a, b).some((line) => /\bcats?\b/i.test(line))) cues.push('meow');
  } else {
    if (sum(b.army) > sum(a.army)) cues.push('coin');
    if (b.projects.length > a.projects.length) cues.push('coin', 'build');
    if (b.councilResolvedTurn !== a.councilResolvedTurn) cues.push('scroll');
    if (b.scoutedLocations.length > a.scoutedLocations.length) cues.push('march');
    if (!a.armyDestination && b.armyDestination) cues.push('march');
  }
  if (next.persistent.evidence.length > prev.persistent.evidence.length && next.screen !== 'death') cues.push('evidence');
  return cues;
}

export function useStateCues(game: GameState | null) {
  const previous = useRef(game);
  useEffect(() => {
    const prev = previous.current; previous.current = game;
    if (!prev || !game || prev === game) return;
    transitionCues(prev, game).forEach((cue, index) => window.setTimeout(() => void gameAudio.cue(cue), index * 160));
  }, [game]);
}

const sum = (values: Record<string, number>) => Object.values(values).reduce((total, value) => total + value, 0);
const newLogLines = (a: ChapterState, b: ChapterState) => b.log.slice(0, Math.max(0, b.log.length - a.log.length));

type TurnReport = { turn: number; deltas: { label: string; value: number }[]; lines: string[]; warning?: string };

export function buildTurnReport(a: ChapterState, b: ChapterState, livesBefore = 0, livesAfter = 0): TurnReport {
  const deltas = [
    { label: 'gold', value: b.resources.gold - a.resources.gold },
    { label: 'food', value: b.resources.food - a.resources.food },
    { label: 'materials', value: b.resources.materials - a.resources.materials },
    { label: 'order', value: b.publicOrder - a.publicOrder },
    { label: 'lives', value: livesAfter - livesBefore },
  ].filter((delta) => delta.value !== 0);
  const lines: string[] = [];
  (Object.keys(b.buildingLevels) as BuildingId[]).filter((id) => b.buildingLevels[id] > a.buildingLevels[id]).forEach((id) => lines.push(`${buildings[id].name} reaches level ${b.buildingLevels[id]}.`));
  newLogLines(a, b).filter((line) => !/^Turn \d+: income/.test(line) && !/^The royal army arrived/.test(line)).forEach((line) => lines.push(line));
  if (a.armyLocation !== b.armyLocation) lines.push('The royal army arrives on the new road.');
  const turnsLeft = CONSPIRACY_TURN - b.turn;
  const warning = !b.battleResult && turnsLeft > 0 ? `${turnsLeft} ${turnsLeft === 1 ? 'turn' : 'turns'} until the conspirators strike. Break the raiders at Greyfen Pass.` : undefined;
  return { turn: b.turn, deltas, lines, warning };
}

/** A non-blocking herald that summarises each resolved turn: income, completions, events, and the threat clock. */
export function TurnHerald({ game }: { game: GameState }) {
  const [report, setReport] = useState<TurnReport | null>(null);
  const previous = useRef({ chapter: game.chapter, lives: game.persistent.livesRemaining });
  useEffect(() => {
    const before = previous.current; previous.current = { chapter: game.chapter, lives: game.persistent.livesRemaining };
    if (game.chapter.turn > before.chapter.turn) setReport(buildTurnReport(before.chapter, game.chapter, before.lives, game.persistent.livesRemaining));
  }, [game.chapter]);
  useEffect(() => {
    if (!report) return;
    const timer = window.setTimeout(() => setReport(null), 5600);
    return () => clearTimeout(timer);
  }, [report]);
  if (!report) return null;
  return <aside key={report.turn} className="turn-herald" role="status" aria-live="polite">
    <span className="turn-herald-kicker">The bell tolls</span>
    <b className="turn-herald-title">Turn {report.turn} begins</b>
    {report.deltas.length > 0 && <div className="turn-herald-deltas">{report.deltas.map((delta) => <span key={delta.label} className={delta.value > 0 ? 'up' : 'down'}>{delta.value > 0 ? '+' : '−'}{Math.abs(delta.value)} {delta.label}</span>)}</div>}
    {report.lines.length > 0 && <ul>{report.lines.map((line) => <li key={line}>{line}</li>)}</ul>}
    {report.warning && <p className="turn-herald-warning">{report.warning}</p>}
  </aside>;
}

type Pop = { id: number; key: string; value: number };
let popId = 0;

/** Resource bar whose values flash and float their change whenever they move. */
export function ResourceBar({ game }: { game: GameState }) {
  const r = game.chapter.resources;
  const values: Record<string, number> = { gold: r.gold, food: r.food, materials: r.materials, order: game.chapter.publicOrder, lives: game.persistent.livesRemaining };
  const previous = useRef({ values, turn: game.chapter.turn });
  const [pops, setPops] = useState<Pop[]>([]);
  useEffect(() => {
    const before = previous.current; previous.current = { values, turn: game.chapter.turn };
    if (game.chapter.turn < before.turn) return; // a rewind restores the checkpoint; no deltas to celebrate
    const born = Object.keys(values).filter((key) => values[key] !== before.values[key]).map((key) => ({ id: ++popId, key, value: values[key] - before.values[key] }));
    if (!born.length) return;
    setPops((current) => [...current, ...born]);
    const ids = new Set(born.map((pop) => pop.id));
    window.setTimeout(() => setPops((current) => current.filter((pop) => !ids.has(pop.id))), 1500);
  }, [r.gold, r.food, r.materials, game.chapter.publicOrder, game.persistent.livesRemaining]);
  const cell = (key: string, label: string, className = '') => {
    const pop = pops.filter((item) => item.key === key).at(-1);
    return <span className={`${className} ${pop ? (pop.value > 0 ? 'pulse-up' : 'pulse-down') : ''}`.trim() || undefined}><b>{values[key]}</b> {label}{pop && <i key={pop.id} className={`resource-pop ${pop.value > 0 ? 'up' : 'down'}`} aria-hidden="true">{pop.value > 0 ? '+' : '−'}{Math.abs(pop.value)}</i>}</span>;
  };
  return <div className="resources" aria-label="Kingdom resources">{cell('gold', 'Gold')}{cell('food', 'Food')}{cell('materials', 'Materials')}{cell('order', 'Order')}{cell('lives', 'Lives', 'lives')}</div>;
}

/** The latest game notice, shown briefly and then faded so it never sits on the map or castle for long. */
export function NoticeToast({ notice }: { notice?: string }) {
  const [visible, setVisible] = useState(!!notice);
  useEffect(() => {
    if (!notice) { setVisible(false); return; }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice || !visible) return null;
  return <div key={notice} className="notice" role="status">{notice}</div>;
}
