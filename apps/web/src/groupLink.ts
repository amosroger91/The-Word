/** Room codes are kept in the fragment so the static host never needs a route. */
export function parseGroupHash(hash: string): string | null {
  const match = /^#group=([a-z0-9-]{1,40})$/i.exec(hash);
  return match ? match[1].toLowerCase() : null;
}

export function groupInviteUrl(code: string, pageUrl: string): string {
  const clean = code.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(clean)) throw new Error('Invalid room code');
  const url = new URL(pageUrl);
  // Never include account restore tokens or unrelated query parameters.
  url.search = '';
  url.hash = `group=${clean}`;
  return url.toString();
}
