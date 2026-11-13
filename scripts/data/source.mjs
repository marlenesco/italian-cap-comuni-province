export const sourcePage = 'https://www.gardainformatica.it/database-comuni-italiani';
const origin = new URL(sourcePage).origin;

export async function download(url, limit, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const address = new URL(url);
      if (address.origin !== origin || address.username || address.password) throw new Error('Unexpected source URL');
      const response = await fetcher(address, { signal: controller.signal, redirect: 'manual', headers: { 'user-agent': 'italian-cap-comuni-province dataset maintenance' } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('Redirect without location');
        url = new URL(location, address).href;
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(`Download failed: HTTP ${response.status}`);
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || +declared > limit)) { await response.body.cancel(); throw new Error('Invalid download size'); }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > limit) { controller.abort(); throw new Error('Download size limit exceeded'); }
        chunks.push(Buffer.from(chunk));
      }
      if (size === 0 || declared !== null && !response.headers.get('content-encoding') && size !== +declared) throw new Error('Incomplete download');
      return { buffer: Buffer.concat(chunks), url: address.href };
    }
    throw new Error('Too many redirects');
  } catch (error) {
    controller.abort();
    throw error;
  } finally { clearTimeout(timer); }
}

// No documented data manifest was found. Fail on missing or ambiguous official links.
export function discoverArchive(html) {
  const links = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1].replace(/&amp;/g, '&'), sourcePage))
    .filter((url) => url.origin === origin && /^\/gi_db_comuni\/[^/]+\.zip$/.test(url.pathname));
  const urls = [...new Set(links.map((url) => url.href))];
  if (urls.length !== 1) throw new Error('Official ZIP link missing or ambiguous; use --archive with the official download');
  const date = /Dati aggiornati al\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(html.replace(/<[^>]*>/g, ' '));
  if (!date) throw new Error('Source date missing; use --archive and --source-date');
  const sourceDate = `${date[3]}-${date[2]}-${date[1]}`;
  if (new Date(sourceDate).toISOString().slice(0, 10) !== sourceDate) throw new Error('Invalid source date');
  return { archiveUrl: urls[0], sourceDate };
}
