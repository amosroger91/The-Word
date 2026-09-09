import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/plans');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const ids = new Set();
for (const id of index.plans) {
  const plan = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
  if (plan.format !== 'the-word.plan') throw new Error(`${id}: format`);
  if (!plan.title?.en || !plan.summary?.en) throw new Error(`${id}: missing en`);
  if (ids.has(plan.id)) throw new Error(`${id}: duplicate plan id`);
  ids.add(plan.id);
  const blocks = new Set();
  for (const session of plan.sessions) {
    if (!session.id || !session.title?.en) throw new Error(`${id}: session`);
    for (const block of session.blocks) {
      if (blocks.has(block.id)) throw new Error(`${id}: duplicate block ${block.id}`);
      blocks.add(block.id);
      if (block.kind === 'prose' && !block.text?.en) throw new Error(`${id}: prose ${block.id}`);
      if (block.kind === 'question' && !block.question?.prompt?.en) throw new Error(`${id}: question ${block.id}`);
    }
  }
}
console.log(`ok ${index.plans.length} plan(s)`);
