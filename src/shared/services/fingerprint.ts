/**
 * Fingerprint canônico e determinístico para Idempotency-Key.
 *
 * O `JSON.stringify` puro depende da ordem de inserção das chaves e de detalhes
 * de serialização de números (ex.: `-0`, `0.30000000000000004`). Dois payloads
 * semanticamente iguais, mas serializados de formas diferentes, produziriam
 * fingerprints diferentes e o replay seguro da Fase 8 quebraria. Esta função
 * normaliza a serialização ordenando chaves recursivamente e usando uma
 * codificação estável (ex.: ISO 8601 para Date).
 */

function isoForDate(value: Date): string {
  return value.toISOString();
}

function canonicalStringify(value: unknown, seen: WeakSet<object>): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number') {
    // Normaliza -0 -> 0 e NaNs/Infinity para string estável.
    if (Number.isNaN(value)) {
      return '"NaN"';
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? '"Infinity"' : '"-Infinity"';
    }
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'bigint') {
    return `"${value.toString()}"`;
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value instanceof Date) {
    return JSON.stringify(isoForDate(value));
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item, seen)).join(',')}]`;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('Circular reference detected in idempotency fingerprint');
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key], seen)}`)
      .join(',');
    seen.delete(value);
    return `{${body}}`;
  }
  // function/symbol/undefined não-serializáveis -> representação estável.
  return JSON.stringify(String(value));
}

export function canonicalFingerprint(value: unknown): string {
  return canonicalStringify(value, new WeakSet<object>());
}

export default canonicalFingerprint;