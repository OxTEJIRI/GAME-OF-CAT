import type { TutorialState, TutorialStep } from '../services/tutorial';

export type TutorialControls = { state: TutorialState; complete(step: Exclude<TutorialStep, 'complete'>): void; skip(): void };

export function TutorialCallout({ title, className = '', onSkip, onNext, children }: { title: string; className?: string; onSkip(): void; onNext?: () => void; children: React.ReactNode }) {
  return <aside className={`tutorial-callout ${className}`} role="status" aria-live="polite"><span className="tutorial-step">Guided opening</span><b>{title}</b><p>{children}</p><div>{onNext && <button className="primary" onClick={onNext}>Next</button>}<button className="tutorial-skip" onClick={onSkip}>Skip tutorial</button></div></aside>;
}
