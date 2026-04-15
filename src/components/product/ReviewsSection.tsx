'use client';
// src/components/product/ReviewsSection.tsx
import { useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import type { IReview } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange?.(n)}
          className={`text-2xl transition-colors ${n <= (hover || value) ? 'text-[#B8935A]' : 'text-gray-300'} ${!onChange ? 'cursor-default' : 'cursor-pointer'}`}>
          ★
        </button>
      ))}
    </div>
  );
}

export default function ReviewsSection({ productId }: { productId: string }) {
  const { data: session } = useSession();
  const { data, mutate }  = useSWR<{ success: boolean; data: { reviews: IReview[]; pagination: { total: number } } }>(
    `/api/reviews?productId=${productId}&limit=10`, fetcher
  );
  const reviews = data?.data?.reviews ?? [];
  const total   = data?.data?.pagination?.total ?? 0;

  const [form, setForm]     = useState({ rating: 0, title: '', body: '' });
  const [submitting, setSub]= useState(false);
  const [showForm, setShow] = useState(false);

  const avgRating = reviews.length
    ? (reviews.reduce((s,r) => s+r.rating, 0) / reviews.length).toFixed(1)
    : '—';

  const ratingDist = [5,4,3,2,1].map(n => ({
    n, pct: reviews.length ? Math.round(reviews.filter(r => r.rating===n).length/reviews.length*100) : 0,
    count: reviews.filter(r => r.rating===n).length,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rating) { toast.error('Please select a star rating'); return; }
    if (form.body.length < 10) { toast.error('Review must be at least 10 characters'); return; }
    setSub(true);
    try {
      const res  = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, ...form }) });
      const json = await res.json();
      if (json.success) { toast.success('Review submitted!'); setForm({ rating:0, title:'', body:'' }); setShow(false); mutate(); }
      else              toast.error(json.error ?? 'Failed');
    } catch { toast.error('Network error'); }
    setSub(false);
  };

  return (
    <section className="max-w-[1200px] mx-auto px-6 py-12 border-t border-[#E8DDD0] dark:border-[#2A1F14]">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <h2 className="font-serif text-3xl text-[#1A1208] dark:text-[#F0EBE2]">
          Customer Reviews <span className="text-gray-400 text-xl font-sans">({total})</span>
        </h2>
        {session && !showForm && (
          <button onClick={() => setShow(true)} className="bg-[#B8935A] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#D4B07A] transition-colors">Write a Review</button>
        )}
        {!session && <a href="/login" className="text-[#B8935A] text-sm hover:underline">Sign in to review</a>}
      </div>

      {/* Rating summary */}
      {reviews.length > 0 && (
        <div className="bg-[#F2EDE6] dark:bg-[#1A1208] rounded-2xl p-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-center">
            <div className="font-serif text-6xl text-[#B8935A] font-medium">{avgRating}</div>
            <div className="text-[#B8935A] text-xl mt-1">{'★'.repeat(Math.round(parseFloat(avgRating || '0')))}</div>
            <div className="text-sm text-gray-400 mt-1">out of 5</div>
          </div>
          <div className="flex flex-col justify-center gap-2">
            {ratingDist.map(({ n, pct, count }) => (
              <div key={n} className="flex items-center gap-3 text-sm">
                <span className="w-4 text-right text-gray-500">{n}</span>
                <span className="text-[#B8935A] text-xs">★</span>
                <div className="flex-1 h-2 bg-[#E8DDD0] dark:bg-[#2A1F14] rounded-full overflow-hidden">
                  <div className="h-full bg-[#B8935A] rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-5 text-gray-400 text-xs">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Write review form */}
      {showForm && session && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 mb-8">
          <h3 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-4">Your Review</h3>
          <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Rating *</label>
            <Stars value={form.rating} onChange={v => setForm(p => ({ ...p, rating: v }))} />
          </div>
          <div className="mb-4"><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title</label>
            <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Summarize your experience" maxLength={100}
              className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A]" />
          </div>
          <div className="mb-5"><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Review *</label>
            <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} rows={4} placeholder="Min 10 characters..." maxLength={2000}
              className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] resize-none" />
            <div className="text-xs text-gray-400 mt-1 text-right">{form.body.length}/2000</div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting} className="bg-[#B8935A] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#D4B07A] transition-colors disabled:opacity-60 flex items-center gap-2">
              {submitting ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>Submitting...</> : 'Submit Review'}
            </button>
            <button type="button" onClick={() => setShow(false)} className="border border-[#E8DDD0] dark:border-[#2A1F14] text-gray-500 px-6 py-2.5 rounded-xl text-sm hover:bg-[#F2EDE6] transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {/* Reviews list */}
      {reviews.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-3">⭐</div><p>No reviews yet. Be the first!</p></div>
      ) : (
        <div className="space-y-5">
          {reviews.map(r => (
            <div key={r._id} className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6">
              <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#B8935A] flex items-center justify-center text-white font-bold text-sm">{r.userName[0]?.toUpperCase()}</div>
                  <div><div className="font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2]">{r.userName}</div>
                    <div className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#B8935A] tracking-wide">{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</span>
                  {r.isVerifiedPurchase && <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">✓ Verified</span>}
                </div>
              </div>
              {r.title && <div className="font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2] mb-1">{r.title}</div>}
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{r.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
