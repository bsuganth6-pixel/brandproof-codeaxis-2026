export async function postJSON(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 25000): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const t = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`The model API returned ${res.status}${t ? `: ${t}` : ''}`);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('The model API timed out.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
