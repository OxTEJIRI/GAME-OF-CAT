# Development progress

Updated: 12 October 2026

## Phase 4 started: cinematic first-chapter presentation

- Audited all supplied reference frames and recorded a production boundary in `docs/asset-checklist.md`. Named-character screens continue to use the supplied ruler, royal cat, Northern Lord, bovine court figure, and snow rider frames directly; no generated image is presented as an approved named-character likeness.
- Added a generated Crownrest Citadel environment plate with four spatially readable districts. Runtime smoke, burgundy banners, moving wall guards, warm working fires, level labels, and per-project scaffolding make the castle respond visibly to campaign state.
- Added stronger kingdom feedback through selected-building emphasis, construction state, audible confirmations, persistent notice banners, and turn-resolution changes while preserving the existing two-action economy.
- Added a generated Greyfen Pass plate with distinct high-ground, central-road, and open-flank routes. Deterministic combat positions now interpolate into visible movement; archers fire projectiles, cavalry charge, squads march, route, fall, and retreat, and snow crosses the field.
- Rebuilt the battle presentation around readable deployment roles, an explicit objective, field/reserve counts, selected-squad order, health, morale, pause state, Rally cooldown, casualty preview, and commander portrait from the supplied Northern Lord reference.
- Kept `src/game/combat.ts` authoritative. The animated layer consumes deterministic ticks and does not add frame state to saves. Phaser was not added for this first scene pair because the isolated React/CSS presentation meets the current animation needs without changing tested battle outcomes; the seam remains available if later atlas/particle complexity warrants Phaser.
- Added the user-supplied looping theme MP3 with its own Background music toggle, alongside original synthesized ambience and effects. Music preference is separate from global mute and campaign saves; browser playback starts after the first user interaction.
- Reused the supplied funeral footage as a full-viewport background video on both the title and Prologue pages. The Prologue uses a slow (0.72×), muted, inline loop with a dark text-side gradient; the story copy and crown action remain accessible. Reduced-motion preference pauses the footage and changing back to full motion resumes it. Removed the provisional “working title” label from the Prologue.
- Added two new pages directly after TITLE in the page navigator and new-campaign flow: a seven-realm illustrated atlas with selectable markers and full-name list, followed by a personalized, downloadable banner certificate. The title's Next page and page list now expose both pages before the prologue; the New campaign shortcut opens the atlas directly. The pledge is a keepsake only and is intentionally not added to campaign state or mechanics.
- Strengthened the opening path from funeral to castle instructions, council preparation, march, deployment objective, and first battle. Chapter II remains out of scope and locked.
- Added project assets under `public/assets/environments/` and `public/assets/troops/`, documented prompts and approval status, and expanded `docs/asset-manifest.json` with provenance, dimensions, runtime states, and limitations.

## Phase 4 verification

- `npm.cmd run typecheck` passed.
- `npm.cmd test` passed all 22 deterministic rules tests; campaign economy, outcomes, evidence, saves, death, rewind, and battle results are unchanged.
- Targeted `tests/browser/allegiance.spec.ts` passed all four desktop, phone, mouse, keyboard, and certificate flows. The title's Next-page navigation and page list were verified to show Allegiance and Your banner directly after TITLE.
- `tests/browser/prologue-video.spec.ts` passed desktop and phone checks for full-viewport video bounds, playback/loop settings, reduced-motion pause/resume, readable story controls, and removal of “working title.”
- Latest full `npm.cmd run test:e2e` run: 12 of 14 flows passed. The defence-strategy victory timeout and setup music pause assertion failed under the full-suite run, then both passed when rerun individually (2/2). Treat these as load-sensitive/flaky verification and rerun the full suite in a stable browser environment before release.
- `npm.cmd run build` passed after the full-bleed Prologue update. Application code is roughly 315 kB JavaScript and 88 kB CSS before gzip; the first-chapter image payload is larger and is tracked below.
- Reviewed `test-results/phase4-castle-desktop.png`, `phase4-castle-phone.png`, `phase4-battle-desktop.png`, and `phase4-battle-phone.png`. At 1440×1000 and 390×844, core controls remain visible, three battle lanes remain distinguishable, touch targets are usable, and no horizontal layout overflow was observed.
- No external human playtest or physical-device touch test is claimed.

## 3D battlefield presentation pass

- Replaced the flat battle plate presentation with an original Three.js battlefield diorama: snow-cut high ground, a central stone road, open flank, lane edging, ridge pines, outpost, tents, scattered stonework, winter fog, directional light, and Crown/raider banners.
- Added individual feline infantry, bow troops, and mounted cavalry as low-poly 3D mesh characters, with recognizable cat ears, muzzles, eyes, whiskers, armor, tabards, shields, blades, bows, quivers, and a barded horse. The models face their opposing side; the presentation smoothly follows deterministic combat positions and lane changes, bobs while advancing, animates weapon action, and lowers defeated/routed models.
- Added an independent dragon fly-by on a timed loop. It never targets units, emits combat events, changes the campaign, or affects battle outcomes.
- Kept React unit buttons, readable health/morale, selection/target outlines, keyboard/touch orders, and all existing combat/rule resolution. The 3D canvas is presentation-only and lazy-loaded; systems without WebGL retain the playable battlefield controls and fallback presentation.
- Verification on 12 October 2026: `npm.cmd run build` passed; `npm.cmd test` passed all 32 tests; `npm.cmd run test:e2e -- tests/browser/chapter.spec.ts` passed all 4 flows (desktop evidence victory with save/reload, alternate iron-gate victory, phone battle orders, and death/save/rewind).
- Automated browser logs showed no JavaScript errors. One initial canvas-presence timeout showed a false WebGL fallback while the lazy import was still loading; that timing heuristic has been removed. The local embedded browser reported Three.js renderer warnings about its deprecated `Clock` API and shadow-map quality alias, not application errors.

## Remaining 3D limitations

- These fighters and the dragon are hand-authored low-poly procedural meshes made from Three.js geometry, not rigged sculpted production models. Their movement is lightweight procedural pose motion rather than a full skeletal animation set; faces, paws, tack, and cloth need a dedicated artist pass.
- The dragon currently flies a brief pass roughly every 38 seconds and does not interact with combat. Its wings flap, but it has no final texture/material atlas, detailed rig, or audio cue.
- The scene needs profiling and visual review on physical low-end Android/iOS devices, plus browser/GPU coverage for WebGL-disabled systems. The fallback preserves playability but cannot display the 3D models.
- A full production asset atlas remains outstanding for differentiated Crown/raider infantry, archers, cavalry, commanders, rigged animation states, and battlefield effects. Supplied character portraits remain the faithful direct references on their existing story/deployment surfaces; the battlefield fighters are generic troops, not claimed named-character likenesses.
- Three.js increases the lazy battle-scene payload; responsive low-poly LODs, measured frame pacing, and authored sound cues synced to visible sword/arrow actions remain release work.

## Remaining Phase 4 limitations

- The generated Crown Guard composite is coherent generic troop art, not a transparent separated production atlas. A final infantry/archer/cavalry/raider set still needs idle, move, attack, hurt, routed, and defeated frames.
- The Crownlands map uses generated region artwork and explicit route overlays; any paths or settlements painted into the illustration are decorative, not authoritative. The map still needs bespoke production terrain art and image-size optimization. Castle level changes currently use labels, lighting, and scaffolding; unique level/damage building plates are still missing.
- Supplied named-character frames are faithful direct references, but approved neutral/expression adaptations and rigged named commanders remain missing production assets.
- Theme playback uses the user-supplied MP3; public distribution rights have not been confirmed. Ambience and action cues are original Web Audio synthesis; recorded effects and voice acting are still absent.
- The allegiances are original story flavour and do not change Chapter I campaign rules. The map and certificate are crisp vector illustrations, not hand-painted or printed production artwork.
- The three new generated PNGs total about 9 MB uncompressed on disk. Responsive derivatives, WebP/AVIF conversion, atlases, and measured low-end frame pacing remain release work.

## Completed: phases 0–3

- Inspected the empty repository, `DESIGN.md`, and all nine supplied reference images.
- Updated `DESIGN.md` to use the images in their existing `docs/references/` location. No reference images were moved.
- Established a TypeScript, React, Vite, and Vitest project with local development, type-check, test, and production-build commands.
- Added a playable Chapter I, **The Missing Seal** (working title), from funeral opening through two chapter endings.
- Built the kingdom screen with gold, food, materials, public order, two actions per turn, four upgradeable buildings, queued one-turn construction, projected income, upkeep, and infantry/archer/cavalry recruitment.
- Built council scenes with turn-limited rulings, visible costs, trust consequences, a ledger investigation, palace defence, northern supply, and a retained-knowledge courier option after rewind.
- Built a six-location regional map with connected routes, scouting, food-consuming army movement, location intelligence, and entry into Greyfen Pass.
- Built a deterministic tactical battlefield with deployment lanes, infantry, archers, cavalry, movement, targeting, health, morale, routing, pause, orders while paused, brace, regroup, retreat, keyboard shortcuts, and the Rally commander ability.
- Connected battle results to campaign state. Victory records counterfeit orders once; defeat kills the ruler; retreat preserves the ruler and removes one infantry squad.
- Built the evidence journal with confirmed/suspicion labels. Evidence and seen scenes persist through rewinds while chapter resources, trust, buildings, and armies reset.
- Implemented nine lives with duplicate-death protection and a death screen that explains cause, retained knowledge, and reset scope.
- Implemented versioned local autosave, Continue, malformed-save handling, and validated JSON export/import.
- Implemented at least two viable chapter solutions: an evidence-led exposure using the audited ledger and pass orders, and a defence-led survival using palace guards, an upgraded gate, and victory at Greyfen. A rewind-only foresight route can also stop the courier.
- Added desktop and small-screen layouts, visible focus states, reduced-motion support, non-colour unit identification, and a bottom navigation pattern on narrow screens.
- Added `docs/asset-manifest.json`. All character names remain explicitly provisional and every CSS environment/unit graphic is labelled as a temporary development asset.

## First-chapter strengthening pass

- Replaced the hidden two-squad-per-type cap with a visible six-squad field limit. Recruitment fills field slots; additional squads become explicit reserves that survive the encounter and replace losses.
- Added reliable melee lane changes, deterministic target tie-breaking, cross-lane archer rules, and a maximum-resolution tick so valid deployments cannot stall indefinitely.
- Added structured battle reports with encounter ID, deployed squads, reserves, survivors, casualties, and duration. Campaign armies now receive actual surviving counts, and the map shows the latest accurate casualty summary.
- Made battle-result application immutable and idempotent. Repeated reports cannot duplicate casualties, rewards, evidence, or deaths.
- Retreat now preserves actual survivors at Crow Watch and supports a later, separately identified rematch. Rewind clears chapter encounter IDs but retains death history and evidence.
- Changed army movement to a free order that spends supply immediately and resolves on the following turn, matching `DESIGN.md`.
- Tightened chapter-ending eligibility: every route requires Greyfen victory in addition to its evidence, fortification, or retained-knowledge condition.
- Hidden tabs now actually pause the combat timer. Keyboard squad selection and order shortcuts are visible; portrait layouts keep touch controls at usable sizes without forcing a desktop-width battlefield.
- Replaced shallow save checks with nested version-1 validation for screens, IDs, resources, ranges, buildings, projects, locations, movement, trust, flags, armies, evidence, battle reports, counters, logs, and outcome IDs. Invalid imports explain the rejected section; corrupt local saves fail safely to the menu. Earlier version-1 saves are migrated to encounter counters and stable outcome IDs before validation.

## Checks performed

- `npm.cmd run typecheck` — passed.
- `npm.cmd test` — 22 targeted rule tests passed. Coverage includes recruitment/deployment/reserves, all 27 lane deployments, lane-changing melee, deterministic identical runs, materially different deployments, casualty carryover, immutability, duplicate battle reports, retreat/rematch, rewind IDs, ending gates, next-turn movement, nested save rejection, legacy-save migration, exact-once life loss, and save round-trip.
- `npm.cmd run test:e2e` — three Chrome flows passed: complete evidence ending with save/reload and visibility pause, complete fortified-gate ending, and portrait battle controls using touch-sized squad/order buttons.
- `npm.cmd run build` — passed. Production output: roughly 254 kB JavaScript and 16 kB CSS before gzip.
- Rendered the title screen in headless Chrome at 1440 × 1000 and 390 × 844. The supplied crowned-ruler image remains recognisable and uncropped at desktop; a narrow-width text overflow found during this check was corrected.
- Automated Chrome playthroughs now cover both viable endings. No external human playtest is claimed.

## Known limitations

- Castle, map, battlefield, and squad markers are honest temporary CSS development visuals. Character reference frames are used directly and are not misrepresented as production sprites.
- Combat is a deterministic React simulation rather than Phaser. The rule/presentation seam is isolated in `src/game/combat.ts`, so Phaser can replace the presentation loop during phase 4 without changing campaign state.
- No production audio, voice acting, final environment art, animated troop sprites, or finished effects are included.
- There is no mid-battle save. Autosave resumes from reproducible battle entry, as allowed by the design.
- Automated rules and rendering checks are complete, but three unfamiliar-player playtests remain outstanding.
- Only Chapter I is implemented. Challenge mode and Chapters II–III remain locked for later phases.

## Next steps: phase 4

1. Run three observed playtests and tune dominant strategies, resource pressure, combat timing, and explanation of losses.
2. Produce approved character adaptations by comparing every named portrait to the supplied references.
3. Replace temporary castle, map, battlefield, and troop graphics with a cohesive production asset set.
4. Add licensed/original ambience, effects, and battle cues with the existing mute setting.
5. Add browser-flow automation when a compatible browser driver is available, then test tablet and phone battle interaction on physical touch devices.
