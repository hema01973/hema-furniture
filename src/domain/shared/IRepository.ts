// src/domain/shared/IRepository.ts — HemaV050
// Repository pattern interface — decouples domain from MongoDB/Mongoose.
// Any persistence adapter (MongoDB, PostgreSQL/Prisma, in-memory for tests)
// MUST implement this contract. Routes and services depend ONLY on this interface.

export interface PaginationOptions {
  page:  number;
  limit: number;
}

export interface PaginatedResult<T> {
  items:      T[];
  total:      number;
  page:       number;
  totalPages: number;
}

export interface IRepository<T, TId = string> {
  findById(id: TId): Promise<T | null>;
  findAll(opts?: PaginationOptions): Promise<PaginatedResult<T>>;
  save(entity: T): Promise<T>;
  delete(id: TId): Promise<boolean>;
}
