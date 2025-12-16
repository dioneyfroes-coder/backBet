import { UserRepository } from '@core/user/domain/repositories/UserRepository';
import { PasswordRecoveryService } from '../PasswordRecoveryService';
import { User } from '@core/user/domain/entities/User';
import { Email } from '@core/user/domain/value-objects/Email';

describe('PasswordRecoveryService', () => {
  let userRepository: UserRepository;
  let service: PasswordRecoveryService;
  let user: User;

  beforeEach(() => {
    userRepository = new UserRepository();
    user = new User(
      '1',
      new Email('test@example.com'),
      'testuser',
      'hash',
      'ACTIVE',
      new Date(),
      new Date(),
      null,
      [],
      {
        emailNotifications: true,
        smsNotifications: false,
        marketingEmails: false,
        requireWithdrawPassword: null,
      },
      undefined,
    );
    userRepository.save(user);
    service = new PasswordRecoveryService(userRepository);
  });

  it('gera token e salva no usuário', async () => {
    const token = await service.requestRecovery('test@example.com');
    const updated = await userRepository.findById('1');
    expect(updated?.passwordRecovery?.token).toBe(token);
    expect(updated?.passwordRecovery?.expiresAt).toBeInstanceOf(Date);
  });

  it('retorna string vazia se email não existe', async () => {
    await expect(service.requestRecovery('naoexiste@x.com')).resolves.toBe('');
  });

  it('reseta senha com token válido', async () => {
    const token = await service.requestRecovery('test@example.com');
    await service.resetPassword(token, 'novaSenha123');
    const updated = await userRepository.findById('1');
    expect(updated?.passwordHash).not.toBe('hash');
    expect(updated?.passwordRecovery).toBeUndefined();
  });

  it('não reseta senha com token inválido', async () => {
    await expect(service.resetPassword('tokeninvalido', 'novaSenha')).rejects.toThrow(
      'Token inválido',
    );
  });

  it('não reseta senha com token expirado', async () => {
    const token = await service.requestRecovery('test@example.com');
    const updated = await userRepository.findById('1');
    if (updated && updated.passwordRecovery) {
      updated.passwordRecovery.expiresAt = new Date(Date.now() - 1000); // já expirado
      await userRepository.update(updated);
    }
    await expect(service.resetPassword(token, 'novaSenha')).rejects.toThrow('Token expirado');
  });
});
