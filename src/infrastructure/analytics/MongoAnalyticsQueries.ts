// src/infrastructure/analytics/MongoAnalyticsQueries.ts — HemaV050
// Encapsulates all aggregation pipeline queries behind a clean interface.
// analytics.service.ts imports from here — no direct model access in the service layer.

import { connectDB, Order, Product, User } from '@/lib/mongodb';
import type { DashboardStats, OrderStatus } from '@/types';

// ── Internal result types ─────────────────────────────────────────────────────

interface RevAggResult {
  _id:   null;
  total: number;
}

interface StatusAggResult {
  _id:   string;
  count: number;
}

interface TopProductAggResult {
  _id:     unknown;
  sold:    number;
  revenue: number;
  product: {
    nameEn: string;
    nameAr: string;
    images?: string[];
  };
}

interface RevenueChartAggResult {
  _id:     string;
  revenue: number;
  orders:  number;
}

// ── Query functions ────────────────────────────────────────────────────────────

/** Fetch all data required for the admin dashboard in parallel. */
export async function fetchDashboardData(): Promise<DashboardStats> {
  await connectDB();

  const now    = new Date();
  const startM = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevM  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevE  = new Date(now.getFullYear(), now.getMonth(), 0);
  const last30 = new Date(Date.now() - 30 * 24 * 3600_000);

  const [
    curRevAgg, curOrders, curCust,
    prevRevAgg, prevOrders,
    totalProds, recentOrders, ordersByStatus,
    topProducts, revenueChart,
  ] = await Promise.all([
    Order.aggregate<RevAggResult>([
      { $match: { createdAt: { $gte: startM }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Order.countDocuments({ createdAt: { $gte: startM } }),
    User.countDocuments({ createdAt: { $gte: startM }, role: 'customer' }),
    Order.aggregate<RevAggResult>([
      { $match: { createdAt: { $gte: prevM, $lte: prevE }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Order.countDocuments({ createdAt: { $gte: prevM, $lte: prevE } }),
    Product.countDocuments({ isActive: true }),
    (Order.find as any)({ status: { $nin: ['cancelled'] }, paymentStatus: { $ne: 'failed' } })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    Order.aggregate<StatusAggResult>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate<TopProductAggResult>([
      { $unwind: '$items' },
      { $group: {
          _id:     '$items.productId',
          sold:    { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
      }},
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
    ]),
    Order.aggregate<RevenueChartAggResult>([
      { $match: { createdAt: { $gte: last30 }, status: { $ne: 'cancelled' } } },
      { $group: {
          _id:     { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders:  { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]),
  ]);

  const curRev  = (curRevAgg[0] as RevAggResult | undefined)?.total  ?? 0;
  const prevRev = (prevRevAgg[0] as RevAggResult | undefined)?.total ?? 0;

  const statusMap: Record<string, number> = {};
  ordersByStatus.forEach(s => { statusMap[s._id] = s.count; });

  return {
    revenue:   { total: curRev,    change: prevRev > 0 ? Math.round(((curRev - prevRev) / prevRev) * 100) : 0 },
    orders:    { total: curOrders, change: prevOrders > 0 ? Math.round(((curOrders - prevOrders) / prevOrders) * 100) : 0 },
    customers: { total: curCust,   change: 0 },
    products:  { total: totalProds, active: totalProds },
    recentOrders: recentOrders as unknown as DashboardStats['recentOrders'],
    topProducts:  topProducts  as unknown as DashboardStats['topProducts'],
    revenueChart: revenueChart.map(d => ({ date: d._id, revenue: d.revenue, orders: d.orders })),
    ordersByStatus: statusMap as Record<OrderStatus, number>,
  };
}
