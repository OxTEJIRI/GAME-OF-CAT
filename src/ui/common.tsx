import type { TutorialState, TutorialStep } from '../services/tutorial';

export type TutorialControls = { state: TutorialState; complete(step: Exclude<TutorialStep, 'complete'>): void; skip(): void };
