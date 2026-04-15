'use client';
// src/components/home/HomePage.tsx
import Link from 'next/link';
import Image from 'next/image';
import useSWR from 'swr';
import { useCartStore, useWishlistStore } from '@/store/cartStore';
import toast from 'react-hot-toast';
import type { IProduct } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());

export default function HomePage() {
  const { data } = useSWR<{ success: boolean; data: { products: IProduct[] } }>('/api/products?featured=true&limit=8', fetcher);
  const products  = data?.data?.products ?? [];
  const addItem   = useCartStore(s => s.addItem);
  const { toggle: toggleWL, has: isWL } = useWishlistStore();

  const cats = [
    { key: 'living',  icon: '🛋️', label: 'Living Room' },
    { key: 'bedroom', icon: '🛏️', label: 'Bedroom'     },
    { key: 'dining',  icon: '🍽️', label: 'Dining Room' },
    { key: 'office',  icon: '💼', label: 'Office'       },
    { key: 'outdoor', icon: '🌿', label: 'Outdoor'      },
  ];

  const testimonials = [
    { name: 'Ahmed Hassan',  loc: 'Cairo',     text: 'Exceptional quality and stunning design. The sofa exceeded every expectation.'           },
    { name: 'Sara Mohamed',  loc: 'Alexandria',text: 'Excellent service and fast delivery. The furniture looks even better in person.'         },
    { name: 'Khaled Ali',    loc: 'New Cairo', text: 'A fantastic investment. Every piece crafted with remarkable skill and attention to detail.' },
  ];

  return (
    <div className="bg-[#FAF8F5] dark:bg-[#0E0904]">
      {/* HERO */}
      <section className="min-h-[88vh] bg-gradient-to-br from-[#190F07] via-[#2B1B0E] to-[#4A2E1A] flex items-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="absolute right-0 top-0 bottom-0 w-5/12 overflow-hidden hidden lg:block">
          <Image src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80" alt="Premium Furniture" fill className="object-cover opacity-40 mix-blend-luminosity" sizes="45vw" priority />
          <div className="absolute inset-0 bg-gradient-to-r from-[#190F07] via-[#190F07]/40 to-transparent" />
        </div>
        <div className="max-w-[1200px] mx-auto px-6 py-20 relative z-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-px bg-[#B8935A]" />
              <span className="text-[#D4B07A] text-xs font-semibold tracking-[4px] uppercase">Premium Furniture Since 2010</span>
              <div className="w-8 h-px bg-[#B8935A]" />
            </div>
            <h1 className="font-serif text-6xl md:text-7xl text-[#FAF8F5] font-normal leading-[1.05] mb-6">
              Where Comfort<br/><em className="text-[#D4B07A]">Meets Elegance</em>
            </h1>
            <p className="text-[#B8A898] text-lg leading-relaxed mb-10 max-w-xl">
              Discover our curated collection of modern furniture, crafted for the way you live — beautiful, durable, and authentically Egyptian.
            </p>
            <div className="flex gap-4 flex-wrap">
              <Link href="/shop" className="bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-8 py-4 rounded-xl transition-all hover:translate-y-[-1px] hover:shadow-lg">Shop Now</Link>
              <Link href="/about" className="border-2 border-white/20 hover:border-white/40 text-[#FAF8F5] font-semibold px-8 py-4 rounded-xl transition-all hover:bg-white/5">Our Story</Link>
            </div>
            <div className="flex gap-10 mt-14 pt-10 border-t border-white/10">
              {[['500+','Unique Pieces'],['15+','Years Experience'],['10K+','Happy Clients']].map(([n,l]) => (
                <div key={l}><div className="font-serif text-3xl text-[#D4B07A] font-medium">{n}</div><div className="text-xs text-[#8A7868] mt-1 tracking-wide">{l}</div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="bg-[#F2EDE6] dark:bg-[#1A1208] py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-3"><div className="w-6 h-px bg-[#B8935A]"/><span className="text-[#B8935A] text-xs font-semibold tracking-[3px] uppercase">Explore</span><div className="w-6 h-px bg-[#B8935A]"/></div>
            <h2 className="font-serif text-4xl text-[#1A1208] dark:text-[#F0EBE2] font-normal">Our Collections</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {cats.map(c => (
              <Link key={c.key} href={`/shop?category=${c.key}`}
                className="bg-white dark:bg-[#221710] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-7 text-center hover:border-[#B8935A] hover:-translate-y-1 hover:shadow-md transition-all duration-300 group">
                <span className="text-4xl block mb-3">{c.icon}</span>
                <div className="font-medium text-sm text-[#1A1208] dark:text-[#F0EBE2] group-hover:text-[#B8935A] transition-colors">{c.label}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-end justify-between mb-12">
            <div>
              <div className="flex items-center gap-3 mb-3"><div className="w-6 h-px bg-[#B8935A]"/><span className="text-[#B8935A] text-xs font-semibold tracking-[3px] uppercase">Handpicked</span></div>
              <h2 className="font-serif text-4xl text-[#1A1208] dark:text-[#F0EBE2] font-normal">Featured Products</h2>
            </div>
            <Link href="/shop" className="border border-[#E8DDD0] dark:border-[#2A1F14] text-[#1A1208] dark:text-[#F0EBE2] hover:border-[#B8935A] hover:text-[#B8935A] font-medium px-5 py-2.5 rounded-xl transition-all text-sm hidden sm:block">View All →</Link>
          </div>
          {products.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">{Array.from({length:8}).map((_,i)=><div key={i} className="bg-white dark:bg-[#1A1208] rounded-2xl h-72 animate-pulse border border-[#E8DDD0] dark:border-[#2A1F14]"/>)}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {products.map((p: IProduct) => {
                const disc = p.oldPrice ? Math.round((1-p.price/p.oldPrice)*100) : 0;
                const wished = isWL(p._id);
                return (
                  <div key={p._id} className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col">
                    <Link href={`/product/${p.slug}`} className="block relative h-52 bg-[#F2EDE6] dark:bg-[#221710] overflow-hidden group">
                      {p.images?.[0] ? <Image src={p.images[0]} alt={p.nameEn} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="300px"/> : <div className="w-full h-full flex items-center justify-center text-6xl">🛋️</div>}
                      {p.badge && <span className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-bold ${p.badge==='Sale'?'bg-red-500 text-white':p.badge==='New'?'bg-[#6B7F6A] text-white':'bg-[#B8935A] text-white'}`}>{p.badge==='Sale'?`${disc}% OFF`:p.badge}</span>}
                      <button onClick={e=>{e.preventDefault();toggleWL(p._id);}} className={`absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-sm transition-all ${wished?'text-red-500':'text-gray-300 hover:text-red-400'}`}>{wished?'♥':'♡'}</button>
                    </Link>
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="text-xs text-[#B8935A] mb-1">{'★'.repeat(Math.round(p.rating))} <span className="text-gray-400">({p.reviewCount})</span></div>
                      <Link href={`/product/${p.slug}`} className="font-serif text-base font-medium text-[#1A1208] dark:text-[#F0EBE2] mb-1 hover:text-[#B8935A] line-clamp-2 leading-snug transition-colors">{p.nameEn}</Link>
                      <div className="flex items-baseline gap-2 mb-3 mt-auto"><span className="font-bold text-[#B8935A]">EGP {p.price.toLocaleString()}</span>{p.oldPrice&&<span className="text-xs text-gray-400 line-through">EGP {p.oldPrice.toLocaleString()}</span>}</div>
                      <button onClick={()=>{addItem(p);toast.success(`${p.nameEn} added`,{icon:'🛒'});}} disabled={p.stock===0} className="w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">{p.stock===0?'Out of Stock':'Add to Cart'}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* PROMO BANNER */}
      <section className="bg-gradient-to-br from-[#2E1C0F] to-[#4A2E1A] py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-serif text-5xl text-[#FAF8F5] font-normal mb-4">Spring 2026 Collection</h2>
          <p className="text-[#B8A090] text-lg mb-8">New arrivals with up to 30% off — Limited time offer</p>
          <Link href="/shop?badge=Sale" className="inline-block bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-10 py-4 rounded-xl transition-all hover:translate-y-[-1px]">Shop the Sale</Link>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-[#F2EDE6] dark:bg-[#1A1208] py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-3"><div className="w-6 h-px bg-[#B8935A]"/><span className="text-[#B8935A] text-xs font-semibold tracking-[3px] uppercase">Reviews</span><div className="w-6 h-px bg-[#B8935A]"/></div>
            <h2 className="font-serif text-4xl text-[#1A1208] dark:text-[#F0EBE2] font-normal">What Our Clients Say</h2>
            <p className="text-gray-400 text-sm mt-2">Over 10,000 satisfied clients</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t,i) => (
              <div key={i} className="bg-white dark:bg-[#221710] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-7">
                <div className="text-[#B8935A] text-base mb-4 tracking-widest">★★★★★</div>
                <p className="font-serif text-lg text-[#1A1208] dark:text-[#F0EBE2] leading-relaxed italic mb-5">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#B8935A] flex items-center justify-center text-white font-bold">{t.name[0]}</div>
                  <div><div className="font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2]">{t.name}</div><div className="text-xs text-gray-400">📍 {t.loc}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="bg-gradient-to-br from-[#190F07] to-[#3A2010] py-20 px-6 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="font-serif text-4xl text-[#FAF8F5] font-normal mb-3">Stay Inspired</h2>
          <p className="text-[#B8A090] text-sm mb-8">Exclusive deals and new arrivals, straight to your inbox.</p>
          <div className="flex gap-3 max-w-md mx-auto">
            <input type="email" placeholder="Your email address" className="flex-1 bg-white/10 border border-white/15 text-[#FAF8F5] placeholder-[#8A7060] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#B8935A] min-w-0"/>
            <button onClick={()=>toast.success('Subscribed! ✓',{icon:'📧'})} className="bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-6 py-3 rounded-xl transition-colors flex-shrink-0">Subscribe</button>
          </div>
          <div className="flex gap-6 justify-center mt-4 flex-wrap">
            {['No spam','Exclusive deals','Unsubscribe anytime'].map(f=><span key={f} className="text-xs text-[#9A8878]">✓ {f}</span>)}
          </div>
        </div>
      </section>
    </div>
  );
}
