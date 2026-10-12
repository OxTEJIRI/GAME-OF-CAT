import { useEffect, useState } from 'react';
import { refs } from '../content/gameContent';
import type { GameState } from '../game/types';
import './teasers.css';

/* "The story continues" moments: a chapter strip on the title, a Chapter II reveal after the ending, and sealed
   regions on the map. Endings found are remembered across campaigns so replaying for the other ending feels earned. */

const ENDINGS_KEY = 'game-of-cat-endings-v1';
type Ending = 'truth' | 'steel';
const endingNames: Record<Ending, string> = { truth: 'The ledger ending', steel: 'The iron gate ending' };
const endingHints: Record<Ending, string> = {
  truth: 'Open the royal accounts, then win at Greyfen.',
  steel: 'Keep guards in the palace, raise the Lion Gate to level 2, then win at Greyfen.',
};

export function loadEndings(): Ending[] {
  try { const parsed = JSON.parse(localStorage.getItem(ENDINGS_KEY) ?? '[]'); return Array.isArray(parsed) ? parsed.filter((item): item is Ending => item === 'truth' || item === 'steel') : []; }
  catch { return []; }
}
function recordEnding(ending: Ending) {
  try { const found = loadEndings(); if (!found.includes(ending)) localStorage.setItem(ENDINGS_KEY, JSON.stringify([...found, ending])); } catch { /* storage is optional */ }
}

const chapters = [
  { numeral: 'I', name: 'The Missing Seal', status: 'playable' as const },
  { numeral: 'II', name: 'The Northern Warning', status: 'soon' as const },
  { numeral: 'III', name: 'Fire Beyond the Crown', status: 'sealed' as const },
];

/** Title-screen strip: Chapter I to play, the next two sealed. */
export function ChapterStrip() {
  const [found] = useState(loadEndings);
  return <div className="chapter-strip" aria-label="Chapters">
    {chapters.map((chapter) => <div key={chapter.numeral} className={`chapter-chip ${chapter.status}`}>
      <span className="chapter-numeral">{chapter.numeral}</span>
      <span className="chapter-copy"><b>{chapter.name}</b><small>{chapter.status === 'playable' ? `Playable · ${found.length}/2 endings found` : chapter.status === 'soon' ? 'In the forge · coming soon' : 'Sealed'}</small></span>
      {chapter.status !== 'playable' && <i className="chapter-lock" aria-hidden="true">◆</i>}
    </div>)}
  </div>;
}

/** The Chapter II reveal shown on the Chapter I ending, plus a nudge toward the ending not yet found. */
export function ChapterTeaser({ game }: { game: GameState }) {
  const ending = game.chapter.ending;
  const [found, setFound] = useState<Ending[]>(loadEndings);
  useEffect(() => { if (ending) { recordEnding(ending); setFound(loadEndings()); } }, [ending]);
  const missing = (['truth', 'steel'] as Ending[]).find((item) => !found.includes(item));
  return <div className="chapter-teaser" role="region" aria-label="Coming next">
    <div className="teaser-art" style={{ backgroundImage: `url(${refs.rider})` }} aria-hidden="true"><span>Chapter II</span></div>
    <div className="teaser-copy">
      <p className="teaser-kicker">Coming next · In the forge</p>
      <h2>The Northern Warning</h2>
      <p>Frostmere’s beacons have gone dark. A rider in weathered black armour was seen on the ice road, and the Northern Lord has stopped answering ravens.</p>
      <ul><li>Unlock Frostmere Hold and the frozen north</li><li>Siege battles on the frontier walls</li><li>Your evidence and lives carry forward</li></ul>
      <p className="teaser-endings">Endings found <b>{found.length}/2</b>{missing ? <> · Still hidden: <em>{endingNames[missing]}</em>. {endingHints[missing]}</> : ' · Every ending of Chapter I discovered.'}</p>
    </div>
  </div>;
}

const sealed: Record<string, { chapter: string; title: string; text: string; art: string }> = {
  northhold: { chapter: 'Chapter II', title: 'The Northern Warning', text: 'Frostmere’s gates are barred and its beacons cold. Something rides the ice road at night. This hold opens in the next chapter.', art: refs.rider },
  shrine: { chapter: 'Chapter III', title: 'Fire Beyond the Crown', text: 'Old testimony speaks of a queen who rides on wings of flame. The shrine keepers will say no more until the third chapter.', art: refs.dragonQueen },
};

/** A sealed-region card for map locations whose story belongs to a later chapter. */
export function SealedRegion({ locationId }: { locationId: string }) {
  const region = sealed[locationId];
  if (!region) return null;
  return <div className="sealed-region" style={{ backgroundImage: `linear-gradient(90deg,#0d0d0bf2 45%,#0d0d0b99),url(${region.art})` }}>
    <span>◆ Sealed · {region.chapter}</span>
    <b>{region.title}</b>
    <p>{region.text}</p>
  </div>;
}
