import { UserRepository } from '../UserRepository';
import { User } from '../../entities/User';
import { Email } from '../../value-objects/Email';
import { UserStatus } from '../../../types/user.types';

type UserOverrides = {
  id?: string;
  email?: string;
  username?: string;
  passwordHash?: string;
  status?: UserStatus;
  createdAt?: Date;
  updatedAt?: Date;
};

const buildUser = ({
  id = 'user-1',
  email = 'test@example.com',
  username = 'tester',
  passwordHash = 'hash',
  status = 'ACTIVE',
  createdAt = new Date(),
  updatedAt = new Date(),
}: UserOverrides = {}) =>
  new User(id, new Email(email), username, passwordHash, status, createdAt, updatedAt);

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeEach(() => {
    repository = new UserRepository();
  });

  it('saves users and indexes by email', async () => {
    const user = buildUser();
    await repository.save(user);

    expect(await repository.findById(user.id)).toBe(user);
    expect((await repository.findByEmail('TEST@example.com'))?.id).toBe(user.id);
  });

  it('updates and deletes users, keeping indexes in sync', async () => {
    const user = buildUser();
    await repository.save(user);

    user.username = 'new-name';
    await repository.update(user);
    expect((await repository.findById(user.id))?.username).toBe('new-name');

    expect(await repository.delete(user.id)).toBe(true);
    expect(await repository.findByEmail(user.email.toString())).toBeNull();
  });

  it('throws AppError when trying to update a missing user', async () => {
    await expect(repository.update(buildUser())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns false if delete target does not exist', async () => {
    expect(await repository.delete('missing')).toBe(false);
  });

  it('exposes helpers for inspection and reset during tests', async () => {
    const userA = buildUser({ id: 'user-a', email: 'alpha@example.com' });
    const userB = buildUser({ id: 'user-b', email: 'beta@example.com' });
    await repository.save(userA);
    await repository.save(userB);

    expect(repository.getAllUsers()).toHaveLength(2);
    repository.clear();

    expect(repository.getAllUsers()).toHaveLength(0);
    expect(await repository.findById(userA.id)).toBeNull();
    expect(await repository.findByEmail('alpha@example.com')).toBeNull();
  });
});
