// src/domain/product/IProductRepository.ts — HemaV050
// Product domain repository interface.
// MongoDB implementation lives in src/infrastructure/repositories/MongoProductRepository.ts
// Future PostgreSQL/Prisma implementation can slot in without touching business logic.

import type { ClientSession } from 'mongoose';
import type { IRepository, PaginatedResult } from '@/domain/shared/IRepository';

export interface ProductFilters {
  category?:  string;
  sort?:       string;
  q?:          string;
  badge?:      string;
  brand?:      string;
  maxPrice?:   number;
  minPrice?:   number;
  minRating?:  number;
  featured?:   boolean;
  inStock?:    boolean;
  page:        number;
  limit:       number;
}

// Minimal domain entity — only the fields business logic cares about.
// Infrastructure models (Mongoose Documents) map to this shape.
export interface ProductEntity {
  id:          string;
  slug:        string;
  nameEn:      string;
  nameAr:      string;
  price:       number;
  stock:       number;
  isActive:    boolean;
  isFeatured:  boolean;
  images:      string[];
  category:    { main: string; sub?: string };
  rating:      number;
  reviewCount: number;
  createdAt:   Date;
  updatedAt:   Date;
}

export interface IProductRepository extends IRepository<ProductEntity> {
  findBySlug(slug: string): Promise<ProductEntity | null>;
  search(filters: ProductFilters): Promise<PaginatedResult<ProductEntity>>;
  incrementReviewStats(id: string, ratingDelta: number, countDelta: number): Promise<void>;
  /** Decrement stock atomically — returns false if insufficient stock. */
  decrementStock(id: string, quantity: number, session?: ClientSession): Promise<boolean>;
  /** Increment stock — used for rollback on payment failure. */
  incrementStock(id: string, quantity: number): Promise<void>;
  /** Find multiple products by IDs, with optional session for transactional reads. */
  findByIds(ids: string[], session?: ClientSession): Promise<ProductEntity[]>;
}
