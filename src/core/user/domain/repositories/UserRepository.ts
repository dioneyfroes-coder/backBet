import { User } from '../entities/User';
import { IUserRepository } from './IUserRepository';

/**
 * Implementação em memória do repositório de usuários
 * TODO: Substituir por implementação com banco de dados (PostgreSQL/TypeORM)
 */
export class UserRepository implements IUserRepository {
  private users: Map<string, User> = new Map();
  private emailIndex: Map<string, string> = new Map(); // email -> userId

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const userId = this.emailIndex.get(email.toLowerCase());
    if (!userId) return null;
    return this.users.get(userId) || null;
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
    this.emailIndex.set(user.email.value.toLowerCase(), user.id);
  }

  async update(user: User): Promise<void> {
    if (!this.users.has(user.id)) {
      throw new Error('User not found');
    }
    this.users.set(user.id, user);
  }

  async delete(id: string): Promise<boolean> {
    const user = this.users.get(id);
    if (!user) return false;

    this.emailIndex.delete(user.email.value.toLowerCase());
    this.users.delete(id);
    return true;
  }

  // Método auxiliar para testes
  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  // Método auxiliar para limpar dados (testes)
  clear(): void {
    this.users.clear();
    this.emailIndex.clear();
  }
}
