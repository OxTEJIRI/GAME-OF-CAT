export type TutorialStep = 'kingdom' | 'council' | 'region' | 'march' | 'advance' | 'deployment' | 'battle' | 'aftermath' | 'complete';

export type TutorialState = {
  active: boolean;
  step: TutorialStep;
  completed: boolean;
};

const STORAGE_KEY = 'game-of-cat-tutorial-v1';
const steps: TutorialStep[] = ['kingdom', 'council', 'region', 'march', 'advance', 'deployment', 'battle', 'aftermath', 'complete'];
const initial: TutorialState = { active: true, step: 'kingdom', completed: false };

export function loadTutorial(): TutorialState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<TutorialState> | null;
    if (!parsed || typeof parsed.active !== 'boolean' || !steps.includes(parsed.step as TutorialStep)) return initial;
    return { active: parsed.active, step: parsed.step as TutorialStep, completed: !!parsed.completed };
  } catch { return initial; }
}

export function saveTutorial(state: TutorialState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Campaign saving remains independent. */ }
}

export function completeTutorialStep(state: TutorialState, completedStep: Exclude<TutorialStep, 'complete'>): TutorialState {
  if (!state.active || state.step === 'complete') return state;
  const currentIndex = steps.indexOf(state.step);
  const completedIndex = steps.indexOf(completedStep);
  if (completedIndex < currentIndex) return state;
  const next = steps[Math.min(completedIndex + 1, steps.length - 1)];
  return next === 'complete' ? { active: false, step: 'complete', completed: true } : { active: true, step: next, completed: false };
}

export const skipTutorial = (): TutorialState => ({ active: false, step: 'complete', completed: true });
export const replayTutorial = (): TutorialState => ({ ...initial });
