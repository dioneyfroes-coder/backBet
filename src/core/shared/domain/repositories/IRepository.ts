/**
 * Interface base para repositórios genéricos.
 * Define um contrato padrão para operações CRUD em qualquer entidade.
 * 
 * Padrão: todos os repos devem implementar save, update, findById, delete.
 * Métodos opcionais podem ser estendidos conforme necessário.
 */
export interface IRepository<T, ID = string> {
  /**
   * Salva uma nova entidade (CREATE).
   */
  save(entity: T): Promise<T>;

  /**
   * Atualiza uma entidade existente.
   */
  update(entity: T): Promise<T>;

  /**
   * Busca uma entidade pelo ID.
   */
  findById(id: ID): Promise<T | null>;

  /**
   * Remove uma entidade pelo ID.
   */
  delete(id: ID): Promise<boolean>;
}
