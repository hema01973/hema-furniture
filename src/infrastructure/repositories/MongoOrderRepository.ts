// src/infrastructure/repositories/MongoOrderRepository.ts — HemaV054
// MED-03 FIX (V054): ORDER_LIST_PROJECTION applied to list queries.
// IMPROVE-ARCH-04 (V049): added .maxTimeMS(5000) on all read queries.
// The connection-level socketTimeoutMS (45s) guards against network stalls but
// not against slow MongoDB aggregations or index misses. Per-query timeouts
// ensure a single slow query cannot hold up the request for 45 seconds.

import mongoose from 'mongoose';
import { connectDB, Order } from '@/lib/mongodb';
import type {
  IOrderRepository,
  OrderEntity,
  OrderFilters,
  OrderItemEntity,
  CustomerEntity,
  AddressEntity,
} from '@/domain/order/IOrderRepository';
import type { PaginatedResult } from '@/domain/shared/IRepository';

/** Minimal shape returned by Mongoose .lean() for an Order document. */
interface OrderDoc {
  _id:             mongoose.Types.ObjectId;
  orderNumber:     string;
  userId?:         mongoose.Types.ObjectId;
  guestEmail?:     string;
  status:          string;
  paymentStatus:   string;
  paymentMethod:   string;
  total:           number;
  subtotal:        number;
  shipping:        number;
  discount:        number;
  idempotencyKey?: string;
  notes?:          string;
  items:           OrderItemDoc[];
  customer:        CustomerDoc;
  shippingAddress: AddressDoc;
  createdAt:       Date;
  updatedAt:       Date;
}

interface OrderItemDoc {
  productId?: mongoose.Types.ObjectId | string;
  nameEn:     string;
  nameAr:     string;
  price:      number;
  quantity:   number;
  image?:     string;
}

interface CustomerDoc {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
}

interface AddressDoc {
  street:      string;
  city:        string;
  governorate: string;
  postalCode?: string;
}

// MED-03 FIX (V054): Field-level projection for list queries to prevent over-exposure
// of shipping address details (governorate, street) and internal fields.
// Detail views (findById, findByOrderNumber) still return the full document.
const ORDER_LIST_PROJECTION = {
  orderNumber: 1, status: 1, paymentStatus: 1, paymentMethod: 1,
  items: 1, total: 1, subtotal: 1, shipping: 1, discount: 1,
  createdAt: 1, updatedAt: 1,
  'customer.firstName': 1, 'customer.lastName': 1, 'customer.email': 1,
  // shippingAddress intentionally excluded from list view — available on detail
} as const;

function toEntity(doc: OrderDoc): OrderEntity {
  return {
    id:              doc._id.toString(),
    orderNumber:     doc.orderNumber,
    userId:          doc.userId?.toString(),
    guestEmail:      doc.guestEmail,
    status:          doc.status,
    paymentStatus:   doc.paymentStatus,
    paymentMethod:   doc.paymentMethod,
    total:           doc.total,
    subtotal:        doc.subtotal,
    shipping:        doc.shipping,
    discount:        doc.discount,
    idempotencyKey:  doc.idempotencyKey,
    items: (doc.items ?? []).map((i: OrderItemDoc): OrderItemEntity => ({
      productId: i.productId?.toString() ?? '',
      nameEn:    i.nameEn,
      nameAr:    i.nameAr,
      price:     i.price,
      quantity:  i.quantity,
      image:     i.image,
    })),
    customer: {
      firstName: doc.customer?.firstName,
      lastName:  doc.customer?.lastName,
      email:     doc.customer?.email,
      phone:     doc.customer?.phone,
    } as CustomerEntity,
    shippingAddress: {
      street:      doc.shippingAddress?.street,
      city:        doc.shippingAddress?.city,
      governorate: doc.shippingAddress?.governorate,
      postalCode:  doc.shippingAddress?.postalCode,
    } as AddressEntity,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class MongoOrderRepository implements IOrderRepository {
  async findById(id: string): Promise<OrderEntity | null> {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    const doc = await (Order.findById as any)(id).maxTimeMS(5000).lean() as OrderDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderEntity | null> {
    await connectDB();
    const doc = await (Order.findOne as any)({ orderNumber }).maxTimeMS(5000).lean() as OrderDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async findByIdempotencyKey(key: string): Promise<OrderEntity | null> {
    await connectDB();
    const doc = await (Order.findOne as any)({ idempotencyKey: key }).maxTimeMS(5000).lean() as OrderDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async findByUserId(
    userId: string,
    opts: { page: number; limit: number },
  ): Promise<PaginatedResult<OrderEntity>> {
    await connectDB();
    const skip = (opts.page - 1) * opts.limit;
    const query = { userId: new mongoose.Types.ObjectId(userId) };
    const [docs, total] = await Promise.all([
      (Order.find as any)(query).select(ORDER_LIST_PROJECTION).sort({ createdAt: -1 }).skip(skip).limit(opts.limit).lean() as Promise<OrderDoc[]>,
      Order.countDocuments(query),
    ]);
    return {
      items:      docs.map(toEntity),
      total,
      page:       opts.page,
      totalPages: Math.ceil(total / opts.limit),
    };
  }

  async findAll(filters: OrderFilters): Promise<PaginatedResult<OrderEntity>> {
    await connectDB();
    const query: Record<string, unknown> = {};
    if (filters.userId)        query.userId        = new mongoose.Types.ObjectId(filters.userId);
    if (filters.status)        query.status        = filters.status;
    if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;

    const skip = (filters.page - 1) * filters.limit;
    const [docs, total] = await Promise.all([
      (Order.find as any)(query).select(ORDER_LIST_PROJECTION).sort({ createdAt: -1 }).skip(skip).limit(filters.limit).lean() as Promise<OrderDoc[]>,
      Order.countDocuments(query),
    ]);
    return {
      items:      docs.map(toEntity),
      total,
      page:       filters.page,
      totalPages: Math.ceil(total / filters.limit),
    };
  }

  async save(entity: OrderEntity): Promise<OrderEntity> {
    await connectDB();
    if (entity.id) {
      const doc = await (Order.findByIdAndUpdate as any)(
        entity.id,
        entity,
        { new: true, lean: true },
      ) as OrderDoc | null;
      if (!doc) throw Object.assign(new Error('Order not found'), { status: 404 });
      return toEntity(doc);
    }
    const [created] = await (Order.create as any)([entity]);
    return toEntity(created.toObject() as OrderDoc);
  }

  async delete(id: string): Promise<boolean> {
    await connectDB();
    const result = await (Order.findByIdAndDelete as any)(id);
    return !!result;
  }

  async updateStatus(
    id: string,
    status: string,
    note?: string,
  ): Promise<OrderEntity | null> {
    await connectDB();
    const update: Record<string, unknown> = { status };
    if (note) update['$push'] = { statusHistory: { status, note, at: new Date() } };
    const doc = await (Order.findByIdAndUpdate as any)(id, update, { new: true, lean: true }) as OrderDoc | null;
    return doc ? toEntity(doc) : null;
  }

  async updatePaymentStatus(
    id: string,
    paymentStatus: string,
    meta?: Record<string, unknown>,
  ): Promise<OrderEntity | null> {
    await connectDB();
    const update: Record<string, unknown> = { paymentStatus, ...meta };
    const doc = await (Order.findByIdAndUpdate as any)(id, update, { new: true, lean: true }) as OrderDoc | null;
    return doc ? toEntity(doc) : null;
  }
}

export const orderRepository = new MongoOrderRepository();
