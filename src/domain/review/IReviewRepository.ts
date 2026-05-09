// src/domain/review/IReviewRepository.ts — HemaV050
// Review domain repository interface.

import type { IRepository, PaginatedResult } from '@/domain/shared/IRepository';

export interface ReviewFilters {
  productId?:  string;
  userId?:     string;
  isApproved?: boolean;
  page:        number;
  limit:       number;
}

export interface ReviewEntity {
  id:                 string;
  productId:          string;
  userId:             string;
  userName:           string;
  rating:             number;
  title?:             string;
  body:               string;
  images?:            string[];
  isVerifiedPurchase: boolean;
  isApproved:         boolean;
  helpful:            number;
  createdAt:          Date;
  updatedAt:          Date;
}

export interface IReviewRepository extends IRepository<ReviewEntity> {
  findAll(filters: ReviewFilters): Promise<PaginatedResult<ReviewEntity>>;
  findByProductId(productId: string, opts: { page: number; limit: number }): Promise<PaginatedResult<ReviewEntity>>;
  approve(id: string): Promise<ReviewEntity | null>;
  reject(id: string): Promise<boolean>;
  incrementHelpful(id: string): Promise<ReviewEntity | null>;
}
