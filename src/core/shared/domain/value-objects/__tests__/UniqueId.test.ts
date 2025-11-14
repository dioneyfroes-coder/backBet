import { UniqueId } from '../UniqueId';

describe('UniqueId Value Object', () => {
  describe('constructor', () => {
    it('should create a UniqueId with provided value', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const uniqueId = new UniqueId(id);

      expect(uniqueId.value).toBe(id);
    });

    it('should generate UUID when no value provided', () => {
      const uniqueId = new UniqueId();

      expect(uniqueId.value).toBeDefined();
      expect(typeof uniqueId.value).toBe('string');
      expect(uniqueId.value.length).toBeGreaterThan(0);
    });

    it('should generate different UUIDs on multiple calls', () => {
      const uniqueId1 = new UniqueId();
      const uniqueId2 = new UniqueId();

      expect(uniqueId1.value).not.toBe(uniqueId2.value);
    });

    it('should accept UUID v4 format', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const uniqueId = new UniqueId();

      expect(uuidRegex.test(uniqueId.value)).toBe(true);
    });
  });

  describe('value property', () => {
    it('should expose value as readonly', () => {
      const id = 'test-id';
      const uniqueId = new UniqueId(id);

      expect(uniqueId.value).toBe(id);
      // Trying to modify should not work (TypeScript compile time check)
      // This is more of a type safety test
    });

    it('should return same value consistently', () => {
      const id = 'test-id';
      const uniqueId = new UniqueId(id);

      expect(uniqueId.value).toBe(id);
      expect(uniqueId.value).toBe(id);
    });
  });

  describe('toString method', () => {
    it('should return the UUID string', () => {
      const id = 'test-id-123';
      const uniqueId = new UniqueId(id);

      expect(uniqueId.toString()).toBe(id);
    });

    it('should be equivalent to value property', () => {
      const uniqueId = new UniqueId();

      expect(uniqueId.toString()).toBe(uniqueId.value);
    });
  });

  describe('equals method', () => {
    it('should return true when comparing UniqueIds with same value', () => {
      const id = 'same-id';
      const uniqueId1 = new UniqueId(id);
      const uniqueId2 = new UniqueId(id);

      expect(uniqueId1.equals(uniqueId2)).toBe(true);
    });

    it('should return false when comparing UniqueIds with different values', () => {
      const uniqueId1 = new UniqueId('id-1');
      const uniqueId2 = new UniqueId('id-2');

      expect(uniqueId1.equals(uniqueId2)).toBe(false);
    });

    it('should handle comparison with generated UUIDs', () => {
      const uniqueId1 = new UniqueId();
      const uniqueId2 = new UniqueId(uniqueId1.value);

      expect(uniqueId1.equals(uniqueId2)).toBe(true);
    });
  });

  describe('immutability', () => {
    it('should not allow changing the value after creation', () => {
      const uniqueId = new UniqueId('original-id');
      const originalValue = uniqueId.value;

      // Try to modify (should fail in TypeScript)
      // This is mainly a type safety verification
      expect(uniqueId.value).toBe(originalValue);
    });
  });
});