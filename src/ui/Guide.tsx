import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { canFinish } from '../game/rules';
import type { GameState, Screen } from '../game/types';
import type { TutorialStep } from '../services/tutorial';
import type { TutorialControls } from './common';
import './guide.css';

/* The guided opening. One coach card says exactly what to do next, derived from the live game state, and a
   spotlight frames the control to press. It never blocks play: the spotlight ignores the pointer and the card
   only captures its own buttons. */

export type GuideView = Screen | 'prep' | 'battle';
export type GuideAdvice = { title: string; text: string; target?: string; next?: boolean };

const STEPS: Exclude<TutorialStep, 'complete'>[] = ['kingdom', 'council', 'region', 'march', 'advance', 'deployment', 'battle', 'aftermath'];
const nav = (screen: Screen) => `[data-nav="${screen}"]`;
const marker = (id: string) => `[data-location="${id}"]`;

/** What the player should do right now for the current tutorial step, from wherever they are. */
export function guideAdvice(step: TutorialStep, game: GameState, view: GuideView): GuideAdvice | null {
  const chapter = game.chapter;
  const selected = chapter.selectedLocation;
  switch (step) {
    case 'kingdom':
      return view === 'kingdom'
        ? { title: 'Prepare for the road', text: 'Recruit a squad from the barracks list. Infantry is a solid start. Each recruit or upgrade spends 1 of your 2 actions this turn.', target: '.recruit-row' }
        : { title: 'Prepare for the road', text: 'Open the Kingdom tab to ready your army.', target: nav('kingdom') };
    case 'council':
      return view === 'council'
        ? { title: 'Hear every voice', text: 'Pick one ruling. “Open the royal accounts” uncovers evidence; “Keep guards in the palace” protects the throne.', target: '.choice-list' }
        : { title: 'Hear every voice', text: 'Open the Council tab. One ruling each turn shapes trust and can uncover evidence.', target: nav('council') };
    case 'region':
      return view === 'map'
        ? { title: 'Open the Crownlands', text: 'Select Crow Watch on the map. Its road leads north to Greyfen Pass, where the raiders wait.', target: marker('watchtower') }
        : { title: 'Open the Crownlands', text: 'Open the Region tab to see the roads north.', target: nav('map') };
    case 'march':
      if (view !== 'map') return { title: 'Choose a linked road', text: 'Open the Region tab to give marching orders.', target: nav('map') };
      if (selected !== 'watchtower') return { title: 'Choose a linked road', text: 'Select Crow Watch, the watchtower linked to Crownrest by road.', target: marker('watchtower') };
      return { title: 'Choose a linked road', text: 'Press “Order march”. It costs 2 food, and the army arrives when the turn advances.', target: '[data-guide="march"]' };
    case 'advance':
      if (chapter.armyDestination) {
        if (view === 'map') return { title: 'Let the march resolve', text: 'Press “Advance turn to arrive”. Income, upkeep, and travel resolve together.', target: '[data-guide="advance"]' };
        if (view === 'kingdom') return { title: 'Let the march resolve', text: 'Press “Advance turn” at the bottom of the castle view to let the army arrive.', target: '.turn-strip .primary' };
        return { title: 'Let the march resolve', text: 'Open Region and advance the turn so the army arrives.', target: nav('map') };
      }
      if (view !== 'map') return { title: 'March on Greyfen Pass', text: 'Open Region. The raiders hold Greyfen Pass, one road beyond Crow Watch.', target: nav('map') };
      if (chapter.armyLocation === 'capital') return { title: 'Choose a linked road', text: 'Select Crow Watch, then order the march.', target: selected === 'watchtower' ? '[data-guide="march"]' : marker('watchtower') };
      if (selected !== 'pass') return { title: 'March on Greyfen Pass', text: 'The army holds Crow Watch. Now select Greyfen Pass on the map.', target: marker('pass') };
      return { title: 'March on Greyfen Pass', text: 'Press “Order march”, then advance the turn to reach the pass.', target: '[data-guide="march"]' };
    case 'deployment':
      if (view === 'prep') return { title: 'Place the three arms', text: 'Choose a lane for each squad on the war table: bows on the ridge, shields on the road, horses on the open flank. Then press “Begin battle”.', target: '[data-guide="begin-battle"]' };
      if (view === 'map' && selected === 'pass' && chapter.armyLocation === 'pass') return { title: 'Into the pass', text: 'Your army stands at Greyfen Pass. Press “Enter Greyfen battle”.', target: '[data-guide="enter-battle"]' };
      if (view === 'map') return { title: 'Into the pass', text: 'Select Greyfen Pass on the map to prepare the battle.', target: marker('pass') };
      return { title: 'Into the pass', text: 'Open Region and enter the battle at Greyfen Pass.', target: nav('map') };
    case 'battle':
      return view === 'battle'
        ? { title: 'Command while time moves', text: 'Your squads wear red and gold. Click one, then give it an order here: Advance, Hold, or Brace (keys A, H, B). Press Space to pause and think.', target: '.orders' }
        : null;
    case 'aftermath': {
      if (view === 'battle' || view === 'prep') return null;
      if (chapter.battleResult !== 'victory') return { title: 'Regroup and return', text: 'Greyfen still stands. Recruit to refill your ranks, then march from Crow Watch back to Greyfen Pass and fight again before the conspirators strike.', target: view === 'map' ? marker('pass') : nav('map'), next: true };
      const ready = canFinish(game);
      if (view !== 'map') return { title: 'Count the cost', text: ready ? 'Open Region and confront the traitor.' : 'Greyfen is won, but proof is missing. Open the royal accounts in Council, or keep palace guards and raise the Lion Gate to level 2.', target: nav(ready ? 'map' : 'council'), next: true };
      return ready
        ? { title: 'Count the cost', text: 'Victory! Review your losses below, then press “Confront the traitor” to end the conspiracy.', target: '[data-guide="confront"]', next: true }
        : { title: 'Count the cost', text: 'Greyfen is won, but proof is missing. Open the royal accounts in Council, or keep palace guards and raise the Lion Gate to level 2, then return here.', target: nav('council'), next: true };
    }
    default: return null;
  }
}

/** A glowing frame that tracks a target element; purely visual. */
function Spotlight({ selector }: { selector?: string }) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!selector) { setBox(null); return; }
    let frame = 0; let last = '';
    const measure = () => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      const visible = rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      const key = visible ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)},${Math.round(rect.height)}` : 'none';
      if (key !== last) { last = key; setBox(visible ? rect : null); }
      frame = window.setTimeout(measure, 120);
    };
    measure();
    return () => clearTimeout(frame);
  }, [selector]);
  if (!box) return null;
  const pad = 6;
  return createPortal(<div className="guide-spotlight" aria-hidden="true" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}><span>Here</span></div>, document.body);
}

export function GuideCoach({ tutorial, game, view, placement = 'shell' }: { tutorial: TutorialControls; game: GameState; view: GuideView; placement?: 'shell' | 'inline' | 'battle' }) {
  const [collapsed, setCollapsed] = useState(false);
  const step = tutorial.state.step;
  const advice = tutorial.state.active ? guideAdvice(step, game, view) : null;
  if (!advice || step === 'complete') return null;
  const index = STEPS.indexOf(step) + 1;
  if (collapsed) return <button className={`guide-pill guide-${placement}`} onClick={() => setCollapsed(false)} aria-label={`Show guide, step ${index} of ${STEPS.length}`}>◆ Guide · {index}/{STEPS.length}</button>;
  return <>
    <aside className={`tutorial-callout guide-coach guide-${placement}`} role="status" aria-live="polite">
      <div className="guide-head"><span className="tutorial-step">Guided opening · Step {index} of {STEPS.length}</span><button className="guide-min" aria-label="Hide guide" title="Hide guide" onClick={() => setCollapsed(true)}>–</button></div>
      <b>{advice.title}</b>
      <p>{advice.text}</p>
      <ol className="guide-progress" aria-hidden="true">{STEPS.map((item, i) => <li key={item} className={i + 1 < index ? 'done' : i + 1 === index ? 'now' : ''} />)}</ol>
      <div className="guide-actions">{advice.next && <button className="primary" onClick={() => tutorial.complete('aftermath')}>Got it</button>}<button className="tutorial-skip" onClick={tutorial.skip}>Skip tutorial</button></div>
    </aside>
    <Spotlight selector={advice.target} />
  </>;
}
