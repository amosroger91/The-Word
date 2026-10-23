import { BOOKS_DATA } from '@the-word/bible';
import type { Language } from '@the-word/core';

export type Localized = { en: string } & Partial<Record<Language, string>>;

export interface PassageRef { bookId: number; chapter: number; verses?: [number, number] }

export type Track = 'child' | 'youth' | 'adult';

export type Question =
  | { type: 'free'; prompt: Localized; placeholder?: Localized; minWords?: number }
  | { type: 'choice'; prompt: Localized; options: { id: string; text: Localized }[]; multiple?: boolean }
  | { type: 'scale'; prompt: Localized; min: number; max: number; minLabel?: Localized; maxLabel?: Localized }
  | { type: 'versePick'; prompt: Localized; within?: PassageRef }
  | { type: 'checklist'; prompt: Localized; items: { id: string; text: Localized }[] };

export type PlanBlock =
  | { kind: 'prose'; id: string; text: Localized }
  | { kind: 'passage'; id: string; ref: PassageRef; note?: Localized }
  | { kind: 'question'; id: string; question: Question; track?: Track };

export interface PlanSession {
  id: string;
  title: Localized;
  passages: PassageRef[];
  estimatedMinutes?: number;
  blocks: PlanBlock[];
}

export interface StudyPlan {
  format: 'the-word.plan';
  id: string;
  version: number;
  title: Localized;
  summary: Localized;
  author?: string;
  license?: string;
  audience: ('solo' | 'couple' | 'family' | 'friends')[];
  tags: string[];
  sessions: PlanSession[];
}

const bookById = new Map(BOOKS_DATA.map((book) => [book.id, book]));

export function localized(copy: Localized, language: Language): string {
  return copy[language] || copy.en;
}

export function validatePlan(plan: StudyPlan, previous?: StudyPlan): string[] {
  const errors: string[] = [];
  if (plan.format !== 'the-word.plan') errors.push('format');
  if (!plan.id) errors.push('id');
  if (!plan.title?.en) errors.push('title.en');
  if (!plan.summary?.en) errors.push('summary.en');
  const sessionIds = new Set<string>();
  const blockIds = new Set<string>();
  for (const session of plan.sessions || []) {
    if (!session.id) errors.push('session.id');
    if (sessionIds.has(session.id)) errors.push(`dup session ${session.id}`);
    sessionIds.add(session.id);
    if (!session.title?.en) errors.push(`session ${session.id} title`);
    for (const ref of session.passages || []) errors.push(...refErrors(ref));
    for (const block of session.blocks || []) {
      if (!block.id) errors.push('block.id');
      if (blockIds.has(block.id)) errors.push(`dup block ${block.id}`);
      blockIds.add(block.id);
      if (block.kind === 'prose' && !block.text?.en) errors.push(`block ${block.id} text`);
      if (block.kind === 'passage') errors.push(...refErrors(block.ref, block.id));
      if (block.kind === 'question') {
        if (!block.question?.prompt?.en) errors.push(`block ${block.id} prompt`);
        if (block.question.type === 'versePick' && block.question.within) errors.push(...refErrors(block.question.within, block.id));
      }
    }
  }
  if (previous && previous.id === plan.id) {
    const oldBlocks = new Set(previous.sessions.flatMap((session) => session.blocks.map((block) => block.id)));
    for (const id of oldBlocks) if (!blockIds.has(id)) errors.push(`removed id ${id}`);
  }
  return errors;
}

function refErrors(ref: PassageRef, at = 'ref'): string[] {
  const book = bookById.get(ref.bookId);
  if (!book) return [`${at} book`];
  if (ref.chapter < 1 || ref.chapter > book.chapters) return [`${at} chapter`];
  if (ref.verses && (ref.verses[0] < 1 || ref.verses[1] < ref.verses[0])) return [`${at} verses`];
  return [];
}

type PlanBundle = { index: string[]; byId: Record<string, StudyPlan> };

// The Android app has no static host. It sets this before the first load.
function bundledPlans(): PlanBundle | null {
  const bundle = (globalThis as { __WORD_PLAN_BUNDLE__?: PlanBundle }).__WORD_PLAN_BUNDLE__;
  if (!bundle || !Array.isArray(bundle.index) || !bundle.byId) return null;
  return bundle;
}

function assetBase(): string {
  const base = (globalThis as { __WORD_BASE_URL__?: string }).__WORD_BASE_URL__;
  return base || '/';
}

export async function loadPlanIndex(): Promise<string[]> {
  const bundled = bundledPlans();
  if (bundled) return bundled.index;
  const res = await fetch(`${assetBase()}plans/index.json`);
  if (!res.ok) return [];
  const body = await res.json() as { plans?: string[] };
  return body.plans ?? [];
}

export async function loadPlan(id: string): Promise<StudyPlan> {
  const bundled = bundledPlans()?.byId[id];
  if (bundled) {
    const errors = validatePlan(bundled);
    if (errors.length) throw new Error(errors.join(','));
    return bundled;
  }
  const res = await fetch(`${assetBase()}plans/${id}.json`);
  if (!res.ok) throw new Error('missing');
  const plan = await res.json() as StudyPlan;
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(errors.join(','));
  return plan;
}

export async function loadPlanFromFile(file: File): Promise<StudyPlan> {
  const plan = JSON.parse(await file.text()) as StudyPlan;
  const errors = validatePlan(plan);
  if (errors.length) throw new Error(errors.join(','));
  return plan;
}
