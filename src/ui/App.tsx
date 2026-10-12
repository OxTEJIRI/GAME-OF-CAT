import { useEffect, useMemo, useRef, useState } from 'react';
import { buildings, characters, locations, refs, units } from '../content/gameContent';
import { applyBattleResult, advanceTurn, canFinish, councilChoice, finishChapter, moveArmy, newGame, recruit, rewindChapter, scout, trustLabel, upgradeBuilding } from '../game/rules';
import { DEPLOYMENT_LIMIT, combatOutcome, combatTick, createCombat, issueOrder, planDeployment, rally, summarizeCombat, type CombatState, type Lane, type Order } from '../game/combat';
import type { BuildingId, GameState, Screen, UnitType } from '../game/types';
import { exportSave, hasSave, importSave, loadGame, saveGame } from '../services/saves';
import { gameAudio, loadAudioSettings, type AudioSettings } from '../services/audio';
import { completeTutorialStep, loadTutorial, replayTutorial, saveTutorial, skipTutorial, type TutorialState, type TutorialStep } from '../services/tutorial';

const labelScreen: Record<Screen, string> = { menu: 'Menu', funeral: 'Prologue', kingdom: 'Kingdom', council: 'Council', map: 'Region', journal: 'Journal', battle: 'Battle', death: 'Rewind', ending: 'Chapter end' };
type TutorialControls = { state: TutorialState; complete(step: Exclude<TutorialStep, 'complete'>): void; skip(): void };

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [menuHasSave, setMenuHasSave] = useState(hasSave());
  const [storageError, setStorageError] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(loadAudioSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialState, setTutorialState] = useState<TutorialState>(loadTutorial);
  const previousChapter = useRef<GameState['chapter'] | null>(null);

  const tutorial: TutorialControls = {
    state: tutorialState,
    complete: (step) => setTutorialState((current) => completeTutorialStep(current, step)),
    skip: () => setTutorialState(skipTutorial()),
  };

  useEffect(() => { gameAudio.setSettings(audioSettings); }, [audioSettings]);
  useEffect(() => { saveTutorial(tutorialState); }, [tutorialState]);
  useEffect(() => {
    const mode = !game || game.screen === 'menu' || game.screen === 'funeral' ? 'menu' : game.screen === 'kingdom' ? 'castle' : game.screen === 'council' ? 'council' : game.screen === 'map' ? 'map' : game.screen === 'battle' ? 'battle' : 'none';
    void gameAudio.startAmbience(mode);
    return () => gameAudio.stopAmbience();
  }, [game?.screen, audioSettings.muted]);
  useEffect(() => {
    const previous = previousChapter.current;
    if (game && previous && tutorialState.active) {
      if (game.screen === 'kingdom' && game.chapter.actions < previous.actions) setTutorialState((current) => completeTutorialStep(current, 'kingdom'));
      if (game.chapter.councilResolvedTurn !== previous.councilResolvedTurn) setTutorialState((current) => completeTutorialStep(current, 'council'));
      if (!previous.armyDestination && game.chapter.armyDestination) setTutorialState((current) => completeTutorialStep(current, 'march'));
      if (previous.armyLocation !== game.chapter.armyLocation && game.chapter.armyLocation === 'pass') setTutorialState((current) => completeTutorialStep(current, 'advance'));
    }
    previousChapter.current = game?.chapter ?? null;
  }, [game?.chapter, game?.screen, tutorialState.active]);

  const commit = (next: GameState | ((current: GameState) => GameState)) => {
    setGame((current) => {
      if (!current) return current;
      const resolved = typeof next === 'function' ? next(current) : next;
      if (!saveGame(resolved)) setStorageError(true);
      setMenuHasSave(true);
      return resolved;
    });
  };

  const navigate = (screen: Screen) => {
    setSettingsOpen(false);
    if (screen === 'menu') { if (game) setGame({ ...game, screen: 'menu' }); return; }
    const base = game ?? loadGame();
    if (!base) return;
    const next = { ...base, screen: lockedScreen(base) ?? screen };
    if (!saveGame(next)) setStorageError(true);
    setMenuHasSave(true);
    setGame(next);
  };
  const pageNavigator = (current: Screen) => <PageNavigator current={current} canLeaveTitle={!!game || menuHasSave} onNavigate={navigate} />;

  if (!game || game.screen === 'menu') return <>{pageNavigator('menu')}<Menu hasSave={menuHasSave} onNew={() => { const g = newGame(); saveGame(g); setGame(g); void gameAudio.cue('confirm'); }} onContinue={() => setGame(loadGame())} onSettings={() => setSettingsOpen(true)} settingsOpen={settingsOpen} closeSettings={() => setSettingsOpen(false)} audioSettings={audioSettings} setAudioSettings={setAudioSettings} replayTutorial={() => setTutorialState(replayTutorial())} tutorialState={tutorialState} storageError={storageError} /></>;

  if (game.screen === 'funeral') return <>{pageNavigator('funeral')}<Funeral game={game} proceed={() => commit({ ...game, screen: 'kingdom', persistent: { ...game.persistent, seenScenes: ['funeral'] } })} /></>;
  if (game.screen === 'battle') return <CinematicBattle game={game} commit={commit} tutorial={tutorial} />;
  if (game.screen === 'death') return <DeathScreen game={game} rewind={() => commit(rewindChapter(game))} menu={() => commit({ ...game, screen: 'menu' })} />;
  if (game.screen === 'ending') return <Ending game={game} menu={() => commit({ ...game, screen: 'menu' })} />;

  return <>{pageNavigator(game.screen)}<GameShell game={game} setScreen={(screen) => screen === 'menu' ? setGame({ ...game, screen: 'menu' }) : commit({ ...game, screen })} openSettings={() => setSettingsOpen(true)} settingsOpen={settingsOpen} closeSettings={() => setSettingsOpen(false)} audioSettings={audioSettings} setAudioSettings={setAudioSettings} replayTutorial={() => { setTutorialState(replayTutorial()); commit({ ...game, screen: 'kingdom' }); }} muted={audioSettings.muted} toggleMute={() => setAudioSettings({ ...audioSettings, muted: !audioSettings.muted })} storageError={storageError} tutorial={tutorial}>
    {game.screen === 'kingdom' && <Kingdom game={game} commit={commit} tutorial={tutorial} />}
    {game.screen === 'council' && <Council game={game} commit={commit} tutorial={tutorial} />}
    {game.screen === 'map' && <IllustratedMapScreen game={game} commit={commit} tutorial={tutorial} />}
    {game.screen === 'journal' && <Journal game={game} commit={commit} />}
  </GameShell></>;
}

const pageOrder: { screen: Screen; label: string }[] = [
  { screen: 'menu', label: 'Title' }, { screen: 'funeral', label: 'Prologue' }, { screen: 'kingdom', label: 'Kingdom' },
  { screen: 'council', label: 'Council' }, { screen: 'map', label: 'Region' }, { screen: 'journal', label: 'Journal' },
];

// A pending battle, unrewound death, or finished chapter must be resolved before free page navigation resumes.
function lockedScreen(game: GameState): Screen | null {
  if (game.chapter.flags.deathCauseSet) return 'death';
  if (game.chapter.ending) return 'ending';
  return game.screen === 'battle' ? 'battle' : null;
}

function PageNavigator({ current, canLeaveTitle, onNavigate }: { current: Screen; canLeaveTitle: boolean; onNavigate(screen: Screen): void }) {
  const [open, setOpen] = useState(false);
  const index = pageOrder.findIndex((page) => page.screen === current);
  const previous = pageOrder[index - 1];
  const next = pageOrder[index + 1];
  const available = (screen: Screen) => screen === 'menu' || canLeaveTitle;
  const go = (screen: Screen) => { setOpen(false); if (screen !== current) onNavigate(screen); };
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [open]);
  if (index < 0) return null;
  return <nav className={`page-navigator ${current === 'menu' || current === 'funeral' ? '' : 'in-shell'}`} aria-label="Page navigation">
    {open && <ol id="page-list" className="page-list">{pageOrder.map((page, i) => <li key={page.screen}><button aria-current={page.screen === current ? 'page' : undefined} disabled={!available(page.screen)} onClick={() => go(page.screen)}><span>{String(i + 1).padStart(2, '0')}</span>{page.label}</button></li>)}{!canLeaveTitle && <li className="page-hint">Start a new campaign to open the other pages.</li>}</ol>}
    <button className="page-step" aria-label="Previous page" title={previous ? `Previous: ${previous.label}` : undefined} disabled={!previous || !available(previous.screen)} onClick={() => previous && go(previous.screen)}>‹</button>
    <button className="page-toggle" aria-label="Page list" aria-expanded={open} aria-controls="page-list" onClick={() => setOpen(!open)}><span className="diamond" aria-hidden="true">◆</span>{pageOrder[index].label}<small>{index + 1} / {pageOrder.length}</small></button>
    <button className="page-step" aria-label="Next page" title={next ? `Next: ${next.label}` : undefined} disabled={!next || !available(next.screen)} onClick={() => next && go(next.screen)}>›</button>
  </nav>;
}

function Menu({ hasSave: available, onNew, onContinue, onSettings, settingsOpen, closeSettings, audioSettings, setAudioSettings, replayTutorial: replay, tutorialState, storageError }: { hasSave: boolean; onNew(): void; onContinue(): void; onSettings(): void; settingsOpen: boolean; closeSettings(): void; audioSettings: AudioSettings; setAudioSettings(v: AudioSettings): void; replayTutorial(): void; tutorialState: TutorialState; storageError: boolean }) {
  const introVideo = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotionPreference = () => {
      const video = introVideo.current;
      if (!video) return;
      if (motionPreference.matches) video.pause();
      else void video.play().catch(() => undefined);
    };
    applyMotionPreference();
    motionPreference.addEventListener('change', applyMotionPreference);
    return () => motionPreference.removeEventListener('change', applyMotionPreference);
  }, []);
  return <main className="menu-screen">
    <div className="menu-art" aria-hidden="true"><video data-testid="setup-background" ref={introVideo} className="menu-background-video" autoPlay muted loop playsInline preload="metadata" poster="/assets/video/setup-funeral-poster.jpg" onLoadedMetadata={(event) => { event.currentTarget.playbackRate = 0.72; }}><source src="/assets/video/setup-funeral.mp4" type="video/mp4" /></video></div>
    <section className="menu-panel">
      <p className="kicker">An original strategy chapter inspired by supplied character references</p>
      <h1><span>GAME OF CAT</span> War of the <em>Nine Lives</em></h1>
      <p className="promise">Rule the kingdom. Command its armies. Uncover the betrayal. Spend a life to change fate.</p>
      <div className="menu-actions">
        <button className="primary" onClick={onNew}>New campaign</button>
        <button onClick={onContinue} disabled={!available}>Continue</button>
        <button onClick={onSettings}>Settings</button>
      </div>
      <p className="dev-label">Playable Chapter I · Cinematic castle and battlefield · Production asset limits are documented.</p>
      {storageError && <p className="error">Browser storage is unavailable. Play can continue, but progress may not persist.</p>}
    </section>
    {settingsOpen && <div className="modal-backdrop"><section className="modal audio-panel" role="dialog" aria-modal="true" aria-label="Settings"><h2>Settings</h2><label className="toggle"><input type="checkbox" checked={audioSettings.muted} onChange={(e) => setAudioSettings({ ...audioSettings, muted: e.target.checked })} /> Mute all audio</label><label>Ambience <input aria-label="Ambience" type="range" min="0" max="1" step="0.05" value={audioSettings.ambience} onChange={(e) => setAudioSettings({ ...audioSettings, ambience: Number(e.target.value), muted: false })} /></label><label>Effects <input aria-label="Effects" type="range" min="0" max="1" step="0.05" value={audioSettings.effects} onChange={(e) => setAudioSettings({ ...audioSettings, effects: Number(e.target.value), muted: false })} /></label><p>Original synthesized ambience and action cues. Sound starts only after you enable it.</p><div className="tutorial-settings"><b>Guided opening</b><span>{tutorialState.active ? 'Tutorial in progress' : tutorialState.completed ? 'Tutorial completed or skipped' : 'Tutorial ready'}</span><button onClick={() => { replay(); closeSettings(); }}>Replay tutorial</button></div><button className="primary" onClick={closeSettings}>Done</button></section></div>}
  </main>;
}

function Funeral({ game, proceed }: { game: GameState; proceed(): void }) {
  return <main className="cinematic"><img src={refs.ruler} alt="The crowned brown tabby ruler beside the orange royal cat, both in ornate black, gold, and red court dress." /><div className="cinematic-copy"><p className="kicker">Chapter I · The Missing Seal <span className="working">working title</span></p><h1>The bells stop. <em>The doubt begins.</em></h1><p>At the old king's funeral, the seal meant to secure the succession is gone. The Northern Lord warns that false orders already travel the Greyfen road.</p><p className="speaker">Royal cat / Queen candidate <span>provisional identity</span></p><blockquote>“Keep soldiers close tonight. Grief makes a court careless.”</blockquote><button className="primary" onClick={proceed}>{game.persistent.seenScenes.includes('funeral') ? 'Skip remembered scene' : 'Take the crown'}</button></div></main>;
}

function GameShell({ game, setScreen, openSettings, settingsOpen, closeSettings, audioSettings, setAudioSettings, replayTutorial, muted, toggleMute, storageError, tutorial, children }: { game: GameState; setScreen(s: Screen): void; openSettings(): void; settingsOpen: boolean; closeSettings(): void; audioSettings: AudioSettings; setAudioSettings(v: AudioSettings): void; replayTutorial(): void; muted: boolean; toggleMute(): void; storageError: boolean; tutorial: TutorialControls; children: React.ReactNode }) {
  return <main className="game-shell">
    <header className="topbar"><button className="wordmark" onClick={() => setScreen('menu')}>GAME OF CAT</button><div className="chapter-marker">Chapter I / Turn {game.chapter.turn}</div><ResourceBar game={game} /><button className="mute" onClick={toggleMute}>{muted ? 'Muted' : 'Sound on'}</button><button className="settings-button" onClick={openSettings}>Settings</button></header>
    <aside className="side-nav" aria-label="Game sections">{(['kingdom','council','map','journal'] as Screen[]).map((screen) => <button key={screen} data-nav={screen} className={game.screen === screen ? 'active' : ''} onClick={() => setScreen(screen)}><span>{labelScreen[screen]}</span>{screen === 'journal' && game.persistent.evidence.length > 0 && <b>{game.persistent.evidence.length}</b>}</button>)}{tutorial.state.active && tutorial.state.step === 'council' && <TutorialCallout className="tutorial-nav tutorial-council-nav" title="Hear every voice" onSkip={tutorial.skip}>Choose Council and make a ruling before the army leaves Crownrest.</TutorialCallout>}{tutorial.state.active && tutorial.state.step === 'region' && <TutorialCallout className="tutorial-nav tutorial-region-nav" title="Open the Crownlands" onSkip={tutorial.skip}>Choose Region, then inspect any location.</TutorialCallout>}</aside>
    {settingsOpen && <div className="modal-backdrop"><section className="modal audio-panel" role="dialog" aria-modal="true" aria-label="Settings"><h2>Settings</h2><label className="toggle"><input type="checkbox" checked={audioSettings.muted} onChange={(event) => setAudioSettings({ ...audioSettings, muted: event.target.checked })} /> Mute all audio</label><label>Ambience <input aria-label="Ambience" type="range" min="0" max="1" step="0.05" value={audioSettings.ambience} onChange={(event) => setAudioSettings({ ...audioSettings, ambience: Number(event.target.value), muted: false })} /></label><label>Effects <input aria-label="Effects" type="range" min="0" max="1" step="0.05" value={audioSettings.effects} onChange={(event) => setAudioSettings({ ...audioSettings, effects: Number(event.target.value), muted: false })} /></label><div className="tutorial-settings"><b>Guided opening</b><span>{tutorial.state.active ? 'Tutorial in progress' : 'Tutorial completed or skipped'}</span><button onClick={replayTutorial}>Replay tutorial</button></div><button className="primary" onClick={closeSettings}>Done</button></section></div>}
    <section className="stage">{storageError && <div className="storage-warning">Autosave unavailable. Export a save from the Journal.</div>}{game.notice && <div className="notice" role="status">{game.notice}</div>}{children}</section>
  </main>;
}

function ResourceBar({ game }: { game: GameState }) { const r = game.chapter.resources; return <div className="resources" aria-label="Kingdom resources"><span><b>{r.gold}</b> Gold</span><span><b>{r.food}</b> Food</span><span><b>{r.materials}</b> Materials</span><span><b>{game.chapter.publicOrder}</b> Order</span><span className="lives"><b>{game.persistent.livesRemaining}</b> Lives</span></div>; }

function TutorialCallout({ title, className = '', onSkip, onNext, children }: { title: string; className?: string; onSkip(): void; onNext?: () => void; children: React.ReactNode }) {
  return <aside className={`tutorial-callout ${className}`} role="status" aria-live="polite"><span className="tutorial-step">Guided opening</span><b>{title}</b><p>{children}</p><div>{onNext && <button className="primary" onClick={onNext}>Next</button>}<button className="tutorial-skip" onClick={onSkip}>Skip tutorial</button></div></aside>;
}

function Kingdom({ game, commit, tutorial }: { game: GameState; commit(next: GameState | ((s: GameState) => GameState)): void; tutorial: TutorialControls }) {
  const [selected, setSelected] = useState<BuildingId>('gate');
  const building = buildings[selected];
  const level = game.chapter.buildingLevels[selected];
  const hasProject = (id: BuildingId) => game.chapter.projects.some((project) => project.building === id);
  const objective = game.chapter.battleResult === 'victory' ? 'Return to the map and confront the traitor.' : game.chapter.armyLocation === 'pass' ? 'Enter Greyfen Pass and break the false banner.' : game.chapter.councilResolvedTurn !== game.chapter.turn ? 'Hear the council, then prepare the army.' : 'Recruit or fortify, then march through Crow Watch.';
  return <div className="screen-layout">
    <section className="castle-scene">
      <div className="scene-caption"><span>Seat of the nine-lived crown</span><h2>Crownrest Citadel</h2><p>Select a district. Smoke, patrols, banners, and works reflect the living stronghold.</p></div>
      <div className="castle-silhouette" aria-label="Interactive overview of Crownrest Citadel">
        {(Object.keys(buildings) as BuildingId[]).map((id, i) => <button key={id} style={{ '--x': `${[54,24,73,47][i]}%`, '--y': `${[26,58,61,72][i]}%` } as React.CSSProperties} className={`building-pin ${selected === id ? 'selected' : ''} ${hasProject(id) ? 'building' : ''} level-${game.chapter.buildingLevels[id]}`} onClick={() => { setSelected(id); void gameAudio.cue('select'); }}><span>{buildings[id].name}</span><b>Level {game.chapter.buildingLevels[id]}{hasProject(id) ? ' · building' : ''}</b></button>)}
      </div>
      <div className="castle-life" aria-hidden="true"><i className="smoke smoke-a" /><i className="smoke smoke-b" /><i className="banner banner-a" /><i className="banner banner-b" /><i className="guard guard-a" /><i className="guard guard-b" />{game.chapter.projects.map((project) => <i key={project.building} className={`scaffold scaffold-${project.building}`} />)}</div>
      {tutorial.state.active && tutorial.state.step === 'kingdom' && <TutorialCallout className="tutorial-kingdom" title="Prepare for the road" onSkip={tutorial.skip}>Recruit any squad or commission any upgrade. Your choice shapes the route, but the guide accepts either.</TutorialCallout>}
      <div className="turn-strip"><div><b>{game.chapter.actions}/2 actions</b><span>Income next turn: +{8 + level * 0 + game.chapter.buildingLevels.keep * 2} gold · +{5 + game.chapter.buildingLevels.granary * 3} food before upkeep</span></div><button className="primary" onClick={() => commit(advanceTurn(game))}>Advance turn</button></div>
    </section>
    <aside className="detail-panel"><p className="kicker">Level {level} stronghold</p><h2>{building.name}</h2><p>{building.purpose}</p><dl><div><dt>Upgrade cost</dt><dd>{building.baseCost.gold} gold · {building.baseCost.materials} materials</dd></div><div><dt>Completion</dt><dd>At next turn resolution</dd></div></dl><button className="primary full" disabled={level >= 3 || game.chapter.actions < 1} onClick={() => commit(upgradeBuilding(game, selected))}>Upgrade to level {Math.min(3, level + 1)}</button><hr /><h3>Recruit at the barracks</h3>{(Object.keys(units) as UnitType[]).map((type) => <button className="recruit-row" key={type} disabled={game.chapter.actions < 1} onClick={() => commit(recruit(game, type))}><span><b>{units[type].name}</b><small>{units[type].note}</small></span><span>{units[type].cost.gold}g · {units[type].cost.food}f</span></button>)}</aside>
  </div>;
}

function Council({ game, commit, tutorial }: { game: GameState; commit(next: GameState | ((s: GameState) => GameState)): void; tutorial: TutorialControls }) {
  const done = game.chapter.councilResolvedTurn === game.chapter.turn;
  const knowsLetter = game.persistent.evidence.some((e) => e.id === 'perfumed-letter');
  const choices = [
    { id: 'guards' as const, title: 'Keep guards in the palace', cost: '−4 public order', effect: 'Raises palace security and Queen trust.' },
    { id: 'north' as const, title: 'Supply the northern warning', cost: '−2 food', effect: 'Strengthens frontier cooperation.' },
    { id: 'audit' as const, title: 'Open the royal accounts', cost: 'Steward becomes wary', effect: 'May reveal who handled the missing seal.' },
    ...(knowsLetter ? [{ id: 'courier' as const, title: 'Stop the west-archive courier', cost: 'Queen trust may fall', effect: 'Retained knowledge can prevent the palace strike.' }] : []),
  ];
  return <div className="council-screen"><section className="portrait-column"><img src={refs.queen} alt="Orange-furred royal cat with long golden hair, green-toned eyes, a red-jewelled crown, and red-and-gold gown." /><div className="identity"><b>{characters.queen.label}</b><span>Provisional character label · visual identity from supplied reference</span></div></section><section className="dialogue-panel"><p className="kicker">Council ruling · Turn {game.chapter.turn}</p><h2>{done ? 'The ruling stands.' : 'Where does the crown place its trust?'}</h2><blockquote>“A kingdom cannot guard every road and every door. Choose which danger may enter.”</blockquote>{tutorial.state.active && tutorial.state.step === 'council' && <TutorialCallout className="tutorial-inline" title="Make the council’s choice" onSkip={tutorial.skip}>Choose any ruling. Each has a different cost and effect; the guide accepts every choice.</TutorialCallout>}<div className="trust-row"><span>Queen: <b>{trustLabel(game.chapter.trust.queen)}</b></span><span>Northern Lord: <b>{trustLabel(game.chapter.trust.northernLord)}</b></span><span>Steward: <b>{trustLabel(game.chapter.trust.steward)}</b></span></div><div className="choice-list">{choices.map((choice) => <button key={choice.id} disabled={done} onClick={() => commit(councilChoice(game, choice.id))}><b>{choice.title}</b><span>{choice.effect}</span><small>Known cost: {choice.cost}</small></button>)}</div></section></div>;
}

function MapScreen({ game, commit }: { game: GameState; commit(next: GameState | ((s: GameState) => GameState)): void }) {
  const selected = locations.find((l) => l.id === game.chapter.selectedLocation) ?? locations[0];
  const select = (id: string) => commit({ ...game, chapter: { ...game.chapter, selectedLocation: id }, notice: undefined });
  const canBattle = selected.id === 'pass' && game.chapter.armyLocation === 'pass' && !game.chapter.armyDestination && game.chapter.battleResult !== 'victory';
  const report = game.chapter.lastBattle;
  return <div className="screen-layout map-layout"><section className="region-map"><div className="scene-caption"><span>Temporary development map</span><h2>The Crownlands</h2><p>Scout first. March orders resolve on the next turn.</p></div><div className="map-lines" />{locations.map((location) => <button key={location.id} className={`map-node ${selected.id === location.id ? 'selected' : ''} ${game.chapter.armyLocation === location.id ? 'occupied' : ''}`} style={{ left: `${location.x}%`, top: `${location.y}%` }} onClick={() => select(location.id)}><i /> <span>{location.name}</span>{game.chapter.armyLocation === location.id && <b>{game.chapter.armyDestination ? `MARCHING TO ${game.chapter.armyDestination}` : 'ROYAL ARMY'}</b>}</button>)}</section><aside className="detail-panel"><p className="kicker">{game.chapter.scoutedLocations.includes(selected.id) ? 'Scouted location' : 'Intelligence incomplete'}</p><h2>{selected.name}</h2><dl><div><dt>Benefit</dt><dd>{selected.benefit}</dd></div><div><dt>Threat</dt><dd>{game.chapter.scoutedLocations.includes(selected.id) ? selected.threat : 'Unknown force'}</dd></div><div><dt>Army</dt><dd>{game.chapter.armyDestination ? `Travelling to ${game.chapter.armyDestination}; arrives turn ${game.chapter.armyArrivesOn}` : game.chapter.armyLocation === selected.id ? 'Present and ready' : `At ${game.chapter.armyLocation}`}</dd></div></dl><button className="full" disabled={game.chapter.scoutedLocations.includes(selected.id) || game.chapter.actions < 1} onClick={() => commit(scout(game, selected.id))}>Scout route · 1 action</button><button className="full" disabled={game.chapter.armyLocation === selected.id || !!game.chapter.armyDestination} onClick={() => commit(moveArmy(game, selected.id))}>Order march · 2 food</button>{game.chapter.armyDestination && <button className="primary full" onClick={() => commit(advanceTurn(game))}>Advance turn to arrive</button>}{canBattle && <button className="primary full" onClick={() => commit({ ...game, screen: 'battle', notice: undefined })}>{game.chapter.battleAttempts ? 'Return to Greyfen battle' : 'Enter Greyfen battle'}</button>}{report && <section className="battle-summary"><h3>Latest battle: {report.result}</h3>{(['infantry','archers','cavalry'] as UnitType[]).map((type) => <p key={type}><b>{units[type].name}</b><span>{report.survivors[type]} survived · {report.casualties[type]} lost</span></p>)}</section>}{canFinish(game) && <div className="ending-actions"><h3>End the conspiracy</h3><button className="primary full" onClick={() => commit(finishChapter(game, game.persistent.evidence.some((e) => e.id === 'ledger-gap') ? 'truth' : 'steel'))}>Confront the traitor</button></div>}</aside></div>;
}

const mapRoutes: [string, string][] = [
  ['capital', 'orchard'], ['capital', 'watchtower'], ['orchard', 'shrine'], ['watchtower', 'pass'], ['pass', 'northhold'],
];

function IllustratedMapScreen({ game, commit, tutorial }: { game: GameState; commit(next: GameState | ((s: GameState) => GameState)): void; tutorial: TutorialControls }) {
  const selected = locations.find((location) => location.id === game.chapter.selectedLocation) ?? locations[0];
  const armyLocation = locations.find((location) => location.id === game.chapter.armyLocation) ?? locations[0];
  const connected = armyLocation.connected.includes(selected.id);
  const canBattle = selected.id === 'pass' && game.chapter.armyLocation === 'pass' && !game.chapter.armyDestination && game.chapter.battleResult !== 'victory';
  const report = game.chapter.lastBattle;
  const moveReason = game.chapter.armyDestination ? `Army already travelling to ${locations.find((location) => location.id === game.chapter.armyDestination)?.name ?? game.chapter.armyDestination}. Advance the turn to arrive.` : game.chapter.armyLocation === selected.id ? `The royal army is already stationed at ${selected.name}.` : !connected ? `No road connects ${armyLocation.name} directly to ${selected.name}. Select a linked location first.` : game.chapter.resources.food < 2 ? 'The army needs 2 food to march.' : '';
  const scoutReason = game.chapter.scoutedLocations.includes(selected.id) ? 'This location is already scouted.' : game.chapter.actions < 1 ? 'No kingdom actions remain this turn.' : '';
  const select = (id: string) => {
    commit({ ...game, chapter: { ...game.chapter, selectedLocation: id }, notice: undefined });
    tutorial.complete('region');
    void gameAudio.cue('select');
  };
  const routeClass = (from: string, to: string) => {
    const destinationRoute = !!game.chapter.armyDestination && ((from === game.chapter.armyLocation && to === game.chapter.armyDestination) || (to === game.chapter.armyLocation && from === game.chapter.armyDestination));
    const available = !game.chapter.armyDestination && game.chapter.resources.food >= 2 && (from === game.chapter.armyLocation || to === game.chapter.armyLocation);
    return destinationRoute ? 'destination' : available ? 'available' : 'unavailable';
  };
  const focusNext = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = (index + direction + locations.length) % locations.length;
    document.querySelector<HTMLButtonElement>(`[data-location="${locations[next].id}"]`)?.focus();
  };
  return <div className="screen-layout map-layout illustrated-map-layout">
    <section className="region-map illustrated-map">
      <div className="map-art" aria-hidden="true" />
      <div className="scene-caption map-heading"><span>The royal roads</span><h2>The Crownlands</h2><p>Select any place to inspect it. Stitched roads show travel connections.</p></div>
      <svg className="route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{mapRoutes.map(([from, to]) => { const a = locations.find((location) => location.id === from)!; const b = locations.find((location) => location.id === to)!; return <line key={`${from}-${to}`} className={routeClass(from, to)} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}</svg>
      <div className="map-location-layer">{locations.map((location, index) => { const reachable = !game.chapter.armyDestination && game.chapter.resources.food >= 2 && armyLocation.connected.includes(location.id); const state = game.chapter.armyLocation === location.id ? 'occupied' : game.chapter.armyDestination === location.id ? 'destination' : reachable ? 'reachable' : 'unavailable'; return <button type="button" key={location.id} data-location={location.id} aria-pressed={selected.id === location.id} aria-label={`${location.name}, ${state}`} className={`map-node production ${selected.id === location.id ? 'selected' : ''} ${state}`} style={{ left: `${location.x}%`, top: `${location.y}%` }} onClick={() => select(location.id)} onKeyDown={(event) => focusNext(event, index)}><span className="map-marker-glyph" aria-hidden="true"><i /></span><span className="map-label">{location.name}</span>{game.chapter.armyLocation === location.id && <b>Army here</b>}{game.chapter.armyDestination === location.id && <b>Destination</b>}</button>; })}</div>
    </section>
    <aside className="detail-panel map-detail">
      <p className="kicker">{game.chapter.scoutedLocations.includes(selected.id) ? 'Scouted location' : 'Intelligence incomplete'}</p><h2>{selected.name}</h2>
      {tutorial.state.active && tutorial.state.step === 'region' && <TutorialCallout className="tutorial-inline" title="Inspect the realm" onSkip={tutorial.skip}>Click a marker or its full name. Arrow keys move focus; Enter selects.</TutorialCallout>}
      <div className="location-state"><span className={game.chapter.armyLocation === selected.id ? 'current' : connected ? 'linked' : 'distant'}>{game.chapter.armyLocation === selected.id ? 'Army position' : connected ? `Road from ${armyLocation.name}` : 'Beyond the next road'}</span></div>
      <dl><div><dt>Benefit</dt><dd>{selected.benefit}</dd></div><div><dt>Threat</dt><dd>{game.chapter.scoutedLocations.includes(selected.id) ? selected.threat : 'Unknown force'}</dd></div><div><dt>Army</dt><dd>{game.chapter.armyDestination ? `Travelling to ${locations.find((location) => location.id === game.chapter.armyDestination)?.name ?? game.chapter.armyDestination}; arrives turn ${game.chapter.armyArrivesOn}` : game.chapter.armyLocation === selected.id ? 'Present and ready' : `At ${armyLocation.name}`}</dd></div></dl>
      <div className="map-actions"><button className="full" disabled={!!scoutReason} aria-describedby="scout-reason" onClick={() => commit(scout(game, selected.id))}>Scout route · 1 action</button><p id="scout-reason" className="action-reason">{scoutReason || 'Reveals the local threat and safer approach.'}</p><button className="full" disabled={!!moveReason} aria-describedby="move-reason" onClick={() => { commit(moveArmy(game, selected.id)); tutorial.complete('march'); void gameAudio.cue('confirm'); }}>Order march · 2 food</button><p id="move-reason" className={`action-reason ${moveReason ? 'blocked' : ''}`}>{moveReason || `The army will arrive at ${selected.name} when the next turn resolves.`}</p>{tutorial.state.active && tutorial.state.step === 'march' && <TutorialCallout className="tutorial-inline" title="Choose a linked road" onSkip={tutorial.skip}>Select a connected location, then order the march. Inspecting distant locations is always allowed.</TutorialCallout>}{game.chapter.armyDestination && <div className="advance-wrap"><button className="primary full" onClick={() => { commit(advanceTurn(game)); tutorial.complete('advance'); void gameAudio.cue('turn'); }}>Advance turn to arrive</button>{tutorial.state.active && tutorial.state.step === 'advance' && <TutorialCallout className="tutorial-inline" title="Let the march resolve" onSkip={tutorial.skip}>Advancing the turn completes travel, construction, income, and upkeep.</TutorialCallout>}</div>}{canBattle && <button className="primary full" onClick={() => commit({ ...game, screen: 'battle', notice: undefined })}>{game.chapter.battleAttempts ? 'Return to Greyfen battle' : 'Enter Greyfen battle'}</button>}</div>
      {report && <section className="battle-summary"><h3>Latest battle: {report.result}</h3>{(['infantry','archers','cavalry'] as UnitType[]).map((type) => <p key={type}><b>{units[type].name}</b><span>{report.survivors[type]} survived · {report.casualties[type]} lost</span></p>)}</section>}
      {tutorial.state.active && tutorial.state.step === 'aftermath' && report?.result === 'victory' && <TutorialCallout className="tutorial-inline aftermath" title="Count the cost" onSkip={tutorial.skip} onNext={() => tutorial.complete('aftermath')}>Review the survivors and casualties below. Then complete the chapter when your evidence or defences are ready.</TutorialCallout>}
      {canFinish(game) && <div className="ending-actions"><h3>End the conspiracy</h3><button className="primary full" onClick={() => commit(finishChapter(game, game.persistent.evidence.some((e) => e.id === 'ledger-gap') ? 'truth' : 'steel'))}>Confront the traitor</button></div>}
    </aside>
  </div>;
}

function Journal({ game, commit }: { game: GameState; commit(next: GameState): void }) {
  const [importing, setImporting] = useState(false); const [raw, setRaw] = useState(''); const [error, setError] = useState('');
  const download = () => { const blob = new Blob([exportSave(game)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'game-of-cat-save.json'; a.click(); URL.revokeObjectURL(url); };
  const restore = () => { try { const next = importSave(raw); saveGame(next); commit({ ...next, screen: 'journal', notice: 'Save imported successfully.' }); setImporting(false); } catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); } };
  return <div className="journal-screen"><header><p className="kicker">Knowledge survives the crown</p><h2>Evidence journal</h2><p>Confirmed observations are kept separate from suspicions. All entries persist across rewinds.</p><div><button onClick={download}>Export save</button><button onClick={() => setImporting(!importing)}>Import save</button></div></header>{importing && <section className="import-box"><label htmlFor="save-data">Paste version 1 save data</label><textarea id="save-data" value={raw} onChange={(e) => setRaw(e.target.value)} /><button className="primary" onClick={restore}>Validate and restore</button>{error && <p className="error">{error}</p>}</section>}<section className="evidence-list">{game.persistent.evidence.length === 0 ? <div className="empty-state"><h3>No evidence recorded</h3><p>Scout the old watch road or ask the council to open the royal accounts.</p></div> : game.persistent.evidence.map((item, index) => <article key={item.id}><span>{String(index + 1).padStart(2, '0')}</span><div><p className={`evidence-kind ${item.kind}`}>{item.kind}</p><h3>{item.title}</h3><p>{item.observation}</p><small>Source: {item.source}</small></div></article>)}</section></div>;
}

function CinematicBattle({ game, commit, tutorial }: { game: GameState; commit(next: GameState | ((s: GameState) => GameState)): void; tutorial: TutorialControls }) {
  return <>{tutorial.state.active && tutorial.state.step === 'deployment' && <TutorialCallout className="tutorial-battle tutorial-deployment" title="Place the three arms" onSkip={tutorial.skip}>Choose a lane for each troop type, then begin. Reserves replace losses after the fight.</TutorialCallout>}{tutorial.state.active && tutorial.state.step === 'battle' && <TutorialCallout className="tutorial-battle tutorial-orders" title="Command while time moves" onSkip={tutorial.skip}>Select any Crown squad, issue any order, and pause whenever you need time to read the field.</TutorialCallout>}<CinematicBattleCore game={game} commit={commit} tutorial={tutorial} /></>;
}

function CinematicBattleCore({ game, commit, tutorial }: { game: GameState; commit(next: GameState | ((s: GameState) => GameState)): void; tutorial: TutorialControls }) {
  const [deployment, setDeployment] = useState<Record<UnitType, Lane>>({ infantry: 'road', archers: 'high', cavalry: 'flank' });
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [paused, setPaused] = useState(true);
  const [selected, setSelected] = useState('c-infantry-0');
  const [pauseReason, setPauseReason] = useState('Orders remain available while paused.');
  const outcome = combat ? combatOutcome(combat) : null;
  const scouted = game.chapter.scoutedLocations.includes('pass') || game.chapter.scoutedLocations.includes('watchtower');
  const plan = planDeployment(game.chapter.army);

  useEffect(() => {
    if (!combat || paused || outcome) return;
    const id = window.setInterval(() => setCombat((current) => current ? combatTick(current) : current), 650);
    return () => clearInterval(id);
  }, [combat, paused, outcome]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) { setPaused(true); setPauseReason('Battle paused because the tab became hidden.'); } };
    document.addEventListener('visibilitychange', visibility); return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!combat) return;
      if (event.key === ' ') { event.preventDefault(); setPaused((value) => !value); }
      const crownIds = combat.units.filter((unit) => unit.side === 'crown' && unit.hp > 0).map((unit) => unit.id);
      const number = Number(event.key); if (number >= 1 && number <= crownIds.length) setSelected(crownIds[number - 1]);
      const keys: Record<string, Order> = { a: 'advance', h: 'hold', b: 'brace', g: 'regroup' };
      if (keys[event.key.toLowerCase()]) setCombat(issueOrder(combat, selected, keys[event.key.toLowerCase()]));
      if (event.key.toLowerCase() === 'r') { setCombat(rally(combat)); void gameAudio.cue('rally'); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [combat, selected]);
  useEffect(() => { if (outcome) { void gameAudio.cue(outcome === 'victory' ? 'victory' : 'defeat'); tutorial.complete('battle'); } }, [outcome]);
  useEffect(() => { if (combat) tutorial.complete('deployment'); }, [!!combat]);
  useEffect(() => { if (combat?.message.endsWith('issued.') || combat?.message.startsWith('Rally!')) tutorial.complete('battle'); }, [combat?.message]);

  if (!combat) return <main className="battle-prep cinematic-prep"><section><p className="kicker">Greyfen Pass · deployment</p><h1>Hold the road. Break their false banner.</h1><div className="battle-objective"><b>Objective</b><span>Route every raider squad. Rally once morale breaks; retreat preserves survivors.</span></div><p>{scouted ? 'Scouts reveal archers on the ridge and cavalry on the eastern flank.' : 'Enemy positions are uncertain. The ridge may conceal ranged troops.'}</p><p className="deployment-limit">Field limit: {DEPLOYMENT_LIMIT} squads. Reserves remain safe and replace losses after battle.</p><div className="deployment-grid">{(['infantry','archers','cavalry'] as UnitType[]).map((type) => <article key={type} className={`deploy-${type}`}><div className={`deploy-crest ${type}`} aria-hidden="true" /><h3>{units[type].name} <span>{plan.deployed[type]} fielded · {plan.reserves[type]} reserve</span></h3><p>{units[type].note}</p><label>Starting lane<select value={deployment[type]} onChange={(event) => setDeployment({ ...deployment, [type]: event.target.value as Lane })}><option value="high">High ground</option><option value="road">Central road</option><option value="flank">Open flank</option></select></label></article>)}</div></section><aside><img src={refs.north} alt="Grey-brown tabby Northern Lord candidate with yellow-green eyes, dark fur cloak, leather clothing, and round metal brooch." /><p><b>Northern Lord candidate</b><span>Portrait from supplied reference</span></p><blockquote>“Infantry for the road. Bows above it. Give the horses room, or do not bring them.”</blockquote><button className="primary full" onClick={() => { setCombat(createCombat(deployment, game.chapter.army, scouted, game.chapter.battleAttempts)); setPaused(false); void gameAudio.cue('confirm'); }}>Begin battle</button><button className="full" onClick={() => commit({ ...game, screen: 'map' })}>Return to map</button></aside></main>;

  const crown = combat.units.filter((unit) => unit.side === 'crown');
  const enemies = combat.units.filter((unit) => unit.side === 'raiders');
  const selectedUnit = combat.message.endsWith('issued.') ? undefined : combat.units.find((unit) => unit.id === selected);
  const order = (value: Order) => { setCombat(issueOrder(combat, selected, value)); void gameAudio.cue(value === 'advance' && selectedUnit?.type === 'cavalry' ? 'charge' : 'select'); };
  const retreat = () => commit(applyBattleResult(game, summarizeCombat(combat, 'retreat')));
  return <main className={`battle-screen cinematic-battle ${paused ? 'is-paused' : ''}`}><header><div><p className="kicker">Objective: break the false banner</p><h1>Greyfen Pass</h1></div><div className="battle-status"><span>Battle time {combat.tick}</span><b>{paused ? 'Orders paused' : 'Battle running'}</b></div><div className="battle-actions"><button onClick={() => { setPaused(!paused); setPauseReason('Orders remain available while paused.'); }}>{paused ? 'Resume' : 'Pause'} <kbd>Space</kbd></button><button className="danger" onClick={retreat}>Retreat</button></div></header><section className="battlefield" aria-label="Animated tactical battlefield"><div className="weather" aria-hidden="true" /><div className="ridge">HIGH GROUND</div><div className="road">CENTRAL ROAD</div><div className="flank">OPEN FLANK</div>{combat.units.filter((unit) => unit.type === 'archers' && unit.hp > 0 && !unit.routed).map((unit) => <i key={`arrow-${unit.id}-${combat.tick}`} className={`flying-arrow ${unit.side}`} style={{ top: unit.lane === 'high' ? '24%' : unit.lane === 'road' ? '52%' : '78%', left: `${unit.x}%` }} />)}{[...crown, ...enemies].map((unit) => <button key={unit.id} aria-label={`${unit.side} ${unit.type}, ${Math.round(unit.hp)} health, ${Math.round(unit.morale)} morale`} className={`unit troop ${unit.side} ${unit.type} ${unit.order} ${unit.routed ? 'routed' : ''} ${unit.hp <= 0 ? 'fallen' : ''} ${selected === unit.id ? 'selected' : ''}`} style={{ left: `${Math.max(3, Math.min(94, unit.x))}%`, top: unit.lane === 'high' ? '22%' : unit.lane === 'road' ? '51%' : '78%' }} onClick={() => { if (unit.side === 'crown') { setSelected(unit.id); void gameAudio.cue('select'); } }}><span className="troop-figure" aria-hidden="true" /><span className="unit-readout"><b>{unit.type}</b><i className="health"><span style={{ width: `${unit.hp}%` }} /></i><i className="morale"><span style={{ width: `${unit.morale}%` }} /></i><small>{Math.round(unit.hp)} health · {Math.round(unit.morale)} morale</small></span></button>)}</section><footer className="command-deck"><div className="selected-unit"><b>{selectedUnit ? `Selected: Crown ${selectedUnit.type}` : combat.message}</b><span>{selectedUnit ? `${selectedUnit.order} order · ${Math.round(selectedUnit.hp)} health · ${Math.round(selectedUnit.morale)} morale` : paused ? pauseReason : 'Battle running'}</span></div><div className="orders">{(['advance','hold','brace','regroup'] as Order[]).map((value) => <button key={value} className={selectedUnit?.order === value ? 'active' : ''} onClick={() => order(value)}>{value} <kbd>{value === 'advance' ? 'A' : value === 'hold' ? 'H' : value === 'brace' ? 'B' : 'G'}</kbd></button>)}<button className="rally" disabled={combat.rallyCooldown > 0} onClick={() => { setCombat(rally(combat)); void gameAudio.cue('rally'); }}>Rally {combat.rallyCooldown ? `· ${combat.rallyCooldown}` : 'ready'} <kbd>R</kbd></button></div></footer>{outcome && <div className="modal-backdrop battle-result"><section className="modal" role="dialog" aria-modal="true"><p className="kicker">Battle result</p><h2>{outcome === 'victory' ? 'The false banner falls.' : 'The royal line breaks.'}</h2><p>{outcome === 'victory' ? 'Greyfen is secure. Surviving raiders carried counterfeit royal orders.' : 'Your ruler is trapped beyond the broken infantry line.'}</p><div className="casualty-preview">{(['infantry','archers','cavalry'] as UnitType[]).map((type) => { const summary = summarizeCombat(combat, outcome); return <span key={type}>{units[type].name}: {summary.survivors[type]} survive, {summary.casualties[type]} lost</span>; })}</div><button className="primary" onClick={() => commit(applyBattleResult(game, summarizeCombat(combat, outcome)))}>{outcome === 'victory' ? 'Claim the field' : 'Face the final blow'}</button></section></div>}</main>;
}

function BattleScreen({ game, commit }: { game: GameState; commit(next: GameState | ((s: GameState) => GameState)): void }) {
  const [deployment, setDeployment] = useState<Record<UnitType, Lane>>({ infantry: 'road', archers: 'high', cavalry: 'flank' });
  const [combat, setCombat] = useState<CombatState | null>(null); const [paused, setPaused] = useState(true); const [selected, setSelected] = useState('c-infantry-0'); const [pauseReason, setPauseReason] = useState('Orders remain available while paused.');
  const outcome = combat ? combatOutcome(combat) : null;
  useEffect(() => { if (!combat || paused || outcome) return; const id = window.setInterval(() => setCombat((current) => current ? combatTick(current) : current), 650); return () => clearInterval(id); }, [combat, paused, outcome]);
  useEffect(() => { const visibility = () => { if (document.hidden) { setPaused(true); setPauseReason('Battle paused because the tab became hidden.'); } }; document.addEventListener('visibilitychange', visibility); return () => document.removeEventListener('visibilitychange', visibility); }, []);
  useEffect(() => { const key = (e: KeyboardEvent) => {
    if (!combat) return;
    if (e.key === ' ') { e.preventDefault(); setPaused((value) => !value); }
    const crownIds = combat.units.filter((unit) => unit.side === 'crown' && unit.hp > 0).map((unit) => unit.id);
    const number = Number(e.key); if (number >= 1 && number <= crownIds.length) setSelected(crownIds[number - 1]);
    const orderKeys: Record<string, Order> = { a: 'advance', h: 'hold', b: 'brace', g: 'regroup' };
    if (orderKeys[e.key.toLowerCase()]) setCombat(issueOrder(combat, selected, orderKeys[e.key.toLowerCase()]));
    if (e.key.toLowerCase() === 'r') setCombat(rally(combat));
  }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [combat, selected]);
  const crown = combat?.units.filter((u) => u.side === 'crown') ?? []; const enemies = combat?.units.filter((u) => u.side === 'raiders') ?? [];
  const order = (value: Order) => combat && setCombat(issueOrder(combat, selected, value));
  const plan = planDeployment(game.chapter.army);
  if (!combat) return <main className="battle-prep"><section><p className="kicker">Greyfen Pass · Deployment</p><h1>Hold the road. Break their false banner.</h1><p>{game.chapter.scoutedLocations.includes('pass') || game.chapter.scoutedLocations.includes('watchtower') ? 'Scouts report archers on the ridge and cavalry on the eastern flank.' : 'Enemy positions are uncertain. The ridge may conceal ranged troops.'}</p><p className="deployment-limit">Field limit: {DEPLOYMENT_LIMIT} squads. Recruited squads beyond the limit remain safe in reserve and replace losses after battle.</p><div className="deployment-grid">{(['infantry','archers','cavalry'] as UnitType[]).map((type) => <article key={type}><h3>{units[type].name} <span>{plan.deployed[type]} fielded · {plan.reserves[type]} reserve</span></h3><p>{units[type].note}</p><label>Starting lane<select value={deployment[type]} onChange={(e) => setDeployment({ ...deployment, [type]: e.target.value as Lane })}><option value="high">High ground</option><option value="road">Central road</option><option value="flank">Open flank</option></select></label></article>)}</div></section><aside><img src={refs.north} alt="Grey-brown tabby Northern Lord candidate with yellow-green eyes, dark fur cloak, leather clothing, and round metal brooch." /><p><b>Northern Lord candidate</b><span>Provisional identity</span></p><blockquote>“Infantry for the road. Bows above it. Give the horses room, or do not bring them.”</blockquote><button className="primary full" onClick={() => { setCombat(createCombat(deployment, game.chapter.army, game.chapter.scoutedLocations.includes('pass') || game.chapter.scoutedLocations.includes('watchtower'), game.chapter.battleAttempts)); setPaused(false); }}>Begin battle</button><button className="full" onClick={() => commit({ ...game, screen: 'map' })}>Return to map</button></aside></main>;
  const retreat = () => commit(applyBattleResult(game, summarizeCombat(combat, 'retreat')));
  return <main className="battle-screen"><header><div><p className="kicker">Temporary tactical battlefield · Gameplay complete</p><h1>Greyfen Pass</h1></div><div className="battle-actions"><button onClick={() => { setPaused(!paused); setPauseReason('Orders remain available while paused.'); }}>{paused ? 'Resume' : 'Pause'} <kbd>Space</kbd></button><button className="danger" onClick={retreat}>Retreat</button></div></header><section className="battlefield" aria-label="Tactical battlefield"><div className="ridge">HIGH GROUND</div><div className="road">CENTRAL ROAD</div><div className="flank">OPEN FLANK</div>{[...crown, ...enemies].map((unit) => <button key={unit.id} aria-label={`${unit.side} ${unit.type}, ${Math.round(unit.hp)} health`} className={`unit ${unit.side} ${unit.routed || unit.hp <= 0 ? 'fallen' : ''} ${selected === unit.id ? 'selected' : ''}`} style={{ left: `${Math.max(3, Math.min(94, unit.x))}%`, top: unit.lane === 'high' ? '22%' : unit.lane === 'road' ? '51%' : '78%' }} onClick={() => unit.side === 'crown' && setSelected(unit.id)}><b>{unit.type.slice(0, 3).toUpperCase()}</b><i><span style={{ width: `${unit.hp}%` }} /></i><small>{Math.round(unit.morale)} morale</small></button>)}</section><footer className="command-deck"><div><b>{combat.message}</b><span>{paused ? pauseReason : 'Battle running. Select squads by touch or keys 1–6.'}</span></div><div className="orders">{(['advance','hold','brace','regroup'] as Order[]).map((value) => <button key={value} onClick={() => order(value)}>{value} <kbd>{value === 'advance' ? 'A' : value === 'hold' ? 'H' : value === 'brace' ? 'B' : 'G'}</kbd></button>)}<button className="rally" disabled={combat.rallyCooldown > 0} onClick={() => setCombat(rally(combat))}>Rally {combat.rallyCooldown ? `· ${combat.rallyCooldown}` : ''} <kbd>R</kbd></button></div></footer>{outcome && <div className="modal-backdrop"><section className="modal"><p className="kicker">Battle result</p><h2>{outcome === 'victory' ? 'The false banner falls.' : 'The royal line breaks.'}</h2><p>{outcome === 'victory' ? 'Greyfen is secure. Surviving raiders carried counterfeit royal orders.' : 'Your ruler is trapped beyond the broken infantry line.'}</p><div className="casualty-preview">{(['infantry','archers','cavalry'] as UnitType[]).map((type) => { const summary = summarizeCombat(combat, outcome); return <span key={type}>{units[type].name}: {summary.survivors[type]} survive, {summary.casualties[type]} lost</span>; })}</div><button className="primary" onClick={() => commit(applyBattleResult(game, summarizeCombat(combat, outcome)))}>{outcome === 'victory' ? 'Claim the field' : 'Face the final blow'}</button></section></div>}</main>;
}

function DeathScreen({ game, rewind, menu }: { game: GameState; rewind(): void; menu(): void }) { return <main className="death-screen"><img src={refs.rider} alt="A concealed rider in dark weathered armour on a dark horse in snow." /><section><p className="kicker">One life spent · {game.persistent.livesRemaining} remain</p><h1>The crown remembers <em>the blade.</em></h1><p>{game.notice}</p><dl><div><dt>What led here</dt><dd>The palace threat outpaced your preparations or the army was destroyed.</dd></div><div><dt>What survives</dt><dd>All evidence, including the perfumed warning, remains in your journal.</dd></div><div><dt>What changes</dt><dd>The funeral begins again. Buildings, troops, trust, and resources return to the chapter checkpoint.</dd></div></dl><button className="primary" onClick={rewind}>Rewind chapter</button><button onClick={menu}>Return to menu</button></section></main>; }

function Ending({ game, menu }: { game: GameState; menu(): void }) { const truth = game.chapter.ending === 'truth'; return <main className="ending-screen"><div className="ending-image"><img src={truth ? refs.steward : refs.ruler} alt={truth ? 'Brown-and-white bovine court figure with horns, ornate dark robe, and heavy gold chain.' : 'The crowned ruler in black-and-gold court dress.'} /></div><section><p className="kicker">Chapter I complete · {truth ? 'The ledger ending' : 'The iron gate ending'}</p><h1>{truth ? 'Truth enters before the knives.' : 'The palace holds through the long night.'}</h1><p>{truth ? 'The scraped account and counterfeit pass orders force the acting steward to name the seal-keeper’s buyer. The conspiracy fractures in open council.' : 'Reinforced gates and loyal guards turn the palace ambush into a failed siege. The missing seal remains a dangerous mystery.'}</p><div className="ending-summary"><span>{game.persistent.evidence.length} evidence entries retained</span><span>{game.persistent.livesRemaining} lives remain</span><span>Greyfen: {game.chapter.battleResult}</span></div><p className="dev-label">Chapter II is outside phases 0–3. This playable build ends here.</p><button className="primary" onClick={menu}>Return to title</button></section></main>; }
