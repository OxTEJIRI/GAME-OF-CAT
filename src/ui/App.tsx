import { useEffect, useMemo, useRef, useState } from 'react';
import { buildings, characters, locations, refs, units } from '../content/gameContent';
import { applyBattleResult, advanceTurn, canFinish, councilChoice, finishChapter, moveArmy, newGame, recruit, rewindChapter, scout, trustLabel, upgradeBuilding } from '../game/rules';
import { DEPLOYMENT_LIMIT, combatOutcome, combatTick, createCombat, issueOrder, planDeployment, rally, summarizeCombat, type CombatState, type Lane, type Order } from '../game/combat';
import type { BuildingId, GameState, Screen, UnitType } from '../game/types';
import { exportSave, hasSave, importSave, loadGame, saveGame } from '../services/saves';
import { gameAudio, loadAudioSettings, type AudioSettings } from '../services/audio';
import { completeTutorialStep, loadTutorial, replayTutorial, saveTutorial, skipTutorial, type TutorialState } from '../services/tutorial';
import { Battle } from './Battle';
import { TutorialCallout, type TutorialControls } from './common';
import { ResourceBar, TurnHerald, useStateCues } from './feedback';
import { SouthernSea } from './SouthernSea';

const labelScreen: Record<Screen, string> = { menu: 'Menu', funeral: 'Prologue', kingdom: 'Kingdom', council: 'Council', map: 'Region', journal: 'Journal', battle: 'Battle', death: 'Rewind', ending: 'Chapter end' };
type AllegiancePage = 'realms' | 'banner' | null;
type FlowPage = Screen | 'allegiance' | 'banner';
type Realm = { id: string; name: string; byname: string; description: string; x: number; y: number; colour: string };

const realms: Realm[] = [
  { id: 'frost-frontier', name: 'Frost Frontier', byname: 'Where the pines keep watch', description: 'A hard northern realm of watchfires, old roads, and snowbound keeps.', x: 49, y: 17, colour: '#c9e1e6' },
  { id: 'high-vale', name: 'High Vale', byname: 'The eagle’s high road', description: 'High passes and quiet strongholds guard the eastern heights.', x: 70, y: 31, colour: '#bfaa70' },
  { id: 'westmarch', name: 'Westmarch', byname: 'The old stone country', description: 'Hill forts and deep mines hold the western marches together.', x: 28, y: 38, colour: '#a88762' },
  { id: 'crownlands', name: 'Crownlands', byname: 'The heart beneath the crown', description: 'The royal roads meet here, beneath the watch of Crownrest.', x: 51, y: 48, colour: '#c4574f' },
  { id: 'greenreach', name: 'Greenreach', byname: 'Fields beneath a golden sun', description: 'Broad farms, river towns, and the kingdom’s full granaries.', x: 42, y: 67, colour: '#93ae79' },
  { id: 'storm-coast', name: 'Storm Coast', byname: 'Salt wind and safe harbour', description: 'Sea walls and stubborn ports face the western storms.', x: 77, y: 61, colour: '#7aaaba' },
  { id: 'sunward-reach', name: 'Sunward Reach', byname: 'The southern road', description: 'Warm valleys and caravan roads lead to the far south.', x: 62, y: 82, colour: '#cf9368' },
];

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [allegiancePage, setAllegiancePage] = useState<AllegiancePage>(null);
  const [selectedRealmId, setSelectedRealmId] = useState<string | null>(null);
  const [pledgedRealmId, setPledgedRealmId] = useState<string | null>(null);
  const [bannerName, setBannerName] = useState('');
  const [menuHasSave, setMenuHasSave] = useState(hasSave());
  const [storageError, setStorageError] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(loadAudioSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialState, setTutorialState] = useState<TutorialState>(loadTutorial);
  const previousChapter = useRef<GameState['chapter'] | null>(null);

  const updateAudioSettings = (settings: AudioSettings) => {
    setAudioSettings(settings);
    gameAudio.setSettings(settings);
  };

  const tutorial: TutorialControls = {
    state: tutorialState,
    complete: (step) => setTutorialState((current) => completeTutorialStep(current, step)),
    skip: () => setTutorialState(skipTutorial()),
  };

  useEffect(() => { gameAudio.setSettings(audioSettings); }, [audioSettings]);
  useEffect(() => {
    const resumeMusic = () => { void gameAudio.startMusic(); };
    document.addEventListener('pointerdown', resumeMusic);
    document.addEventListener('keydown', resumeMusic);
    return () => {
      document.removeEventListener('pointerdown', resumeMusic);
      document.removeEventListener('keydown', resumeMusic);
    };
  }, []);
  useEffect(() => { saveTutorial(tutorialState); }, [tutorialState]);
  useStateCues(game);
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

  const navigate = (screen: FlowPage) => {
    setSettingsOpen(false);
    if (screen === 'menu') { setAllegiancePage(null); if (game) setGame({ ...game, screen: 'menu' }); return; }
    if (screen === 'allegiance') { setAllegiancePage('realms'); return; }
    if (screen === 'banner') { if (pledgedRealmId) setAllegiancePage('banner'); else setAllegiancePage('realms'); return; }
    const base = game ?? loadGame();
    if (!base) return;
    const next = { ...base, screen: lockedScreen(base) ?? screen };
    if (!saveGame(next)) setStorageError(true);
    setMenuHasSave(true);
    setGame(next);
  };
  const canVisitPage = (page: FlowPage) => page === 'menu' || page === 'allegiance' || (page === 'banner' ? !!pledgedRealmId : !!game || menuHasSave);
  const pageNavigator = (current: FlowPage) => <PageNavigator current={current} canVisit={canVisitPage} onNavigate={navigate} />;

  if (allegiancePage === 'realms') return <AllegianceMap selectedId={selectedRealmId} onSelect={setSelectedRealmId} onBack={() => setAllegiancePage(null)} onPledge={() => { if (selectedRealmId) { setPledgedRealmId(selectedRealmId); setAllegiancePage('banner'); } }} />;
  if (allegiancePage === 'banner' && pledgedRealmId) return <BannerPledge realm={realms.find((realm) => realm.id === pledgedRealmId)!} name={bannerName} onName={setBannerName} onBack={() => setAllegiancePage('realms')} onBegin={() => { setAllegiancePage(null); const next = newGame(); saveGame(next); setGame(next); setMenuHasSave(true); void gameAudio.cue('confirm'); }} />;

  if (!game || game.screen === 'menu') return <>{pageNavigator('menu')}<Menu hasSave={menuHasSave} onNew={() => setAllegiancePage('realms')} onContinue={() => setGame(loadGame())} onSettings={() => setSettingsOpen(true)} settingsOpen={settingsOpen} closeSettings={() => setSettingsOpen(false)} audioSettings={audioSettings} setAudioSettings={updateAudioSettings} replayTutorial={() => setTutorialState(replayTutorial())} tutorialState={tutorialState} storageError={storageError} /></>;

  if (game.screen === 'funeral') return <>{pageNavigator('funeral')}<Funeral game={game} proceed={() => commit({ ...game, screen: 'kingdom', persistent: { ...game.persistent, seenScenes: ['funeral'] } })} /></>;
  if (game.screen === 'battle') return <Battle game={game} commit={commit} tutorial={tutorial} />;
  if (game.screen === 'death') return <DeathScreen game={game} rewind={() => commit(rewindChapter(game))} menu={() => commit({ ...game, screen: 'menu' })} />;
  if (game.screen === 'ending') return <Ending game={game} menu={() => commit({ ...game, screen: 'menu' })} />;

  return <>{pageNavigator(game.screen)}<GameShell game={game} setScreen={(screen) => screen === 'menu' ? setGame({ ...game, screen: 'menu' }) : commit({ ...game, screen })} openSettings={() => setSettingsOpen(true)} settingsOpen={settingsOpen} closeSettings={() => setSettingsOpen(false)} audioSettings={audioSettings} setAudioSettings={updateAudioSettings} replayTutorial={() => { setTutorialState(replayTutorial()); commit({ ...game, screen: 'kingdom' }); }} muted={audioSettings.muted} toggleMute={() => updateAudioSettings({ ...audioSettings, muted: !audioSettings.muted })} storageError={storageError} tutorial={tutorial}>
    {game.screen === 'kingdom' && <Kingdom game={game} commit={commit} tutorial={tutorial} />}
    {game.screen === 'council' && <Council game={game} commit={commit} tutorial={tutorial} />}
    {game.screen === 'map' && <IllustratedMapScreen game={game} commit={commit} tutorial={tutorial} />}
    {game.screen === 'journal' && <Journal game={game} commit={commit} />}
  </GameShell></>;
}

function AllegianceMap({ selectedId, onSelect, onBack, onPledge }: { selectedId: string | null; onSelect(id: string): void; onBack(): void; onPledge(): void }) {
  const selected = realms.find((realm) => realm.id === selectedId);
  return <main className="allegiance-page realm-choice-page">
    <header className="allegiance-header"><button className="allegiance-back" onClick={onBack}>‹ <span>Back to title</span></button><span className="allegiance-mark">GAME OF CAT <i>✦</i> WAR OF THE NINE LIVES</span></header>
    <section className="allegiance-intro"><p className="kicker">The realm remembers its friends</p><h1>Seven kingdoms.<br />Where do you stand?</h1><p>Choose the banner you’ll stand beneath. Your pledge is for the story; it won’t change the chapter’s rules.</p></section>
    <div className="realm-layout">
      <div className="realm-map-stage" aria-label="Illustrated map of the Seven Kingdoms">
        <img className="realm-map-art" src="/assets/environments/seven-kingdoms-map.svg" alt="" />
        <span className="map-caption map-caption-north">THE FAR NORTH</span><SouthernSea />
        {realms.map((realm, index) => <button key={realm.id} data-testid={`realm-marker-${realm.id}`} aria-label={`Choose ${realm.name}`} aria-pressed={selectedId === realm.id} className={`realm-marker ${selectedId === realm.id ? 'selected' : ''}`} style={{ '--realm-x': `${realm.x}%`, '--realm-y': `${realm.y}%`, '--realm-colour': realm.colour } as React.CSSProperties} onClick={() => onSelect(realm.id)}><span>{index + 1}</span><b>{realm.name}</b></button>)}
        <div className="map-compass" aria-hidden="true"><span>N</span><i>✦</i><small>S</small></div>
      </div>
      <aside className="realm-ledger">
        <div className="realm-ledger-head"><span>Choose a banner</span><small>7 REALMS</small></div>
        <div className="realm-list" role="group" aria-label="Seven kingdoms">
          {realms.map((realm, index) => <button key={realm.id} className={`realm-option ${selectedId === realm.id ? 'selected' : ''}`} aria-pressed={selectedId === realm.id} onClick={() => onSelect(realm.id)}><span className="realm-number">0{index + 1}</span><span className="realm-option-copy"><b>{realm.name}</b><small>{realm.byname}</small></span><i style={{ '--realm-colour': realm.colour } as React.CSSProperties} aria-hidden="true">◆</i></button>)}
        </div>
        <div className="realm-selection" aria-live="polite">
          {selected ? <><span className="selection-eyebrow">YOU STAND WITH</span><h2>{selected.name}</h2><p>{selected.description}</p><button className="primary" onClick={onPledge}>Pledge to {selected.name}</button></> : <><span className="selection-eyebrow">YOUR CHOICE</span><h2>Choose your realm</h2><p>Select a numbered marker on the map or a banner from the list.</p><button className="primary" disabled>Pledge your loyalty</button></>}
        </div>
      </aside>
    </div>
    <footer className="allegiance-footer"><span>Every road leads to a different story.</span><span>Choose by heart, not by advantage.</span></footer>
  </main>;
}

function BannerPledge({ realm, name, onName, onBack, onBegin }: { realm: Realm; name: string; onName(value: string): void; onBack(): void; onBegin(): void }) {
  const certificateName = name.trim() || 'The Unnamed House';
  const downloadCertificate = () => {
    const xml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="840" viewBox="0 0 1200 840"><defs><linearGradient id="paper" x2="0" y2="1"><stop stop-color="#eadbb8"/><stop offset="1" stop-color="#c8b587"/></linearGradient><linearGradient id="gold" x2="0" y2="1"><stop stop-color="#f5dda3"/><stop offset="1" stop-color="#9c7134"/></linearGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#1a1710" flood-opacity=".35"/></filter><pattern id="grain" width="90" height="90" patternUnits="userSpaceOnUse"><path d="M0 21h22M55 72h30M41 8h14M6 57h12" stroke="#695b3d" stroke-opacity=".08"/><circle cx="72" cy="22" r="1.3" fill="#fff" fill-opacity=".32"/></pattern></defs><rect width="1200" height="840" fill="#22363a"/><path d="M34 34h1132v772H34z" fill="url(#paper)" stroke="#c6a66b" stroke-width="5"/><path d="M54 54h1092v732H54z" fill="url(#grain)" stroke="#6f5b34" stroke-width="2"/><path d="M77 77h1046v686H77z" fill="none" stroke="#a47f43" stroke-width="2"/><g fill="#6e2433"><path d="M83 83h140l-34 68 34 68H83z"/><path d="M1117 83H977l34 68-34 68h140z"/></g><g fill="url(#gold)" stroke="#704e27" stroke-width="3"><path d="M600 110 633 174 704 184 652 234 664 305 600 271 536 305 548 234 496 184 567 174z"/></g><circle cx="600" cy="205" r="53" fill="#1b2b2d" stroke="#c6a66b" stroke-width="5"/><text x="600" y="222" text-anchor="middle" fill="#eadbb8" font-family="Georgia,serif" font-size="52">${xml(realm.name[0])}</text><text x="600" y="365" text-anchor="middle" fill="#38423a" font-family="Georgia,serif" font-size="25" letter-spacing="9">OATH OF THE SEVEN KINGDOMS</text><path d="M250 390h700" stroke="#947741" stroke-width="2"/><text x="600" y="456" text-anchor="middle" fill="#1b2421" font-family="Georgia,serif" font-size="58" font-weight="bold">YOUR BANNER / YOUR ALLEGIANCE</text><text x="600" y="525" text-anchor="middle" fill="#6e2433" font-family="Georgia,serif" font-size="39">${xml(certificateName)}</text><text x="600" y="578" text-anchor="middle" fill="#38423a" font-family="Georgia,serif" font-size="24">pledges loyalty to</text><text x="600" y="638" text-anchor="middle" fill="#263f46" font-family="Georgia,serif" font-size="49" font-weight="bold">${xml(realm.name)}</text><text x="600" y="681" text-anchor="middle" fill="#6b654f" font-family="Georgia,serif" font-size="22" font-style="italic">${xml(realm.byname)}</text><path d="M490 720h220" stroke="#947741" stroke-width="2"/><text x="600" y="751" text-anchor="middle" fill="#514a39" font-family="Georgia,serif" font-size="16" letter-spacing="4">BY WORD, WITNESS, AND WILL</text><g filter="url(#shadow)"><circle cx="1040" cy="697" r="54" fill="#742d37" stroke="#c6a66b" stroke-width="7"/><circle cx="1040" cy="697" r="41" fill="none" stroke="#d2ad72" stroke-width="2" stroke-dasharray="2 5"/><path d="m1040 663 9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3z" fill="#e4c583"/></g><g fill="none" stroke="#856d40" stroke-width="2"><path d="M98 250q55 48 0 96m1004-96q-55 48 0 96M98 520q55 48 0 96m1004-96q-55 48 0 96"/></g></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `banner-${realm.id}.svg`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main className="allegiance-page banner-page">
    <header className="allegiance-header"><button className="allegiance-back" onClick={onBack}>‹ <span>Back to the map</span></button><span className="allegiance-mark">GAME OF CAT <i>✦</i> WAR OF THE NINE LIVES</span></header>
    <section className="allegiance-intro"><p className="kicker">A promise worth keeping</p><h1>Your banner /<br />your allegiance</h1><p>Give your house a name. We’ll set your pledge in a keepsake you can download and share.</p></section>
    <div className="banner-layout">
      <section className="banner-form"><label htmlFor="banner-name">What name should your banner bear?</label><input id="banner-name" aria-label="Banner name" maxLength={32} autoComplete="off" placeholder="Your name or house name" value={name} onChange={(event) => onName(event.target.value)} /><div className="pledge-ribbon"><span>YOUR PLEDGE</span><strong>{realm.name}</strong><small>{realm.byname}</small></div><button className="download-certificate" onClick={downloadCertificate}>⇩ <span>Download banner certificate</span></button><p className="certificate-note">A print-ready illustrated SVG certificate, made just for this pledge.</p><button className="primary begin-chapter" onClick={onBegin}>Begin Chapter I</button></section>
      <div className="certificate-frame"><div className="certificate-preview" role="img" aria-label={`Certificate preview for ${certificateName}, loyal to ${realm.name}`}><div className="certificate-corners"><span>✦</span><span>✦</span><span>✦</span><span>✦</span></div><div className="certificate-top-ribbons"><span>{realm.name}</span><b>✦</b><span>OATH OF THE SEVEN KINGDOMS</span></div><div className="certificate-crest" style={{ '--realm-colour': realm.colour } as React.CSSProperties}><i aria-hidden="true">{realm.name[0]}</i></div><p className="certificate-kicker">YOUR BANNER / YOUR ALLEGIANCE</p><h2>{certificateName}</h2><p className="certificate-pledge">pledges loyalty to</p><strong>{realm.name}</strong><em>{realm.byname}</em><div className="certificate-seal" aria-hidden="true"><span>✦</span><small>SEALED</small></div><small className="certificate-foot">BY WORD, WITNESS, AND WILL</small></div></div>
    </div>
    <footer className="allegiance-footer"><span>Your pledge is a keepsake, not a campaign advantage.</span><span>The crown awaits.</span></footer>
  </main>;
}

const pageOrder: { screen: FlowPage; label: string }[] = [
  { screen: 'menu', label: 'Title' }, { screen: 'allegiance', label: 'Allegiance' }, { screen: 'banner', label: 'Your banner' },
  { screen: 'funeral', label: 'Prologue' }, { screen: 'kingdom', label: 'Kingdom' },
  { screen: 'council', label: 'Council' }, { screen: 'map', label: 'Region' }, { screen: 'journal', label: 'Journal' },
];

// A pending battle, unrewound death, or finished chapter must be resolved before free page navigation resumes.
function lockedScreen(game: GameState): Screen | null {
  if (game.chapter.flags.deathCauseSet) return 'death';
  if (game.chapter.ending) return 'ending';
  return game.screen === 'battle' ? 'battle' : null;
}

function PageNavigator({ current, canVisit, onNavigate }: { current: FlowPage; canVisit(screen: FlowPage): boolean; onNavigate(screen: FlowPage): void }) {
  const [open, setOpen] = useState(false);
  const index = pageOrder.findIndex((page) => page.screen === current);
  const previous = pageOrder[index - 1];
  const next = pageOrder[index + 1];
  const go = (screen: FlowPage) => { setOpen(false); if (screen !== current) onNavigate(screen); };
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [open]);
  if (index < 0) return null;
  return <nav className={`page-navigator ${current === 'menu' || current === 'funeral' ? '' : 'in-shell'}`} aria-label="Page navigation">
    {open && <ol id="page-list" className="page-list">{pageOrder.map((page, i) => <li key={page.screen}><button aria-current={page.screen === current ? 'page' : undefined} disabled={!canVisit(page.screen)} onClick={() => go(page.screen)}><span>{String(i + 1).padStart(2, '0')}</span>{page.label}</button></li>)}{!canVisit('funeral') && <li className="page-hint">Start a campaign to open the prologue and chapter pages.</li>}</ol>}
    <button className="page-step" aria-label="Previous page" title={previous ? `Previous: ${previous.label}` : undefined} disabled={!previous || !canVisit(previous.screen)} onClick={() => previous && go(previous.screen)}>‹</button>
    <button className="page-toggle" aria-label="Page list" aria-expanded={open} aria-controls="page-list" onClick={() => setOpen(!open)}><span className="diamond" aria-hidden="true">◆</span>{pageOrder[index].label}<small>{index + 1} / {pageOrder.length}</small></button>
    <button className="page-step" aria-label="Next page" title={next ? `Next: ${next.label}` : undefined} disabled={!next || !canVisit(next.screen)} onClick={() => next && go(next.screen)}>›</button>
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
    {settingsOpen && <div className="modal-backdrop"><section className="modal audio-panel" role="dialog" aria-modal="true" aria-label="Settings"><h2>Settings</h2><label className="toggle"><input type="checkbox" checked={audioSettings.musicEnabled} onChange={(e) => setAudioSettings({ ...audioSettings, musicEnabled: e.target.checked })} /> Background music</label><label className="toggle"><input type="checkbox" checked={audioSettings.muted} onChange={(e) => setAudioSettings({ ...audioSettings, muted: e.target.checked })} /> Mute all audio</label><label>Ambience <input aria-label="Ambience" type="range" min="0" max="1" step="0.05" value={audioSettings.ambience} onChange={(e) => setAudioSettings({ ...audioSettings, ambience: Number(e.target.value), muted: false })} /></label><label>Effects <input aria-label="Effects" type="range" min="0" max="1" step="0.05" value={audioSettings.effects} onChange={(e) => setAudioSettings({ ...audioSettings, effects: Number(e.target.value), muted: false })} /></label><p>The theme loops while enabled. Playback begins after your first click or key press.</p><div className="tutorial-settings"><b>Guided opening</b><span>{tutorialState.active ? 'Tutorial in progress' : tutorialState.completed ? 'Tutorial completed or skipped' : 'Tutorial ready'}</span><button onClick={() => { replay(); closeSettings(); }}>Replay tutorial</button></div><button className="primary" onClick={closeSettings}>Done</button></section></div>}
  </main>;
}

function Funeral({ game, proceed }: { game: GameState; proceed(): void }) {
  const scene = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = scene.current;
    if (!video) return;
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const setPlaybackSpeed = () => { video.playbackRate = 0.72; };
    const applyMotionPreference = () => {
      if (motionPreference.matches) video.pause();
      else void video.play().catch(() => undefined);
    };
    video.addEventListener('loadedmetadata', setPlaybackSpeed);
    if (video.readyState >= 1) setPlaybackSpeed();
    applyMotionPreference();
    motionPreference.addEventListener('change', applyMotionPreference);
    return () => {
      video.removeEventListener('loadedmetadata', setPlaybackSpeed);
      motionPreference.removeEventListener('change', applyMotionPreference);
    };
  }, []);
  return <main className="cinematic prologue-scene-page"><video ref={scene} data-testid="prologue-scene" className="prologue-video" autoPlay muted loop playsInline preload="metadata" poster="/assets/video/setup-funeral-poster.jpg" aria-hidden="true"><source src="/assets/video/setup-funeral.mp4" type="video/mp4" /></video><div className="cinematic-copy"><p className="kicker">Chapter I · The Missing Seal</p><h1>The bells stop. <em>The doubt begins.</em></h1><p>At the old king's funeral, the seal meant to secure the succession is gone. The Northern Lord warns that false orders already travel the Greyfen road.</p><p className="speaker">Royal cat / Queen candidate <span>provisional identity</span></p><blockquote>“Keep soldiers close tonight. Grief makes a court careless.”</blockquote><button className="primary" onClick={proceed}>{game.persistent.seenScenes.includes('funeral') ? 'Skip remembered scene' : 'Take the crown'}</button></div></main>;
}

function GameShell({ game, setScreen, openSettings, settingsOpen, closeSettings, audioSettings, setAudioSettings, replayTutorial, muted, toggleMute, storageError, tutorial, children }: { game: GameState; setScreen(s: Screen): void; openSettings(): void; settingsOpen: boolean; closeSettings(): void; audioSettings: AudioSettings; setAudioSettings(v: AudioSettings): void; replayTutorial(): void; muted: boolean; toggleMute(): void; storageError: boolean; tutorial: TutorialControls; children: React.ReactNode }) {
  return <main className="game-shell">
    <header className="topbar"><button className="wordmark" onClick={() => setScreen('menu')}>GAME OF CAT</button><div className="chapter-marker">Chapter I / Turn {game.chapter.turn}</div><ResourceBar game={game} /><button className="mute" onClick={toggleMute}>{muted ? 'Muted' : 'Sound on'}</button><button className="settings-button" onClick={openSettings}>Settings</button></header>
    <aside className="side-nav" aria-label="Game sections">{(['kingdom','council','map','journal'] as Screen[]).map((screen) => <button key={screen} data-nav={screen} className={game.screen === screen ? 'active' : ''} onClick={() => setScreen(screen)}><span>{labelScreen[screen]}</span>{screen === 'journal' && game.persistent.evidence.length > 0 && <b>{game.persistent.evidence.length}</b>}</button>)}{tutorial.state.active && tutorial.state.step === 'council' && <TutorialCallout className="tutorial-nav tutorial-council-nav" title="Hear every voice" onSkip={tutorial.skip}>Choose Council and make a ruling before the army leaves Crownrest.</TutorialCallout>}{tutorial.state.active && tutorial.state.step === 'region' && <TutorialCallout className="tutorial-nav tutorial-region-nav" title="Open the Crownlands" onSkip={tutorial.skip}>Choose Region, then inspect any location.</TutorialCallout>}</aside>
    {settingsOpen && <div className="modal-backdrop"><section className="modal audio-panel" role="dialog" aria-modal="true" aria-label="Settings"><h2>Settings</h2><label className="toggle"><input type="checkbox" checked={audioSettings.musicEnabled} onChange={(event) => setAudioSettings({ ...audioSettings, musicEnabled: event.target.checked })} /> Background music</label><label className="toggle"><input type="checkbox" checked={audioSettings.muted} onChange={(event) => setAudioSettings({ ...audioSettings, muted: event.target.checked })} /> Mute all audio</label><label>Ambience <input aria-label="Ambience" type="range" min="0" max="1" step="0.05" value={audioSettings.ambience} onChange={(event) => setAudioSettings({ ...audioSettings, ambience: Number(event.target.value), muted: false })} /></label><label>Effects <input aria-label="Effects" type="range" min="0" max="1" step="0.05" value={audioSettings.effects} onChange={(event) => setAudioSettings({ ...audioSettings, effects: Number(event.target.value), muted: false })} /></label><div className="tutorial-settings"><b>Guided opening</b><span>{tutorial.state.active ? 'Tutorial in progress' : 'Tutorial completed or skipped'}</span><button onClick={replayTutorial}>Replay tutorial</button></div><button className="primary" onClick={closeSettings}>Done</button></section></div>}
    <section className="stage">{storageError && <div className="storage-warning">Autosave unavailable. Export a save from the Journal.</div>}{game.notice && <div className="notice" role="status">{game.notice}</div>}<TurnHerald game={game} />{children}</section>
  </main>;
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
