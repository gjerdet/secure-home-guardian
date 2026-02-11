/**
 * API base URL.
 * I produksjon (bak Nginx) brukes relativ path (tom streng) slik at
 * requests går via Nginx proxy (/api/ -> localhost:3001).
 * I utvikling kan VITE_API_URL settes til f.eks. http://localhost:3001.
 */
export const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Safely fetch JSON from an API endpoint.
 * Checks Content-Type before parsing to avoid cryptic errors
 * when the backend is down and the SPA returns HTML instead.
 */
export async function fetchJsonSafely<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');

    if (!contentType?.includes('application/json')) {
      const text = await response.text();
      if (text.trim().startsWith('<!') || text.includes('<html')) {
        return {
          ok: false,
          status: response.status,
          data: null,
          error: 'Backend er ikke tilgjengelig (fikk HTML i stedet for JSON)',
        };
      }
      return {
        ok: false,
        status: response.status,
        data: null,
        error: `Uventet responsformat: ${contentType}`,
      };
    }

    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : 'Nettverksfeil',
    };
  }
}
