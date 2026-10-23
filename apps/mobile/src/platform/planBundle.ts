// The phone has no web server, so the curated plans travel inside the app.
// plans.ts and membership.ts return these globals before any network fetch.

const index = require('../../../web/public/plans/index.json') as { plans?: string[] };
const comeAndSee = require('../../../web/public/plans/come-and-see.json') as unknown;
const relay = require('../../../web/public/relay.json') as { urls?: unknown; issuerPub?: unknown };

const files: Record<string, unknown> = {
  'come-and-see': comeAndSee,
};

export function installPlanBundle() {
  const ids = (index.plans ?? []).filter((id) => files[id]);
  const byId: Record<string, unknown> = {};
  for (const id of ids) byId[id] = files[id];
  (globalThis as { __WORD_PLAN_BUNDLE__?: { index: string[]; byId: Record<string, unknown> } }).__WORD_PLAN_BUNDLE__ = { index: ids, byId };
  const urls = Array.isArray(relay.urls) ? relay.urls.map(String).filter(Boolean) : [];
  (globalThis as { __WORD_RELAY__?: { urls: string[]; issuerPub: string } }).__WORD_RELAY__ = {
    urls,
    issuerPub: String(relay.issuerPub || ''),
  };
}
