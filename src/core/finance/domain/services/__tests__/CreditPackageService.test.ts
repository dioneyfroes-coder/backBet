import { CreditPackageService } from '../CreditPackageService';
import { CreditPackage } from '../../entities/CreditPackage';

describe('CreditPackageService', () => {
  const mockRepo = {
    listActive: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only active packages', async () => {
    const active = [
      new CreditPackage('1', 'bronze-1', 'Bronze', 100, 10, 'BRL', 90),
      new CreditPackage('2', 'prata-1', 'Prata', 200, 20, 'BRL', 180, undefined, true),
    ];
    (mockRepo.listActive as jest.Mock).mockResolvedValue(active);
    const service = new CreditPackageService(mockRepo);

    const result = await service.listActive();

    expect(result).toEqual(active);
    expect(mockRepo.listActive).toHaveBeenCalled();
  });

  it('returns package by id', async () => {
    const target = new CreditPackage('target', 'ouro-1', 'Ouro', 300, 30, 'BRL', 270);
    (mockRepo.findById as jest.Mock).mockResolvedValue(target);
    const service = new CreditPackageService(mockRepo);

    const found = await service.getById('target');

    expect(found).toBe(target);
    expect(mockRepo.findById).toHaveBeenCalledWith('target');
  });

  it('throws when package not found', async () => {
    (mockRepo.findById as jest.Mock).mockResolvedValue(null);
    const service = new CreditPackageService(mockRepo);

    await expect(service.getById('unknown')).rejects.toThrow('Pacote de créditos não encontrado');
  });

  it('creates credit packages via repository', async () => {
    const newPackage = new CreditPackage('3', 'diamond-1', 'Diamond', 400, 40, 'BRL', 360);
    (mockRepo.save as jest.Mock).mockResolvedValue(newPackage);
    const service = new CreditPackageService(mockRepo);

    const created = await service.create(newPackage);

    expect(created).toBe(newPackage);
    expect(mockRepo.save).toHaveBeenCalledWith(newPackage);
  });
});
