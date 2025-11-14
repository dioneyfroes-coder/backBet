import { BaseAggregateRoot } from '../AggregateRoot';

class TestAggregate extends BaseAggregateRoot {
  constructor(id: string, createdAt?: Date) {
    super(id, createdAt);
  }
}

describe('BaseAggregateRoot', () => {
  describe('constructor', () => {
    it('should create an aggregate with id and createdAt', () => {
      const id = 'test-id';
      const createdAt = new Date('2025-01-01');
      const aggregate = new TestAggregate(id, createdAt);

      expect(aggregate.id).toBe(id);
      expect(aggregate.createdAt).toEqual(createdAt);
    });

    it('should use current date if createdAt not provided', () => {
      const id = 'test-id';
      const beforeCreation = new Date();
      const aggregate = new TestAggregate(id);
      const afterCreation = new Date();

      expect(aggregate.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(aggregate.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    });

    it('should initialize version to 1', () => {
      const aggregate = new TestAggregate('test-id');

      expect(aggregate.version).toBe(1);
    });

    it('should not have updatedAt initially', () => {
      const aggregate = new TestAggregate('test-id');

      expect(aggregate.updatedAt).toBeUndefined();
    });
  });

  describe('incrementVersion method', () => {
    it('should increment version by 1', () => {
      const aggregate = new TestAggregate('test-id');
      aggregate.incrementVersion();

      expect(aggregate.version).toBe(2);
    });

    it('should increment version multiple times', () => {
      const aggregate = new TestAggregate('test-id');
      aggregate.incrementVersion();
      aggregate.incrementVersion();
      aggregate.incrementVersion();

      expect(aggregate.version).toBe(4);
    });

    it('should not increment if version is undefined', () => {
      const aggregate = new TestAggregate('test-id');
      if (aggregate.version !== undefined) {
        aggregate.version = undefined as any;
      }
      aggregate.incrementVersion();

      expect(aggregate.version).toBeUndefined();
    });
  });

  describe('touch method', () => {
    it('should update updatedAt to current time', () => {
      const aggregate = new TestAggregate('test-id');
      const beforeTouch = new Date();
      aggregate.touch();
      const afterTouch = new Date();

      expect(aggregate.updatedAt).toBeDefined();
      expect(aggregate.updatedAt!.getTime()).toBeGreaterThanOrEqual(beforeTouch.getTime());
      expect(aggregate.updatedAt!.getTime()).toBeLessThanOrEqual(afterTouch.getTime());
    });

    it('should increment version when touching', () => {
      const aggregate = new TestAggregate('test-id');
      const initialVersion = aggregate.version;
      aggregate.touch();

      expect(aggregate.version).toBe((initialVersion || 0) + 1);
    });

    it('should update updatedAt on subsequent touches', () => {
      const aggregate = new TestAggregate('test-id');
      aggregate.touch();
      const firstUpdate = aggregate.updatedAt;

      // Wait a bit to ensure time difference
      const delay = new Promise(resolve => setTimeout(resolve, 10));
      return delay.then(() => {
        aggregate.touch();
        const secondUpdate = aggregate.updatedAt;

        expect(secondUpdate!.getTime()).toBeGreaterThanOrEqual(firstUpdate!.getTime());
      });
    });

    it('should increment version multiple times with touch', () => {
      const aggregate = new TestAggregate('test-id');
      aggregate.touch();
      aggregate.touch();
      aggregate.touch();

      expect(aggregate.version).toBe(4);
    });
  });

  describe('properties immutability', () => {
    it('should allow reading id', () => {
      const id = 'test-id';
      const aggregate = new TestAggregate(id);

      expect(aggregate.id).toBe(id);
    });

    it('should allow reading createdAt', () => {
      const createdAt = new Date();
      const aggregate = new TestAggregate('test-id', createdAt);

      expect(aggregate.createdAt).toEqual(createdAt);
    });

    it('should allow modifying updatedAt', () => {
      const aggregate = new TestAggregate('test-id');
      const newDate = new Date();
      aggregate.updatedAt = newDate;

      expect(aggregate.updatedAt).toEqual(newDate);
    });

    it('should allow modifying version', () => {
      const aggregate = new TestAggregate('test-id');
      aggregate.version = 10;

      expect(aggregate.version).toBe(10);
    });
  });

  describe('integration scenarios', () => {
    it('should track creation and modification times', () => {
      const createdAt = new Date('2025-01-01');
      const aggregate = new TestAggregate('test-id', createdAt);

      expect(aggregate.createdAt).toEqual(createdAt);
      expect(aggregate.updatedAt).toBeUndefined();

      aggregate.touch();

      expect(aggregate.updatedAt).toBeDefined();
      expect(aggregate.updatedAt!.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
    });

    it('should maintain version history', () => {
      const aggregate = new TestAggregate('test-id');
      expect(aggregate.version).toBe(1);

      aggregate.touch();
      expect(aggregate.version).toBe(2);

      aggregate.touch();
      expect(aggregate.version).toBe(3);

      aggregate.incrementVersion();
      expect(aggregate.version).toBe(4);
    });
  });
});