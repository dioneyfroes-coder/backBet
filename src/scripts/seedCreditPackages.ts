import 'dotenv/config';
import { randomUUID } from 'crypto';
import { createCreditPackageRepository } from '@/infrastructure/persistence/factory';
import { CreditPackage } from '@/core/finance/domain/entities/CreditPackage';

const seedPackages = [
  {
    code: 'bronze-100',
    label: 'Pacote Bronze',
    baseAmount: 100,
    bonusAmount: 10,
    currency: 'BRL' as const,
    price: 90,
  },
  {
    code: 'prata-250',
    label: 'Pacote Prata',
    baseAmount: 250,
    bonusAmount: 35,
    currency: 'BRL' as const,
    price: 220,
  },
  {
    code: 'ouro-500',
    label: 'Pacote Ouro',
    baseAmount: 500,
    bonusAmount: 80,
    currency: 'BRL' as const,
    price: 420,
  },
  {
    code: 'vip-1000',
    label: 'Pacote VIP',
    baseAmount: 1000,
    bonusAmount: 220,
    currency: 'BRL' as const,
    price: 800,
  },
];

async function main() {
  console.log('Iniciando seed de pacotes de crédito...');
  const repository = await createCreditPackageRepository();

  for (const definition of seedPackages) {
    const existing = await repository.findById(definition.code);
    if (existing) {
      console.log(`Pacote ${definition.code} já existe, atualizando`);
    }

    const creditPackage = new CreditPackage(
      definition.code,
      definition.code,
      definition.label,
      definition.baseAmount,
      definition.bonusAmount,
      definition.currency,
      definition.price,
      `Pacote automático criado por seed: ${definition.label}`,
      true,
      new Date(),
      new Date(),
    );

    await repository.save(creditPackage);
  }

  console.log('Seed finalizada com sucesso.');
}

main().catch((error) => {
  console.error('Seed de pacotes falhou:', error);
  process.exit(1);
});
