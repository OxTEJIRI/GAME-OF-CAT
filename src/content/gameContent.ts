import type { BuildingId, Evidence, UnitType } from '../game/types';
import rulerPair from '../../docs/references/crowned-ruler-and-royal-cat.png?url';
import queenCloseup from '../../docs/references/royal-cat-closeup.png?url';
import northernLord from '../../docs/references/northern-lord-closeup.png?url';
import bovineCourt from '../../docs/references/bovine-court-figure.png?url';
import snowRider from '../../docs/references/snow-rider.png?url';

export const refs = {
  ruler: rulerPair,
  queen: queenCloseup,
  north: northernLord,
  steward: bovineCourt,
  rider: snowRider,
};

export const characters = {
  ruler: { label: 'Crowned ruler', role: 'Player sovereign', verified: false },
  queen: { label: 'Royal cat / Queen candidate', role: 'Palace influence', verified: false },
  north: { label: 'Northern Lord candidate', role: 'Frontier commander', verified: false },
  steward: { label: 'Bovine court figure', role: 'Acting royal steward', verified: false },
};

export const buildings: Record<BuildingId, { name: string; purpose: string; baseCost: { gold: number; materials: number } }> = {
  keep: { name: 'Crown Keep', purpose: 'Palace security and public order', baseCost: { gold: 24, materials: 8 } },
  barracks: { name: 'Ash Barracks', purpose: 'Recruit and harden squads', baseCost: { gold: 22, materials: 7 } },
  granary: { name: 'River Granary', purpose: 'Increase food income', baseCost: { gold: 16, materials: 9 } },
  gate: { name: 'Lion Gate', purpose: 'Protect the capital from assault', baseCost: { gold: 18, materials: 12 } },
};

export const units: Record<UnitType, { name: string; cost: { gold: number; food: number }; note: string }> = {
  infantry: { name: 'Infantry', cost: { gold: 14, food: 2 }, note: 'Holds ground; can brace.' },
  archers: { name: 'Archers', cost: { gold: 18, food: 2 }, note: 'Strong from protected high ground.' },
  cavalry: { name: 'Cavalry', cost: { gold: 24, food: 3 }, note: 'Fast flanking charge; fragile when pinned.' },
};

export const evidenceCatalog: Record<string, Evidence> = {
  'ledger-gap': { id: 'ledger-gap', title: 'The empty ledger line', observation: 'A palace payment was scraped away beside the seal-keeper\'s account.', source: 'Royal accounts audit', kind: 'confirmed' },
  'pass-orders': { id: 'pass-orders', title: 'Counterfeit pass orders', observation: 'Raiders carried orders impressed with a flawed copy of the missing royal seal.', source: 'Greyfen battlefield', kind: 'confirmed' },
  'perfumed-letter': { id: 'perfumed-letter', title: 'Perfumed warning', observation: 'The assassin carried a letter scented with cedar oil used in the west archive.', source: 'Learned in a lost life', kind: 'confirmed' },
  'wax-fragment': { id: 'wax-fragment', title: 'Blue wax fragment', observation: 'A fragment near the old watch road does not match the crown\'s red sealing wax.', source: 'Watchtower scouts', kind: 'suspicion' },
};

export const locations = [
  { id: 'capital', name: 'Crownrest', x: 48, y: 67, benefit: 'Seat of rule', threat: 'Palace unrest', connected: ['orchard', 'watchtower'] },
  { id: 'orchard', name: 'Miller\'s Orchard', x: 22, y: 76, benefit: '+2 food after aid', threat: 'Hungry villagers', connected: ['capital', 'shrine'] },
  { id: 'watchtower', name: 'Crow Watch', x: 62, y: 46, benefit: 'Reveals pass defenders', threat: 'Abandoned signal fires', connected: ['capital', 'pass'] },
  { id: 'pass', name: 'Greyfen Pass', x: 78, y: 25, benefit: 'Secures northern road', threat: 'Raiders and false orders', connected: ['watchtower', 'northhold'] },
  { id: 'northhold', name: 'Frostmere Hold', x: 56, y: 10, benefit: 'Northern alliance', threat: 'Distant riders', connected: ['pass'] },
  { id: 'shrine', name: 'Ninefold Shrine', x: 10, y: 45, benefit: 'Old testimony', threat: 'Unknown', connected: ['orchard'] },
];
