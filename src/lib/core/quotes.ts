const MAP: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '\u00a0': ' ' };

function norm(s: string): { t: string; map: number[] } {
  let t = '';
  const map: number[] = [];
  let space = true;
  for (let i = 0; i < s.length; i++) {
    let c = MAP[s[i]] ?? s[i];
    if (/\s/.test(c)) {
      if (space) continue;
      c = ' ';
      space = true;
    } else space = false;
    const lc = c.toLowerCase();
    t += lc;
    for (let k = 0; k < lc.length; k++) map.push(i);
  }
  return { t, map };
}

export interface Located { start: number; end: number; quote: string }

/**
 * Verifies that `quote` really appears in `text` (tolerating case, curly quotes and whitespace)
 * and returns the exact span in the original text. Returns null when it cannot be verified.
 */
export function locateQuote(text: string, quote: string): Located | null {
  const q = quote.trim();
  if (q.length < 3 || q.length > 400) return null;
  const exact = text.indexOf(q);
  if (exact >= 0) return { start: exact, end: exact + q.length, quote: q };
  const nt = norm(text);
  const nq = norm(q).t.trim();
  if (nq.length < 3) return null;
  const i = nt.t.indexOf(nq);
  if (i < 0) return null;
  const start = nt.map[i];
  const end = nt.map[i + nq.length - 1] + 1;
  return { start, end, quote: text.slice(start, end) };
}
