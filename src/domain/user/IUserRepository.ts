// src/domain/user/IUserRepository.ts — HemaV050
// User domain repository interface.
// MongoDB implementation lives in src/infrastructure/repositories/MongoUserRepository.ts

import type { IRepository, PaginatedResult } from '@/domain/shared/IRepository';
import type { UserRole } from '@/types';

export interface UserFilters {
  role?:   UserRole;
  search?: string;
  page:    number;
  limit:   number;
}

export interface UserEntity {
  id:              string;
  name:            string;
  email:           string;
  phone?:          string;
  role:            UserRole;
  avatar?:         string;
  addresses:       AddressEntry[];
  wishlist:        string[];
  isEmailVerified: boolean;
  isActive:        boolean;
  mfaEnabled:      boolean;
  failedLogins:    number;
  lockedUntil?:    Date;
  lastLoginAt?:    Date;
  createdAt:       Date;
  updatedAt?:      Date;
}

export interface AddressEntry {
  _id?:        string;
  label:       string;
  street:      string;
  city:        string;
  governorate: string;
  isDefault:   boolean;
}

export interface IUserRepository extends IRepository<UserEntity> {
  findByEmail(email: string): Promise<UserEntity | null>;
  findAll(filters: UserFilters): Promise<PaginatedResult<UserEntity>>;
  updateRole(id: string, role: UserRole): Promise<UserEntity | null>;
  toggleWishlist(id: string, productId: string): Promise<{ added: boolean }>;
  setPasswordReset(id: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findByPasswordResetToken(tokenHash: string): Promise<UserEntity | null>;
  clearPasswordReset(id: string, newPasswordHash: string): Promise<void>;
  incrementFailedLogins(id: string): Promise<number>;
  lockUntil(id: string, until: Date): Promise<void>;
  resetFailedLogins(id: string): Promise<void>;
}
