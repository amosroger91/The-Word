import type { Language, WordApp } from '@the-word/core';
import { BADGES, localized, progressToward, type EarnedBadge } from './badges';
import type { LedgerEvent } from './ledger';

export function ProgressPanel({
  label,
  language,
  chapters,
  streak,
  events,
  earned,
}: {
  label: WordApp['label'];
  language: Language;
  chapters: number;
  streak: number;
  events: LedgerEvent[];
  earned: EarnedBadge[];
}) {
  const earnedIds = new Set(earned.map((badge) => badge.id));
  const locked = BADGES.filter((badge) => !earnedIds.has(badge.id));

  return (
    <div className="progress-panel">
      <span className="workspace-eyebrow">{label.progress}</span>
      <h2>{streak ? label.streakCount(streak) : label.progress}</h2>
      <p>{label.chaptersReadCount(chapters)}. {label.progressHint}</p>
      {earned.length ? (
        <div className="badge-block">
          <span className="section-label">{label.earnedBadges}</span>
          <ul className="badge-grid">
            {earned.map((badge) => (
              <li key={badge.id} className={`badge-card earned tier-${badge.definition.tier ?? 'bronze'}`}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={badge.definition.icon} /></svg>
                <strong>{localized(badge.definition.title, language)}</strong>
                <small>{localized(badge.definition.description, language)}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="muted">{label.noBadgesYet}</p>}
      {locked.length ? (
        <div className="badge-block">
          <span className="section-label">{label.lockedBadges}</span>
          <ul className="badge-grid">
            {locked.map((badge) => {
              const progress = progressToward(badge, events);
              return (
                <li key={badge.id} className="badge-card locked">
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={badge.icon} /></svg>
                  <strong>{localized(badge.title, language)}</strong>
                  <small>{localized(badge.description, language)}</small>
                  <span className="badge-meter">{label.badgeProgress(progress.have, progress.need)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
