# Development progress

Updated: 11 October 2026

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

## Checks performed

- `npm.cmd run typecheck` — passed.
- `npm.cmd test` — 6 tests passed. Coverage includes insufficient resources, action consumption, construction resolution, both ending strategies, deterministic tactical resolution, exact-once life loss, retained evidence after rewind, and save validation/round-trip.
- `npm.cmd run build` — passed. Production output: roughly 254 kB JavaScript and 16 kB CSS before gzip.
- Rendered the title screen in headless Chrome at 1440 × 1000 and 390 × 844. The supplied crowned-ruler image remains recognisable and uncropped at desktop; a narrow-width text overflow found during this check was corrected.
- Attempted live browser automation, but no Chrome or in-app browser surface was exposed to the computer-use tool. No external human playtest is claimed.

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
