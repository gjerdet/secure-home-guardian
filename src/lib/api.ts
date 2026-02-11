/**
 * API base URL.
 * I produksjon (bak Nginx) brukes relativ path (tom streng) slik at
 * requests går via Nginx proxy (/api/ -> localhost:3001).
 * I utvikling kan VITE_API_URL settes til f.eks. http://localhost:3001.
 */
export const API_BASE = import.meta.env.VITE_API_URL || '';
