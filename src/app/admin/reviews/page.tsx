'use client';
// src/... — HemaV050: admin review moderation panel
import { useState } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/fetchWithCsrf';
import { useUIStore } from '@/store/cartStore';
import toast from 'react-hot-toast';

interface Review {
  _id:               string;
  productId:         string;
  userId:            string;
  userName:          string;
  rating:            number;
  title?:            string;
  body:              string;
  isApproved:        boolean;
  isVerifiedPurchase:boolean;
  createdAt:         string;
  product?:          { nameEn: string; nameAr: string; slug: string };
}

const fetcher = (u: string) => fetch(u).then(r => r.json());

function Stars({ value }: { value: number }) {
  return (
    <span className="text-gold text-sm">
      {'★'.repeat(value)}{'☆'.repeat(5 - value)}
    </span>
  );
}

export default function AdminReviews() {
  const { lang } = useUIStore();
  const ar = lang === 'ar';

  const [page,   setPage]   = useState(1);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');

  const buildUrl = () => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (filter === 'pending')  params.set('approved', 'false');
    if (filter === 'approved') params.set('approved', 'true');
    return `/api/v1/admin/reviews?${params}`;
  };

  const { data, mutate, isLoading } = useSWR(buildUrl(), fetcher);
  const reviews: Review[] = data?.data?.reviews ?? [];
  const total:   number   = data?.data?.pagination?.total ?? 0;
  const pages:   number   = data?.data?.pagination?.pages ?? 1;

  const handleApprove = async (id: string, approve: boolean) => {
    try {
      const res = await apiFetch(`/api/v1/admin/reviews/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isApproved: approve }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(approve
          ? (ar ? 'تمت الموافقة على المراجعة' : 'Review approved')
          : (ar ? 'تم رفض المراجعة'           : 'Review hidden'));
        mutate();
      } else {
        toast.error(json.error ?? 'Error');
      }
    } catch {
      toast.error(ar ? 'حدث خطأ' : 'Network error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(ar ? 'هل أنت متأكد من الحذف؟' : 'Delete this review?')) return;
    try {
      const res = await apiFetch(`/api/v1/reviews/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        toast.success(ar ? 'تم حذف المراجعة' : 'Review deleted');
        mutate();
      } else {
        toast.error(json.error ?? 'Error');
      }
    } catch {
      toast.error(ar ? 'حدث خطأ' : 'Network error');
    }
  };

  return (
    <div className={`p-6 max-w-6xl mx-auto ${ar ? 'rtl font-arabic' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-espresso dark:text-cream">
            {ar ? 'إدارة المراجعات' : 'Review Management'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {ar ? `${total} مراجعة` : `${total} reviews`}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 bg-sand-light dark:bg-white/5 rounded-lg p-1">
          {(['all', 'pending', 'approved'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-white dark:bg-espresso text-espresso dark:text-cream shadow-sm'
                  : 'text-gray-500 hover:text-espresso dark:hover:text-cream'
              }`}
            >
              {f === 'all'      ? (ar ? 'الكل'             : 'All')      : null}
              {f === 'pending'  ? (ar ? 'قيد الانتظار'      : 'Pending')  : null}
              {f === 'approved' ? (ar ? 'موافق عليها'       : 'Approved') : null}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-gold border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && reviews.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          {ar ? 'لا توجد مراجعات في هذه الفئة' : 'No reviews in this category'}
        </div>
      )}

      {/* Reviews table */}
      {!isLoading && reviews.length > 0 && (
        <div className="bg-white dark:bg-[#1A1208] rounded-2xl border border-sand dark:border-sand/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand-light dark:bg-white/5 border-b border-sand dark:border-sand/20">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">{ar ? 'المستخدم' : 'User'}</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">{ar ? 'المنتج' : 'Product'}</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">{ar ? 'التقييم' : 'Rating'}</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">{ar ? 'المحتوى' : 'Content'}</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">{ar ? 'الحالة' : 'Status'}</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">{ar ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand dark:divide-sand/20">
              {reviews.map(review => (
                <tr key={review._id} className="hover:bg-sand-light/50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-espresso dark:text-cream">{review.userName}</div>
                    {review.isVerifiedPurchase && (
                      <span className="text-xs text-green-500">✓ {ar ? 'شراء موثق' : 'Verified'}</span>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(review.createdAt).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-espresso dark:text-cream max-w-[120px] truncate">
                      {review.product ? (ar ? review.product.nameAr : review.product.nameEn) : review.productId}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Stars value={review.rating} />
                    <div className="text-xs text-gray-400">{review.rating}/5</div>
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    {review.title && (
                      <div className="font-medium text-espresso dark:text-cream text-xs mb-0.5 truncate">{review.title}</div>
                    )}
                    <div className="text-gray-500 text-xs line-clamp-2">{review.body}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      review.isApproved
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {review.isApproved
                        ? (ar ? 'موافق عليها' : 'Approved')
                        : (ar ? 'قيد الانتظار' : 'Pending')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {!review.isApproved ? (
                        <button
                          onClick={() => handleApprove(review._id, true)}
                          className="text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded-lg transition-colors"
                        >
                          {ar ? 'موافقة' : 'Approve'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApprove(review._id, false)}
                          className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded-lg transition-colors"
                        >
                          {ar ? 'إخفاء' : 'Hide'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(review._id)}
                        className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-lg transition-colors"
                      >
                        {ar ? 'حذف' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center gap-3 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 text-sm border border-sand rounded-lg disabled:opacity-40 hover:bg-sand-light transition-colors">
            {ar ? 'السابق' : 'Prev'}
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">
            {page} / {pages}
          </span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            className="px-4 py-2 text-sm border border-sand rounded-lg disabled:opacity-40 hover:bg-sand-light transition-colors">
            {ar ? 'التالي' : 'Next'}
          </button>
        </div>
      )}
    </div>
  );
}
