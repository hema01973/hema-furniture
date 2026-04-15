// src/app/api/analytics/route.ts — admin dashboard stats
import { NextRequest } from 'next/server';
import { connectDB, Order, Product, User } from '@/lib/mongodb';
import { ok, withErrorHandler, withAuth } from '@/lib/api';
import type { OrderStatus } from '@/types';

export const GET = withErrorHandler(async (req: NextRequest) => {
  return withAuth(req, async () => {
    await connectDB();
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevE = new Date(now.getFullYear(), now.getMonth(), 0);

    const [curRevAgg, curOrders, curCust, prevRevAgg, prevOrders, totalProds,
           recentOrders, ordersByStatus, topProducts, revenueChart] = await Promise.all([
      Order.aggregate([{ $match:{ createdAt:{$gte:start}, status:{$ne:'cancelled'} } },{ $group:{_id:null,total:{$sum:'$total'}} }]),
      Order.countDocuments({ createdAt:{$gte:start} }),
      User.countDocuments({ createdAt:{$gte:start}, role:'customer' }),
      Order.aggregate([{ $match:{ createdAt:{$gte:prevM,$lte:prevE}, status:{$ne:'cancelled'} } },{ $group:{_id:null,total:{$sum:'$total'}} }]),
      Order.countDocuments({ createdAt:{$gte:prevM,$lte:prevE} }),
      Product.countDocuments({ isActive:true }),
      Order.find().sort({ createdAt:-1 }).limit(10).lean(),
      Order.aggregate([{ $group:{ _id:'$status', count:{$sum:1} } }]),
      Order.aggregate([
        { $unwind:'$items' },
        { $group:{ _id:'$items.productId', sold:{$sum:'$items.quantity'}, revenue:{$sum:{$multiply:['$items.price','$items.quantity']}} } },
        { $sort:{revenue:-1} },{ $limit:5 },
        { $lookup:{ from:'products', localField:'_id', foreignField:'_id', as:'product' } },
        { $unwind:'$product' },
      ]),
      Order.aggregate([
        { $match:{ createdAt:{$gte:new Date(Date.now()-30*24*3600000)}, status:{$ne:'cancelled'} } },
        { $group:{ _id:{$dateToString:{format:'%Y-%m-%d',date:'$createdAt'}}, revenue:{$sum:'$total'}, orders:{$sum:1} } },
        { $sort:{_id:1} },
      ]),
    ]);

    const curRev  = curRevAgg[0]?.total  ?? 0;
    const prevRev = prevRevAgg[0]?.total ?? 0;
    const statusMap: Record<string,number> = {};
    ordersByStatus.forEach((s: { _id: string; count: number }) => { statusMap[s._id] = s.count; });

    return ok({
      revenue:   { total:curRev, change: prevRev>0?Math.round(((curRev-prevRev)/prevRev)*100):0 },
      orders:    { total:curOrders, change: prevOrders>0?Math.round(((curOrders-prevOrders)/prevOrders)*100):0 },
      customers: { total:curCust, change:0 },
      products:  { total:totalProds, active:totalProds },
      recentOrders,
      topProducts,
      revenueChart: revenueChart.map((d: { _id: string; revenue: number; orders: number }) => ({ date:d._id, revenue:d.revenue, orders:d.orders })),
      ordersByStatus: statusMap as Record<OrderStatus,number>,
    });
  }, ['admin','staff']);
});
