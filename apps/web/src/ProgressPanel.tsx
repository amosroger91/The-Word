import { BOOKS_DATA } from '@the-word/bible';
import type { Language, WordApp } from '@the-word/core';
import { BADGES, bibleProgress, localized, progressToward, type EarnedBadge } from './badges';
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
  const canon = bibleProgress(events);
  const milestones = BADGES.filter((badge) => !badge.id.startsWith('book-'));
  const earnedMilestones = earned.filter((badge) => !badge.id.startsWith('book-'));
  const lockedMilestones = milestones.filter((badge) => !earnedIds.has(badge.id));

  return (
    <div className="progress-panel">
      <span className="workspace-eyebrow">{label.progress}</span>
      <h2>{streak ? label.streakCount(streak) : label.progress}</h2>
      <p>{label.chaptersReadCount(chapters)}. {label.progressHint}</p>

      <ReadBar label={label.wholeBible} fraction={label.chaptersFraction(canon.all.have, canon.all.need)} percent={canon.all.percent} large />
      <div className="read-bar-row">
        <ReadBar label={label.oldTestament} fraction={label.chaptersFraction(canon.old.have, canon.old.need)} percent={canon.old.percent} />
        <ReadBar label={label.newTestament} fraction={label.chaptersFraction(canon.new.have, canon.new.need)} percent={canon.new.percent} />
      </div>

      {earnedMilestones.length ? (
        <div className="badge-block">
          <span className="section-label">{label.earnedBadges}</span>
          <ul className="badge-grid">
            {earnedMilestones.map((badge) => (
              <li key={badge.id} className={`badge-card earned tier-${badge.definition.tier ?? 'bronze'}`}>
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={badge.definition.icon} /></svg>
                <strong>{localized(badge.definition.title, language)}</strong>
                <small>{localized(badge.definition.description, language)}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="muted">{label.noBadgesYet}</p>}

      <div className="badge-block">
        <span className="section-label">{label.bookBadges}</span>
        <div className="book-badge-group">
          <small>{label.oldTestament}</small>
          <ul className="book-badge-grid">
            {BOOKS_DATA.filter((book) => book.testament === 'old').map((book) => (
              <BookChip key={book.id} book={book} events={events} earned={earnedIds.has(`book-${book.id}`)} label={label} />
            ))}
          </ul>
        </div>
        <div className="book-badge-group">
          <small>{label.newTestament}</small>
          <ul className="book-badge-grid">
            {BOOKS_DATA.filter((book) => book.testament === 'new').map((book) => (
              <BookChip key={book.id} book={book} events={events} earned={earnedIds.has(`book-${book.id}`)} label={label} />
            ))}
          </ul>
        </div>
      </div>

      {lockedMilestones.length ? (
        <div className="badge-block">
          <span className="section-label">{label.lockedBadges}</span>
          <ul className="badge-grid">
            {lockedMilestones.map((badge) => {
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

function ReadBar({
  label,
  fraction,
  percent,
  large = false,
}: {
  label: string;
  fraction: string;
  percent: number;
  large?: boolean;
}) {
  const text = `${percent % 1 === 0 ? String(percent) : percent.toFixed(1)}%`;
  return (
    <div className={large ? 'read-bar large' : 'read-bar'}>
      <div className="read-bar-copy">
        <strong>{label}</strong>
        <span>{text} · {fraction}</span>
      </div>
      <div className="read-bar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)} aria-label={label}>
        <i style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

function BookChip({
  book,
  events,
  earned,
  label,
}: {
  book: (typeof BOOKS_DATA)[number];
  events: LedgerEvent[];
  earned: boolean;
  label: WordApp['label'];
}) {
  const definition = BADGES.find((badge) => badge.id === `book-${book.id}`);
  const progress = definition ? progressToward(definition, events) : { have: 0, need: book.chapters };
  return (
    <li className={earned ? 'book-chip earned' : 'book-chip'} title={`${book.name} · ${label.badgeProgress(progress.have, progress.need)}`}>
      <strong>{book.shortName}</strong>
      <small>{earned ? '✓' : `${progress.have}/${progress.need}`}</small>
    </li>
  );
}
