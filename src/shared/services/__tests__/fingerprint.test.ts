import { canonicalFingerprint } from '../fingerprint';

describe('canonicalFingerprint (Fase 8.2)', () => {
  it('é determinístico independente da ordem das chaves', () => {
    const a = canonicalFingerprint({ userId: 'u1', amount: 50, currency: 'BRL', description: 'dep' });
    const b = canonicalFingerprint({ description: 'dep', currency: 'BRL', amount: 50, userId: 'u1' });
    expect(a).toBe(b);
  });

  it('é igual para payloads semanticamente iguais com aninhamento reordenado', () => {
    const a = canonicalFingerprint({ userId: 'u1', meta: { x: 1, y: [1, 2, 3], z: { deep: true } } });
    const b = canonicalFingerprint({ meta: { z: { deep: true }, y: [1, 2, 3], x: 1 }, userId: 'u1' });
    expect(a).toBe(b);
  });

  it('normaliza -0, NaN e Infinity de forma estável', () => {
    expect(canonicalFingerprint({ v: -0 })).toBe(canonicalFingerprint({ v: 0 }));
    expect(canonicalFingerprint({ v: NaN })).toBe(canonicalFingerprint({ v: NaN }));
    expect(canonicalFingerprint({ v: Infinity })).toBe(canonicalFingerprint({ v: Infinity }));
  });

  it('serializa Date por ISO 8601 (mesmo fuso)', () => {
    const d = new Date('2026-09-18T10:00:00.000Z');
    expect(canonicalFingerprint({ at: d })).toBe(canonicalFingerprint({ at: new Date(d.toISOString()) }));
    expect(canonicalFingerprint({ at: d })).not.toBe(canonicalFingerprint({ at: new Date(d.getTime() + 1) }));
  });

  it('distingue payloads distintos e tipos distintos', () => {
    expect(canonicalFingerprint({ userId: 'u1', amount: 50 })).not.toBe(
      canonicalFingerprint({ userId: 'u1', amount: 51 }),
    );
    expect(canonicalFingerprint({ userId: 'u1' })).not.toBe(
      canonicalFingerprint({ userId: 'u1', extra: 'x' }),
    );
    expect(canonicalFingerprint([1, 2])).not.toBe(canonicalFingerprint([2, 1]));
  });

  it('normaliza undefined explicito igual a ausência de chave', () => {
    expect(canonicalFingerprint({ userId: 'u1', amount: undefined })).toBe(
      canonicalFingerprint({ userId: 'u1' }),
    );
  });

  it('lança erro em referências circulares', () => {
    const circular: Record<string, unknown> = { userId: 'u1' };
    circular.self = circular;
    expect(() => canonicalFingerprint(circular)).toThrow(/Circular/);
  });

  it('strings, booleanos e null permanecem estáveis', () => {
    expect(canonicalFingerprint({ s: 'a', b: true, n: null })).toBe(
      canonicalFingerprint({ n: null, s: 'a', b: true }),
    );
  });
});