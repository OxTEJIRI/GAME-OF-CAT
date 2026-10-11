export type ResourceKey = 'gold' | 'food' | 'materials';
export type BuildingId = 'keep' | 'barracks' | 'granary' | 'gate';
export type UnitType = 'infantry' | 'archers' | 'cavalry';
export type Screen = 'menu' | 'funeral' | 'kingdom' | 'council' | 'map' | 'journal' | 'battle' | 'death' | 'ending';

export type Evidence = {
  id: string;
  title: string;
  observation: string;
  source: string;
  kind: 'confirmed' | 'suspicion';
};

export type Project = { building: BuildingId; completesOn: number };
export type BattleReport = { battleId: number; result: 'victory' | 'retreat' | 'defeat'; survivors: Record<UnitType, number>; casualties: Record<UnitType, number>; deployed: Record<UnitType, number>; reserves: Record<UnitType, number>; ticks: number };

export type ChapterState = {
  chapterId: 'missing-seal';
  turn: number;
  actions: number;
  resources: Record<ResourceKey, number>;
  publicOrder: number;
  buildingLevels: Record<BuildingId, number>;
  projects: Project[];
  army: Record<UnitType, number>;
  armyLocation: string;
  armyDestination?: string;
  armyArrivesOn?: number;
  selectedLocation: string;
  scoutedLocations: string[];
  trust: Record<'queen' | 'northernLord' | 'steward', number>;
  flags: Record<string, boolean>;
  councilResolvedTurn: number;
  battleResult?: 'victory' | 'retreat' | 'defeat';
  battleAttempts: number;
  lastBattle?: BattleReport;
  ending?: 'steel' | 'truth';
  log: string[];
};

export type PersistentState = {
  livesRemaining: number;
  evidence: Evidence[];
  seenScenes: string[];
  completedChapters: string[];
  difficulty: 'story' | 'standard';
};

export type GameState = {
  version: 1;
  runId: string;
  screen: Screen;
  persistent: PersistentState;
  checkpoint: ChapterState;
  chapter: ChapterState;
  processedOutcomeIds: string[];
  notice?: string;
};
