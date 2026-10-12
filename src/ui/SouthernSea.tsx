import { useEffect, useState } from 'react';
import './southern-sea.css';

/* An animated layer for the southern waters of the Seven Kingdoms map. It shares the map art's 1000×650
   coordinate space, so boats, waves, and the lighthouse line up with the painted coast, and everything is
   clipped to open water so nothing ever sails across the island. */

/** The island outline from seven-kingdoms-map.svg; the sea is the map rectangle minus this shape. */
export const COAST = 'M340 29 410 39l46-19 41 25 62-8 49 32 42-7 26 38 49 12 11 40 40 8 6 35 47 15-7 41 52 27-13 39 48 22-31 36-46 9-12 35-53 10-3 49-42 28-28 44-58-8-31 38-46-12-31 32-52-26-50 13-21-39-44-2-18-42-35 5-18-39-42 8-23-37-48-13 4-39-36-27 17-39-30-31 15-36 29-9-9-37 34-22 1-38 42-9z';

/** Boat routes, in map units, with the waterline on the path. Checked to keep every hull clear of the coast. */
export const SEA_ROUTES = {
  cog: 'M1060 590 C930 586 800 628 690 630 S520 642 440 634 S300 618 220 612 S60 604 -60 612',
  longship: 'M-70 498 C10 486 120 492 180 520 S236 586 300 616 S410 652 470 680',
  skiff: 'M752 532 C776 520 820 520 842 534 S822 556 790 552 S744 548 752 532',
  gulls: 'M-40 470 C140 430 300 520 470 640 S760 540 1060 470',
};

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Follow a route forever unless the viewer prefers reduced motion, in which case hold a still pose. */
function Voyage({ path, duration, offset = 0, still, stillAt, children }: { path: string; duration: number; offset?: number; still: boolean; stillAt: [number, number]; children: React.ReactNode }) {
  if (still) return <g transform={`translate(${stillAt[0]} ${stillAt[1]})`}>{children}</g>;
  return <g><animateMotion path={path} dur={`${duration}s`} begin={`${-offset}s`} repeatCount="indefinite" rotate="0" calcMode="paced" />{children}</g>;
}

const Wake = ({ length = 34 }: { length?: number }) => <g className="sea-wake" fill="none" stroke="#e9f2ea" strokeLinecap="round">
  <path d={`M-${length * 0.75} 1q-${length * 0.4} 1-${length} 0`} strokeWidth="1.6" />
  <path d={`M-${length * 0.7} 4q-${length * 0.35} 4-${length * 0.85} 8`} strokeWidth="1.1" />
</g>;

/** A merchant cog: round hull, striped square sail, and a red pennant. Faces east; flipped when sailing west. */
const Cog = () => <g className="sea-bob">
  <Wake length={38} />
  <path d="M0-3V-38" stroke="#3b2a1b" strokeWidth="2" />
  <path className="sea-sail" d="M-14-35h28v19q-14 6-28 0z" fill="#efe3c3" stroke="#6b5532" strokeWidth="1" />
  <path d="M-14-29h28v5h-28z" fill="#c4574f" opacity=".85" />
  <path className="sea-pennant" d="M0-38l13 3-13 3z" fill="#c4574f" />
  <path d="M-26-4h52l-6 10h-40z" fill="#5b3d26" stroke="#2c1e12" strokeWidth="1.2" />
  <path d="M-23 0h46" stroke="#c6a66b" strokeWidth="1" opacity=".8" />
</g>;

/** A northern longship with a striped sail, shield row, and rowing oars. Faces east. */
const Longship = () => <g className="sea-bob slow">
  <Wake length={44} />
  <path d="M-2-4V-34" stroke="#3b2a1b" strokeWidth="2" />
  <path className="sea-sail" d="M-17-31h30v20q-15 5-30 0z" fill="#e6d6ad" stroke="#5b4a2c" strokeWidth="1" />
  <path d="M-11-31h6v22h-6zM1-31h6v24h-6z" fill="#3f6f73" opacity=".85" />
  <g className="sea-oars" stroke="#d9c79c" strokeWidth="1.3"><path d="M-18 1l-6 9M-8 1l-6 9M2 1l-6 9M12 1l-6 9" /></g>
  <path d="M-34-12q2 8 8 9h46q8-1 12-11l4 1q-2 13-14 16h-48q-12-3-11-15z" fill="#4a3324" stroke="#24180f" strokeWidth="1.2" />
  <g fill="#c6a66b" stroke="#24180f" strokeWidth=".8"><circle cx="-18" cy="-4" r="3" /><circle cx="-9" cy="-4" r="3" /><circle cx="0" cy="-4" r="3" /><circle cx="9" cy="-4" r="3" /></g>
</g>;

/** A small fishing skiff with a lateen sail and a cat at the tiller. Faces east. */
const Skiff = () => <g className="sea-bob quick">
  <Wake length={20} />
  <path d="M-2-2V-24" stroke="#3b2a1b" strokeWidth="1.5" />
  <path className="sea-sail" d="M-2-24l15 20h-15z" fill="#f1e6c8" stroke="#6b5532" strokeWidth=".9" />
  <circle cx="-9" cy="-7" r="3.2" fill="#d08a4a" /><path d="M-11.5-9.5l1-3 1.8 2.2M-8-10l1.6-2.6.8 2.8" fill="#d08a4a" />
  <path d="M-15-2h28l-5 7h-19z" fill="#6b4a30" stroke="#2c1e12" strokeWidth="1" />
</g>;

const Gull = ({ x = 0, y = 0, delay = 0 }: { x?: number; y?: number; delay?: number }) => <g transform={`translate(${x} ${y})`}><path className="sea-gull" style={{ animationDelay: `${delay}s` }} d="M-7 0q3.5-5 7 0q3.5-5 7 0" fill="none" stroke="#f3ead2" strokeWidth="1.6" strokeLinecap="round" /></g>;

const Sparkle = ({ x, y, delay }: { x: number; y: number; delay: number }) => <g transform={`translate(${x} ${y})`}><path className="sea-sparkle" style={{ animationDelay: `${delay}s` }} d="M0-6 1.2-1.2 6 0 1.2 1.2 0 6-1.2 1.2-6 0-1.2-1.2z" fill="#fff3cf" /></g>;

/** One row of engraved wave crests that drifts sideways forever; its pattern repeats every 80 units. */
const WaveRow = ({ y, opacity, reverse, speed }: { y: number; opacity: number; reverse?: boolean; speed: number }) => {
  let d = `M-160 ${y}`;
  for (let x = -160; x < 1160; x += 80) d += ` q20 -7 40 0 t40 0`;
  return <path className={`sea-wave ${reverse ? 'reverse' : ''}`} style={{ animationDuration: `${speed}s` }} d={d} fill="none" stroke="#bcd6cf" strokeOpacity={opacity} strokeWidth="1.6" strokeDasharray="26 54" strokeLinecap="round" />;
};

export function SouthernSea() {
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const narrow = useMedia('(max-width:560px)');
  return <svg className="southern-sea" viewBox="0 0 1000 650" preserveAspectRatio={narrow ? 'none' : 'xMidYMid slice'} aria-hidden="true">
    <defs>
      <clipPath id="open-sea"><path clipRule="evenodd" d={`M0 0H1000V650H0Z${COAST}`} /></clipPath>
      <linearGradient id="deep-south" x1="0" y1="0" x2="0" y2="1"><stop offset=".62" stopColor="#0f2a33" stopOpacity="0" /><stop offset="1" stopColor="#0b1f27" stopOpacity=".55" /></linearGradient>
      <linearGradient id="sun-path" x1="0" x2="1"><stop offset="0" stopColor="#f0d897" stopOpacity="0" /><stop offset=".5" stopColor="#f0d897" stopOpacity=".28" /><stop offset="1" stopColor="#f0d897" stopOpacity="0" /></linearGradient>
      <radialGradient id="lamp-glow"><stop offset="0" stopColor="#fff1c2" stopOpacity=".95" /><stop offset=".4" stopColor="#f5cf7a" stopOpacity=".45" /><stop offset="1" stopColor="#f5cf7a" stopOpacity="0" /></radialGradient>
      <linearGradient id="beam" x1="0" x2="1"><stop offset="0" stopColor="#ffe9a8" stopOpacity=".55" /><stop offset="1" stopColor="#ffe9a8" stopOpacity="0" /></linearGradient>
    </defs>

    <g clipPath="url(#open-sea)">
      <rect y="380" width="1000" height="270" fill="url(#deep-south)" />
      <rect className="sea-sun-path" x="-200" y="596" width="700" height="34" fill="url(#sun-path)" />
      <g className="sea-waves">
        <WaveRow y={470} opacity={0.18} speed={9} />
        <WaveRow y={498} opacity={0.22} speed={11} reverse />
        <WaveRow y={526} opacity={0.26} speed={8} />
        <WaveRow y={554} opacity={0.3} speed={10} reverse />
        <WaveRow y={582} opacity={0.34} speed={7} />
        <WaveRow y={610} opacity={0.38} speed={9} reverse />
        <WaveRow y={638} opacity={0.42} speed={6} />
      </g>
      {[[330, 600, 0], [760, 604, 1.3], [606, 636, 2.1], [975, 488, .7], [46, 520, 2.8], [262, 640, 1.8], [880, 626, 3.4]].map(([x, y, delay]) => <Sparkle key={`${x}-${y}`} x={x} y={y} delay={delay} />)}

      {/* The lighthouse beam sweeps the water only, never the land. */}
      <g transform="translate(58 596)"><g className="sea-beam">
        {!still && <animateTransform attributeName="transform" type="rotate" from="0 0 -33" to="360 0 -33" dur="9s" repeatCount="indefinite" />}
        <path d="M0-33 220-72v78z" fill="url(#beam)" /><path d="M0-33 220-72v78z" fill="url(#beam)" transform="rotate(180 0 -33)" opacity=".55" />
      </g></g>

      {/* The whale of Stormwater Bay surfaces now and then. */}
      <g transform="translate(958 602)"><g className="sea-whale">
        <path d="M-26 0q22-15 48-2l6-6 3 3-5 6q-24 7-52-1z" fill="#1d3a42" stroke="#0f2228" strokeWidth="1.2" />
        <g className="sea-spout" fill="#e7f1ee"><circle cx="-14" cy="-14" r="2.4" /><circle cx="-18" cy="-20" r="1.8" /><circle cx="-10" cy="-21" r="1.8" /><circle cx="-14" cy="-26" r="1.4" /></g>
      </g></g>

      <Voyage path={SEA_ROUTES.skiff} duration={26} still={still} stillAt={[792, 538]}><g transform="scale(.9)"><Skiff /></g></Voyage>
      <Voyage path={SEA_ROUTES.longship} duration={48} offset={14} still={still} stillAt={[140, 500]}><g transform="scale(.82)"><Longship /></g></Voyage>
      <Voyage path={SEA_ROUTES.cog} duration={70} offset={22} still={still} stillAt={[620, 632]}><g transform="scale(-.78 .78)"><Cog /></g></Voyage>
      <Voyage path={SEA_ROUTES.cog} duration={70} offset={57} still={still} stillAt={[300, 616]}><g transform="scale(-.6 .6)"><Cog /></g></Voyage>
    </g>

    {/* Lighthouse on the south-west rocks; its beam is drawn inside the water clip above. */}
    <g className="sea-lighthouse" transform="translate(58 596)">
      <path d="M-46 48q8-30 30-34 16-10 34-2 22 2 34 36z" fill="#3e3b31" stroke="#24221c" strokeWidth="1.2" />
      <path d="M-8 14l4-44h8l4 44z" fill="#ede1c3" stroke="#3a3426" strokeWidth="1.2" />
      <path d="M-6.5 0h13l.6-7h-14.2zM-5.3-14h10.6l.5-7H-5.8z" fill="#c4574f" />
      <path d="M-7-30h14v-6H-7z" fill="#2f2a20" /><path d="M-6-36h12l-6-7z" fill="#c4574f" />
      <circle className="sea-lamp" cy="-33" r="14" fill="url(#lamp-glow)" />
    </g>

    {/* Gulls wheel over the southern waters. */}
    {still ? <g transform="translate(520 486)"><Gull /><Gull x={18} y={-8} delay={.3} /></g> : <g><animateMotion path={SEA_ROUTES.gulls} dur="34s" repeatCount="indefinite" rotate="0" calcMode="paced" /><Gull /><Gull x={18} y={-8} delay={.3} /><Gull x={-14} y={-14} delay={.6} /></g>}

    {/* Cartouche for the sea's name. */}
    <g className="sea-cartouche" transform="translate(212 560)">
      <path d="M-112 -4l-14-12h22zM112-4l14-12h-22zM-112-4l-14 12h22zM112-4l14 12h-22z" fill="#a98b55" stroke="#5c4a2b" strokeWidth="1" />
      <path d="M-104-15h208q-6 15 0 30h-208q6-15 0-30z" fill="#e7d7ae" stroke="#5c4a2b" strokeWidth="1.4" />
      <path d="M-96-10h192M-96 10h192" stroke="#a98b55" strokeWidth=".8" />
      <text y="5.5" textAnchor="middle" fill="#25363a" fontFamily="Georgia, serif" fontSize="16" fontStyle="italic" letterSpacing="1.5">The Southern Sea</text>
      <path d="M-82 0h-8m180 0h-8" stroke="#6e2433" strokeWidth="1.4" />
    </g>
  </svg>;
}
