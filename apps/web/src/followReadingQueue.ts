import type { ReadingState } from './readParty';

/** Host positions are work to finish, not instructions to seek inside audio. */
export class FollowReadingQueue {
  pending: ReadingState[] = [];
  active: ReadingState | null = null;
  interrupted = false;
  private lastKey = '';

  reset(interrupted = false) {
    this.pending = [];
    this.active = null;
    this.lastKey = '';
    this.interrupted = interrupted;
  }

  receive(state: ReadingState | null) {
    if (!state || state.action === 'idle' || (state.action === 'live' && !state.finished)) {
      this.reset(true);
      return;
    }
    if (state.action === 'live' || !Number.isInteger(state.verse) || (state.verse ?? 0) < 1) return;
    const key = JSON.stringify([state.bookId, state.chapter, state.verse, state.playbackId ?? null]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.pending.push({ ...state });
  }
}
