'use client';
// src/app/admin/page.tsx
import { useAnalytics } from '@/hooks/useAnalytics';
import { useUIStore } from '@/store/cartStore';
import type { OrderStatus } from '@/types';

const STATUS_COLOR: Record<OrderStatus, string> = {
  pending:          'bg-amber-100  text-amber-800  dark:bg-amber-900/30  dark:text-amber-300',
  confirmed:        'bg-blue-100   text-blue-800   dark:bg-blue-900/30   dark:text-blue-300',
  processing:       'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  shipped:          'bg-cyan-100   text-cyan-800   dark:bg-cyan-900/30   dark:text-cyan-300',
  out_for_delivery: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300', // ✅ السطر المضاف
  delivered:        'bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-300',
  cancelled:        'bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-300',
};

export default function AdminDashboard() {
  const { lang } = useUIStore();
  const ar = lang === 'ar';
  const { data, isLoading } = useAnalytics();
  const stats = data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">{ar ? 'جاري التحميل...' : 'Loading analytics...'}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label:  ar ? 'الإيرادات' : 'Revenue',
      value:  `EGP ${(stats?.revenue.total ?? 0).toLocaleString()}`,
      change: stats?.revenue.change ?? 0,
      icon:   '💰',
    },
    {
      label:  ar ? 'الطلبات' : 'Orders',
      value:  stats?.orders.total ?? 0,
      change: stats?.orders.change ?? 0,
      icon:   '🧾',
    },
    {
      label:  ar ? 'العملاء' : 'Customers',
      value:  stats?.customers.total ?? 0,
      change: stats?.customers.change ?? 0,
      icon:   '👥',
    },
    {
      label:  ar ? 'المنتجات' : 'Products',
      value:  stats?.products.active ?? 0,
      change: 0,
      icon:   '📦',
    },
  ];

  return (
    <div>
      <h1 className={`text-4xl font-serif mb-8 text-espresso dark:text-cream ${ar ? 'font-bold' : 'font-normal'}`}>
        {ar ? 'لوحة التحكم' : 'Dashboard'}
      </h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(s => (
          <div key={s.label} className="bg-white dark:bg-[#1A1208] border border-sand dark:border-sand/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{s.label}</span>
              <span className="text-2xl">{s.icon}</span>
            </div>
            <div className="text-3xl font-serif font-medium text-espresso dark:text-cream">{s.value}</div>
            {s.change !== 0 && (
              <div className={`text-xs mt-2 font-medium ${s.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                {s.change > 0 ? '↑' : '↓'} {Math.abs(s.change)}% {ar ? 'هذا الشهر' : 'this month'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Revenue Chart (mini bar) */}
      {stats?.revenueChart && stats.revenueChart.length > 0 && (
        <div className="bg-white dark:bg-[#1A1208] border border-sand dark:border-sand/20 rounded-xl p-6 mb-6">
          <h3 className="font-serif text-xl text-espresso dark:text-cream mb-4">
            {ar ? 'الإيرادات — آخر ٣٠ يوم' : 'Revenue — Last 30 Days'}
          </h3>
          <div className="flex items-end gap-1 h-24">
            {stats.revenueChart.slice(-20).map((d, i) => {
              const max = Math.max(...stats.revenueChart.map(x => x.revenue));
              const pct = max > 0 ? (d.revenue / max) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 bg-gold/80 hover:bg-gold rounded-t transition-all cursor-pointer group relative"
                  style={{ height: `${Math.max(4, pct)}%` }}
                  title={`${d.date}: EGP ${d.revenue.toLocaleString()}`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-espresso text-cream text-[10px] rounded px-2 py-1 whitespace-nowrap z-10">
                    EGP {d.revenue.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white dark:bg-[#1A1208] border border-sand dark:border-sand/20 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-sand dark:border-sand/20 flex justify-between items-center">
            <h3 className="font-serif text-xl text-espresso dark:text-cream">
              {ar ? 'أحدث الطلبات' : 'Recent Orders'}
            </h3>
            <a href="/admin/orders" className="text-sm text-gold hover:underline">
              {ar ? 'عرض الكل' : 'View all'}
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-sand-light/50 dark:bg-white/5">
                  {[ar?'الطلب':'Order', ar?'العميل':'Customer', ar?'الإجمالي':'Total', ar?'الحالة':'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats?.recentOrders?.slice(0,8).map(o => (
                  <tr key={o._id} className="border-t border-sand/50 hover:bg-sand-light/30 dark:hover:bg-white/3 transition-colors">
                    <td className="px-4 py-3 font-semibold text-sm text-espresso dark:text-cream">{o.orderNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{o.customer?.firstName} {o.customer?.lastName}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gold">EGP {o.total?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[o.status]}`}>
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Orders by Status */}
        <div className="bg-white dark:bg-[#1A1208] border border-sand dark:border-sand/20 rounded-xl p-6">
          <h3 className="font-serif text-xl text-espresso dark:text-cream mb-4">
            {ar ? 'حالة الطلبات' : 'Order Status'}
          </h3>
          {stats?.ordersByStatus && Object.entries(stats.ordersByStatus).map(([status, count]) => (
            <div key={status} className="flex items-center justify-between py-2.5 border-b border-sand/40 last:border-0">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[status as OrderStatus]}`}>
                  {status}
                </span>
              </div>
              <span className="font-semibold text-espresso dark:text-cream">{count}</span>
            </div>
          ))}

          {/* Top Products */}
          {stats?.topProducts && stats.topProducts.length > 0 && (
            <>
              <h3 className="font-serif text-xl text-espresso dark:text-cream mt-6 mb-4">
                {ar ? 'أفضل المنتجات' : 'Top Products'}
              </h3>
              {stats.topProducts.map((tp, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-sand/40 last:border-0">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-sand-light flex-shrink-0">
                    {tp.product?.images?.[0] && (
                      <img src={tp.product.images[0]} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-espresso dark:text-cream truncate">
                      {lang === 'ar' ? tp.product?.nameAr : tp.product?.nameEn}
                    </div>
                    <div className="text-xs text-gray-400">{tp.sold} sold</div>
                  </div>
                  <div className="text-sm font-semibold text-gold flex-shrink-0">
                    EGP {tp.revenue?.toLocaleString()}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
