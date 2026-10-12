# Phase 4 asset checklist

Updated: 12 October 2026

## In the playable build

| Asset | Runtime use | Source and status |
| --- | --- | --- |
| Crowned ruler and royal cat | Title, prologue, steel ending | Supplied `docs/references/` frame; reference identity is faithful, character names remain provisional |
| Royal cat close-up | Council portrait | Supplied reference frame; approved for direct prototype use, not a new expression sheet |
| Northern Lord close-up | Greyfen deployment commander portrait | Supplied reference frame; approved for direct prototype use, not a rigged commander |
| Bovine court figure | Truth ending | Supplied reference frame; provisional role |
| Snow rider | Death and rewind | Supplied reference frame; provisional role |
| Crownrest Citadel | Kingdom environment plate | Generated with the built-in image tool for this project; integrated with CSS banners, guards, smoke, firelight, and construction overlays |
| Greyfen Pass | Tactical battlefield plate | Generated with the built-in image tool for this project; integrated with three readable lanes, snow, projectiles, and combat motion |
| Crown Guard squad | Generic infantry, archer, and cavalry source art | Generated with the built-in image tool; generic troops only, not a named-character likeness or final animation atlas |
| Greyfen 3D combatants and field | Individual Crown/raider infantry, archers, cavalry on armored horses, snowy lanes, ridge outpost, tents, standards, and non-combat dragon fly-by | Original hand-authored low-poly Three.js meshes in `src/ui/Battlefield3D.tsx`; stylized prototype geometry with procedural pose motion, not production sculpt/rig/texture artwork |
| Theme music | Continuous looping background theme | User-supplied MP3 attachment; controlled separately in Settings; distribution rights not specified |
| Funeral scene video | Slow, muted looping scene on title and Prologue pages | User-supplied local MP4, reused for both screens; poster remains as a loading and reduced-motion fallback |
| Seven Kingdoms atlas | Seven selectable realm markers and illustrated terrain, roads, rivers, settlements, forests, and frontier mountains | Original hand-authored SVG; drifting ship and route animation; reduced-motion safe |
| Banner certificate | Personalized pledge preview and downloadable certificate | Original generated SVG markup in the interface; name and realm are escaped before download |
| Ambience and cues | Menu/castle/council/map/battle tone plus UI, charge, Rally, victory, and defeat cues | Original Web Audio synthesis; no third-party recording or trailer audio |

## Still needed for production

- Approved neutral and expressive portrait adaptations for the ruler, Queen candidate, Northern Lord, and bovine council figure. Each must be compared against face shape, markings, eyes, hair, crown, jewellery, and costume in the supplied frames.
- True transparent, separated infantry, archer, cavalry, and raider atlases with idle, move, attack, hurt, routed, and defeated frames. The current generated squad image is a coherent generic prototype source, not a finished animation atlas.
- Production-quality 3D character sculpts, UV/material treatment, skeletal rigs, authored idle/walk/attack/hurt/rout/fall animation clips, and differentiated faction armor for each troop role. Current battlefield meshes intentionally read as stylized low-poly prototype fighters rather than finished character art.
- Detailed dragon sculpt, wing rig, material work, and optional ambience cue. Current dragon is a presentation-only procedural mesh and timed fly-by; it has no gameplay interaction.
- Low-end GPU profiling, responsive model LODs, WebGL-disabled browser QA, and comparison against the supplied named-character references before any commander is represented in 3D.
- Castle building plates or masks for distinct level 1, 2, 3, damaged, and rebuilding states. The current runtime communicates construction with scaffolding and completed levels through labels and lighting.
- A production regional map. The current map remains a clearly stylised interactive development map.
- Council chamber and ending environment plates beyond the supplied character frames.
- Authored impact, dust, fire, snow, Rally, and banner atlases for lower-end hardware.
- Confirm rights for distributing the user-supplied theme MP3 before public production release. Mastered recorded effects remain outstanding; current ambience and cues are original synthesis.
- Voice acting, subtitles for voiced lines, and localization recordings after names and scripts are approved.

## Generation prompts used

The built-in image tool was used for three project assets:

1. A 16:9 elevated Crownrest Citadel with four readable districts, cold mountain light, burgundy banners, restrained gold, and warm working fires.
2. A 16:9 side-on Greyfen Pass with distinct high-ground, central-road, and open-flank lanes under winter light.
3. A generic royal cat squad containing shield infantry, a longbow archer, and mounted cavalry in burgundy and weathered steel.

All generated assets exclude named character claims, text, external logos, and trailer audio.
