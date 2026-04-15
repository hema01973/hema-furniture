'use client';
// src/components/product/ProductDetailPage.tsx — with reviews
import { useState } from 'react';
import useSWR from 'swr';
import Image from 'next/image';
import Link from 'next/link';
import { useCartStore, useWishlistStore } from '@/store/cartStore';
import toast from 'react-hot-toast';
import ReviewsSection from './ReviewsSection';
import type { IProduct } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function ProductDetailPage({ slug }: { slug: string }) {
  const { data, isLoading } = useSWR<{ success: boolean; data: IProduct }>(`/api/products/${slug}`, fetcher);
  const p = data?.data;
  const [qty, setQty]   = useState(1);
  const [tab, setTab]   = useState(0);
  const [img, setImg]   = useState(0);
  const addItem         = useCartStore(s => s.addItem);
  const { toggle, has } = useWishlistStore();

  if (isLoading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-10 h-10 border-4 border-[#B8935A] border-t-transparent rounded-full animate-spin"/></div>;
  if (!p)        return <div className="min-h-[60vh] flex items-center justify-center text-gray-400 font-serif text-xl">Product not found</div>;

  const disc = p.oldPrice ? Math.round((1 - p.price/p.oldPrice)*100) : 0;
  const tabs = [
    { label: 'Description',    body: <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{p.descEn}</p> },
    { label: 'Specifications', body: (
        <div className="grid grid-cols-2 gap-3">
          {[['Dimensions', p.dimensions ? `${p.dimensions.width}×${p.dimensions.depth}×${p.dimensions.height} ${p.dimensions.unit}` : 'N/A'],
            ['Weight', p.weight ? `${p.weight} kg` : 'N/A'],
            ['Material', p.material ?? 'N/A'],
            ['Warranty', `${p.warrantyYears ?? 1} year(s)`],
            ['SKU', p.sku], ['Brand', p.brand ?? 'Hema']
          ].map(([l,v]) => (
            <div key={l} className="bg-[#F2EDE6] dark:bg-white/5 rounded-xl p-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{l}</div>
              <div className="text-sm font-medium text-[#1A1208] dark:text-[#F0EBE2]">{v}</div>
            </div>
          ))}
        </div>
      )
    },
    { label: 'Shipping', body: <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">Free shipping on orders over EGP 5,000. Delivery 5–7 working days in Cairo, 10–14 days other governorates. Free returns within 14 days.</p> },
  ];

  return (
    <div className="bg-[#FAF8F5] dark:bg-[#0E0904] min-h-screen">
      {/* Breadcrumb */}
      <div className="bg-[#F2EDE6] dark:bg-[#1A1208] border-b border-[#E8DDD0] dark:border-[#2A1F14] py-3 px-6">
        <div className="max-w-[1200px] mx-auto flex items-center gap-2 text-sm text-gray-400 flex-wrap">
          <Link href="/" className="hover:text-[#B8935A]">Home</Link><span>/</span>
          <Link href="/shop" className="hover:text-[#B8935A]">Shop</Link><span>/</span>
          <span className="text-[#1A1208] dark:text-[#F0EBE2] font-medium">{p.nameEn}</span>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-14 mb-16">
          {/* Gallery */}
          <div>
            <div className="relative h-[460px] bg-[#F2EDE6] dark:bg-[#221710] rounded-2xl overflow-hidden mb-3 border border-[#E8DDD0] dark:border-[#2A1F14] cursor-zoom-in">
              {p.images?.[img] ? <Image src={p.images[img]} alt={p.nameEn} fill className="object-cover" sizes="600px" priority/> : <div className="w-full h-full flex items-center justify-center text-8xl">🛋️</div>}
            </div>
            <div className="flex gap-2 flex-wrap">
              {p.images?.slice(0,5).map((src,i) => (
                <button key={i} onClick={() => setImg(i)} className={`w-[72px] h-[72px] rounded-xl overflow-hidden border-2 transition-all ${img===i?'border-[#B8935A]':'border-[#E8DDD0] dark:border-[#2A1F14]'}`}>
                  <Image src={src} alt="" width={72} height={72} className="w-full h-full object-cover"/>
                </button>
              ))}
            </div>
          </div>

          {/* Info */}
          <div>
            {p.badge && <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-3 ${p.badge==='Sale'?'bg-red-500 text-white':'bg-[#B8935A] text-white'}`}>{p.badge==='Sale'?`${disc}% OFF`:p.badge}</span>}
            <h1 className="font-serif text-4xl font-normal text-[#1A1208] dark:text-[#F0EBE2] mb-3 leading-tight">{p.nameEn}</h1>
            <div className="flex items-center gap-3 mb-4 text-sm flex-wrap">
              <span className="text-[#B8935A] tracking-wider">{'★'.repeat(Math.round(p.rating))}</span>
              <span className="text-gray-400">({p.reviewCount} reviews)</span>
              <span className={`font-medium ${p.stock>0?'text-green-600':'text-red-500'}`}>• {p.stock>0?`✓ In Stock (${p.stock})`:'✗ Out of Stock'}</span>
            </div>
            <div className="flex items-baseline gap-3 mb-5">
              <span className="font-serif text-4xl text-[#B8935A] font-medium">EGP {p.price.toLocaleString()}</span>
              {p.oldPrice && <span className="text-xl text-gray-400 line-through">EGP {p.oldPrice.toLocaleString()}</span>}
            </div>
            {p.colors?.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Color</div>
                <div className="flex gap-2">{p.colors.map(c => <div key={c} className="w-7 h-7 rounded-full border-2 border-white shadow-md cursor-pointer hover:scale-110 transition-transform" style={{background:c}} title={c}/>)}</div>
              </div>
            )}
            <div className="bg-[#F2EDE6] dark:bg-white/5 rounded-xl p-4 mb-5 text-sm text-[#6B7F6A]">
              ✓ {p.stock>0?'In Stock':'Out of Stock'} &nbsp;·&nbsp; ✓ Free shipping over EGP 5,000 &nbsp;·&nbsp; 🛡️ {p.warrantyYears??1} Year Warranty
            </div>
            <div className="flex items-center gap-4 mb-5">
              <span className="text-sm text-gray-500">Quantity:</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(q => Math.max(1,q-1))} className="w-9 h-9 rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] flex items-center justify-center text-lg hover:bg-[#F2EDE6] dark:hover:bg-white/5 transition-colors">−</button>
                <span className="w-10 text-center font-semibold text-[#1A1208] dark:text-[#F0EBE2]">{qty}</span>
                <button onClick={() => setQty(q => Math.min(p.stock,q+1))} className="w-9 h-9 rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] flex items-center justify-center text-lg hover:bg-[#F2EDE6] dark:hover:bg-white/5 transition-colors">+</button>
              </div>
            </div>
            <div className="flex gap-3 mb-8">
              <button onClick={() => { addItem(p, qty); toast.success(`${p.nameEn} added to cart`, { icon: '🛒' }); }} disabled={p.stock===0}
                className="flex-1 bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {p.stock===0?'Out of Stock':'Add to Cart'}
              </button>
              <button onClick={() => toggle(p._id)} className={`w-14 h-[52px] rounded-xl border-2 flex items-center justify-center text-xl transition-all ${has(p._id)?'border-red-400 text-red-500 bg-red-50 dark:bg-red-900/20':'border-[#E8DDD0] dark:border-[#2A1F14] text-gray-300 hover:border-red-300 hover:text-red-400'}`}>
                {has(p._id)?'♥':'♡'}
              </button>
            </div>
            <div className="border-t border-[#E8DDD0] dark:border-[#2A1F14] pt-6">
              <div className="flex gap-2 mb-5 flex-wrap">
                {tabs.map((tb,i) => <button key={i} onClick={() => setTab(i)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===i?'bg-[#B8935A] text-white':'bg-[#F2EDE6] dark:bg-white/5 text-gray-500 hover:bg-[#E8DDD0]'}`}>{tb.label}</button>)}
              </div>
              <div className="text-sm leading-relaxed">{tabs[tab].body}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews fully integrated */}
      <ReviewsSection productId={p._id} />
    </div>
  );
}
