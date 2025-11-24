import mongoose, { Schema, model } from 'mongoose';

const migrationSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    appliedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

const MigrationModel = mongoose.models.Migration || model('Migration', migrationSchema);

export interface MigrationDefinition {
  name: string;
  description: string;
  run: () => Promise<void>;
}

export class MigrationRunner {
  static async getAppliedNames(): Promise<string[]> {
    const docs = await MigrationModel.find({}, 'name').lean();
    return docs.map((doc) => doc.name);
  }

  static async record(migration: MigrationDefinition): Promise<void> {
    await MigrationModel.create({
      name: migration.name,
      description: migration.description,
      appliedAt: new Date(),
    });
  }

  static async run(migrations: MigrationDefinition[]): Promise<void> {
    const applied = new Set(await this.getAppliedNames());
    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        console.log(`Skipping migration ${migration.name} (already applied)`);
        continue;
      }
      console.log(`Running migration ${migration.name}`);
      await migration.run();
      await this.record(migration);
      console.log(`Migration ${migration.name} completed`);
    }
  }
}
