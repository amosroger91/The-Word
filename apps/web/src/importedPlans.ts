// Plans a reader brought in themselves. Curated plans ship in the repo,
// translated and validated in the build; an imported one is content of unknown
// provenance that *teaches*, so it stays local to the device that imported it,
// is marked unverified, and must be accepted by a person before a word of it
// renders. See docs/study-plans-framework.md §14d.
import { validatePlan, type StudyPlan } from './plans';

export const IMPORTED_KEY = 'word.importedPlans';
export const ACCEPTED_KEY = 'word.acceptedPlans';

export interface ImportedPlan {
  plan: StudyPlan;
  importedAt: string;
  /** Where it came from, for the label the reader sees. */
  origin: 'file' | 'circle';
  /** Who offered it, when a circle did. */
  offeredBy?: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

export function loadImported(): ImportedPlan[] {
  const rows = read<ImportedPlan[]>(IMPORTED_KEY, []);
  // Re-validate on the way out: a file edited in storage is still untrusted.
  return rows.filter((row) => row?.plan?.id && validatePlan(row.plan).length === 0);
}

export function saveImported(rows: ImportedPlan[]) {
  write(IMPORTED_KEY, rows);
}

export function addImported(plan: StudyPlan, origin: ImportedPlan['origin'] = 'file', offeredBy?: string): ImportedPlan[] {
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(errors.join(', '));
  const rows = loadImported().filter((row) => row.plan.id !== plan.id);
  const next = [...rows, { plan, importedAt: new Date().toISOString(), origin, offeredBy }];
  saveImported(next);
  return next;
}

export function removeImported(id: string): ImportedPlan[] {
  const next = loadImported().filter((row) => row.plan.id !== id);
  saveImported(next);
  unaccept(id);
  return next;
}

export function acceptedIds(): string[] {
  return read<string[]>(ACCEPTED_KEY, []);
}

/** Accepting is a person's decision, per device. A circle host cannot make it. */
export function accept(id: string) {
  const ids = acceptedIds();
  if (!ids.includes(id)) write(ACCEPTED_KEY, [...ids, id]);
}

export function unaccept(id: string) {
  write(ACCEPTED_KEY, acceptedIds().filter((value) => value !== id));
}

export function isAccepted(id: string): boolean {
  return acceptedIds().includes(id);
}

/** Curated plans need no gate; imported ones do until accepted here. */
export function needsAcceptance(planId: string, curatedIds: string[]): boolean {
  if (curatedIds.includes(planId)) return false;
  return !isAccepted(planId);
}

export async function importPlanFile(file: File): Promise<StudyPlan> {
  const plan = JSON.parse(await file.text()) as StudyPlan;
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(errors.join(', '));
  return plan;
}
