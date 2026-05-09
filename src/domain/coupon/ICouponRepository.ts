// src/domain/coupon/ICouponRepository.ts — HemaV050
// Coupon domain repository interface.

import type { ClientSession } from 'mongoose';
import type { IRepository, PaginatedResult } from '@/domain/shared/IRepository';

export interface CouponFilters {
  isActive?: boolean;
  page:      number;
  limit:     number;
}

export interface CouponEntity {
  id:           string;
  code:         string;
  type:         'percentage' | 'fixed';
  value:        number;
  minOrderValue: number;
  maxUses?:     number;
  usedCount:    number;
  perUserLimit: number;
  usedBy:       string[];
  expiresAt?:   Date;
  isActive:     boolean;
  createdAt:    Date;
  updatedAt:    Date;
}

export interface ICouponRepository extends IRepository<CouponEntity> {
  findByCode(code: string): Promise<CouponEntity | null>;
  /** Find an active (non-expired) coupon by code. */
  findActiveByCode(code: string): Promise<CouponEntity | null>;
  findAll(filters: CouponFilters): Promise<PaginatedResult<CouponEntity>>;
  atomicClaim(
    id: string,
    userId?: string,
    perUserLimit?: number,
    session?: ClientSession,
  ): Promise<CouponEntity | null>;
  /** Claim a coupon within a transaction session. */
  claimCoupon(id: string, userId: string | undefined, session?: ClientSession): Promise<CouponEntity | null>;
  deactivate(id: string): Promise<boolean>;
}
