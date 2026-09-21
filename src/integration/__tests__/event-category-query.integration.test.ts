import { randomUUID } from 'crypto';
import {
  connectMongoDB,
  disconnectMongoDB,
  getMongoDBConfig,
} from '@/infrastructure/persistence/mongoose/config';
import { EventModel } from '@/infrastructure/persistence/mongoose/schemas/EventSchema';
import { MongooseEventRepository } from '@/infrastructure/persistence/mongoose/repositories/MongooseEventRepository';

const runRealIntegration = process.env.RUN_REAL_INTEGRATION_TESTS === 'true';
const describeReal = runRealIntegration ? describe : describe.skip;

interface PlanNode {
  stage?: string;
  indexName?: string;
  inputStage?: PlanNode;
  queryPlan?: PlanNode;
  inputStages?: PlanNode[];
}

function collectStages(node: PlanNode | undefined, acc: PlanNode[] = []): PlanNode[] {
  if (!node) return acc;
  acc.push(node);
  collectStages(node.inputStage, acc);
  collectStages(node.queryPlan, acc);
  for (const child of node.inputStages ?? []) {
    collectStages(child, acc);
  }
  return acc;
}

describeReal('Item #12 — findByCategory usa índice (MongoDB real)', () => {
  jest.setTimeout(120_000);
  const prefix = `evt-cat-${randomUUID()}`;

  beforeAll(async () => {
    await connectMongoDB(getMongoDBConfig());
    await EventModel.syncIndexes();
  });

  afterAll(async () => {
    await EventModel.deleteMany({ id: { $regex: `^${prefix}` } });
    await disconnectMongoDB();
  });

  it('a query { category } + sort usa IXSCAN no índice de categoria (sem COLLSCAN)', async () => {
    await EventModel.insertMany([
      {
        id: `${prefix}-1`,
        name: 'Time A vs Time B',
        category: 'Football',
        startDate: new Date(Date.now() + 3_600_000),
        status: 'SCHEDULED',
        participants: ['Time A', 'Time B'],
        markets: [],
        version: 1,
      },
      {
        id: `${prefix}-2`,
        name: 'Time C vs Time D',
        category: 'Basketball',
        startDate: new Date(Date.now() + 7_200_000),
        status: 'SCHEDULED',
        participants: ['Time C', 'Time D'],
        markets: [],
        version: 1,
      },
    ]);

    const explain = (await EventModel.find({ category: 'football' })
      .collation({ locale: 'en', strength: 2 })
      .sort({ startDate: 1 })
      .explain('executionStats')) as unknown as { queryPlanner: { winningPlan: PlanNode } };

    const stages = collectStages(explain.queryPlanner.winningPlan);
    const indexScans = stages.filter((node) => node.stage === 'IXSCAN');

    expect(indexScans.length).toBeGreaterThan(0);
    expect(
      indexScans.some((node) => (node.indexName ?? '').startsWith('category_1_startDate_1')),
    ).toBe(true);
    expect(stages.some((node) => node.stage === 'COLLSCAN')).toBe(false);

    const repo = new MongooseEventRepository();
    const found = await repo.findByCategory('football');
    expect(found.map((event) => event.id)).toContain(`${prefix}-1`);
    expect(found.every((event) => event.category === 'Football')).toBe(true);
  });
});
