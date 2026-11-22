/**
 * Sanitizes an inventory lookup and escapes SQL ILIKE single-character and
 * multicharacter wildcards. The returned text is used between literal '%'
 * on both PostgREST OR alternatives.
 * @param {string} input
 * @returns {string | null}
 */
export function stockSearchPattern(input) {
  const text = input.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑüÜ\s._-]/g, '').trim();
  if (!text) return null;
  return text.replace(/[%_\\]/g, '\\$&');
}
