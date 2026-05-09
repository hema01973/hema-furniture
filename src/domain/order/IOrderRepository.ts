// src/domain/order/IOrderRepository.ts — HemaV050
// Order domain repository interface.

import type { IRepository, PaginatedResult } from '@/domain/shared/IRepository';

export interface OrderFilters {
  userId?:        string;
  status?:        string;
  paymentStatus?: string;
  page:           number;
  limit:          number;
}

export interface OrderEntity {
  id:              string;
  orderNumber:     string;
  userId?:         string;
  guestEmail?:     string;
  status:          string;
  paymentStatus:   string;
  paymentMethod:   string;
  total:           number;
  subtotal:        number;
  shipping:        number;
  discount:        number;
  items:           OrderItemEntity[];
  customer:        CustomerEntity;
  shippingAddress: AddressEntity;
  notes?:          string;
  idempotencyKey?: string;
  createdAt:       Date;
  updatedAt:       Date;
}

export interface OrderItemEntity {
  productId: string;
  nameEn:    string;
  nameAr:    string;
  price:     number;
  quantity:  number;
  image?:    string;
}

export interface CustomerEntity {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
}

export interface AddressEntity {
  street:      string;
  city:        string;
  governorate: string;
  postalCode?: string;
}

export interface IOrderRepository extends IRepository<OrderEntity> {
  findByOrderNumber(orderNumber: string): Promise<OrderEntity | null>;
  findByIdempotencyKey(key: string): Promise<OrderEntity | null>;
  findByUserId(userId: string, opts: { page: number; limit: number }): Promise<PaginatedResult<OrderEntity>>;
  findAll(filters: OrderFilters): Promise<PaginatedResult<OrderEntity>>;
  updateStatus(id: string, status: string, note?: string): Promise<OrderEntity | null>;
  updatePaymentStatus(id: string, paymentStatus: string, meta?: Record<string, unknown>): Promise<OrderEntity | null>;
}
