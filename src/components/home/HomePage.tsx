'use client';
// src/... — HemaV050: real newsletter subscription API
import Link from 'next/link';
import Image from 'next/image';
import { useRef, useState } from 'react';
import useSWR from 'swr';
import { useCartStore, useWishlistStore, useUIStore } from '@/store/cartStore';
import toast from 'react-hot-toast';
import type { IProduct } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());

const T = {
  en: {
    eyebrow:        'Premium Furniture Since 2010',
    heroTitle1:     'Where Comfort',
    heroTitle2:     'Meets Elegance',
    heroSub:        'Discover our curated collection of modern furniture, crafted for the way you live — beautiful, durable, and authentically Egyptian.',
    shopNow:        'Shop Now',
    ourStory:       'Our Story',
    stats:          [['500+', 'Unique Pieces'], ['15+', 'Years Experience'], ['10K+', 'Happy Clients']] as const,
    explore:        'Explore',
    collections:    'Our Collections',
    cats: {
      living:  'Living Room',
      bedroom: 'Bedroom',
      dining:  'Dining Room',
      office:  'Office',
      outdoor: 'Outdoor',
    },
    handpicked:     'Handpicked',
    featured:       'Featured Products',
    viewAll:        'View All →',
    addedToCart:    (n: string) => `${n} added`,
    outOfStock:     'Out of Stock',
    addToCart:      'Add to Cart',
    promoTitle:     'Spring 2026 Collection',
    promoSub:       'New arrivals with up to 30% off — Limited time offer',
    promoCta:       'Shop the Sale',
    reviews:        'Reviews',
    reviewsTitle:   'What Our Clients Say',
    reviewsSub:     'Over 10,000 satisfied clients',
    testimonials: [
      { name: 'Ahmed Hassan',  loc: 'Cairo',      text: 'Exceptional quality and stunning design. The sofa exceeded every expectation.' },
      { name: 'Sara Mohamed',  loc: 'Alexandria', text: 'Excellent service and fast delivery. The furniture looks even better in person.' },
      { name: 'Khaled Ali',    loc: 'New Cairo',  text: 'A fantastic investment. Every piece crafted with remarkable skill and attention to detail.' },
    ],
    newsletterTitle: 'Stay Inspired',
    newsletterSub:   'Exclusive deals and new arrivals, straight to your inbox.',
    emailPh:         'Your email address',
    subscribe:       'Subscribe',
    subscribed:      'Subscribed! ✓',
    perks:           ['No spam', 'Exclusive deals', 'Unsubscribe anytime'],
    currency:        'EGP',
  },
  ar: {
    eyebrow:        'أثاث فاخر منذ 2010',
    heroTitle1:     'حيث تلتقي الراحة',
    heroTitle2:     'بالأناقة',
    heroSub:        'اكتشف مجموعتنا المختارة من الأثاث العصري، مصممة لتناسب أسلوب حياتك — جميلة، متينة، وأصيلة مصرية.',
    shopNow:        'تسوق الآن',
    ourStory:       'قصتنا',
    stats:          [['+500', 'قطعة فريدة'], ['+15', 'سنة من الخبرة'], ['+10 آلاف', 'عميل سعيد']] as const,
    explore:        'استكشف',
    collections:    'مجموعاتنا',
    cats: {
      living:  'غرفة المعيشة',
      bedroom: 'غرفة النوم',
      dining:  'غرفة الطعام',
      office:  'المكتب',
      outdoor: 'الحديقة',
    },
    handpicked:     'مختارة بعناية',
    featured:       'المنتجات المميزة',
    viewAll:        'عرض الكل ←',
    addedToCart:    (n: string) => `تمت إضافة ${n}`,
    outOfStock:     'غير متوفر',
    addToCart:      'أضف إلى السلة',
    promoTitle:     'مجموعة ربيع 2026',
    promoSub:       'وصول حديث بخصومات تصل إلى 30% — لفترة محدودة',
    promoCta:       'تسوق التخفيضات',
    reviews:        'آراء العملاء',
    reviewsTitle:   'ماذا يقول عملاؤنا',
    reviewsSub:     'أكثر من 10,000 عميل راضٍ',
    testimonials: [
      { name: 'أحمد حسن',   loc: 'القاهرة',         text: 'جودة استثنائية وتصميم رائع. الأريكة تجاوزت كل التوقعات.' },
      { name: 'سارة محمد',   loc: 'الإسكندرية',      text: 'خدمة ممتازة وتوصيل سريع. الأثاث يبدو أجمل على أرض الواقع.' },
      { name: 'خالد علي',    loc: 'القاهرة الجديدة', text: 'استثمار رائع. كل قطعة صُنعت بمهارة فائقة واهتمام بالتفاصيل.' },
    ],
    newsletterTitle: 'ابقَ مُلهمًا',
    newsletterSub:   'عروض حصرية ووصولات جديدة مباشرة إلى بريدك.',
    emailPh:         'بريدك الإلكتروني',
    subscribe:       'اشترك',
    subscribed:      'تم الاشتراك! ✓',
    perks:           ['بدون رسائل مزعجة', 'عروض حصرية', 'إلغاء في أي وقت'],
    currency:        'ج.م',
  },
} as const;

export default function HomePage() {
  const { data } = useSWR<{ success: boolean; data: { products: IProduct[] } }>('/api/v1/products?featured=true&limit=8', fetcher);
  const products  = data?.data?.products ?? [];
  const addItem   = useCartStore(s => s.addItem);
  const { toggle: toggleWL, has: isWL } = useWishlistStore();
  const lang      = useUIStore(s => s.lang);
  const t         = T[lang];
  const isAr      = lang === 'ar';

  // V025: real newsletter subscription
  const emailRef            = useRef<HTMLInputElement>(null);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlDone,    setNlDone]    = useState(false);

  const handleSubscribe = async () => {
    const email = emailRef.current?.value?.trim();
    if (!email) { toast.error(isAr ? 'أدخل بريدك الإلكتروني' : 'Please enter your email'); return; }
    setNlLoading(true);
    try {
      const res = await fetch('/api/v1/newsletter', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, lang }),
      });
      const json = await res.json();
      if (json.success) {
        setNlDone(true);
        toast.success(t.subscribed, { icon: '📧' });
        if (emailRef.current) emailRef.current.value = '';
      } else {
        toast.error(json.error ?? (isAr ? 'حدث خطأ ما' : 'Something went wrong'));
      }
    } catch {
      toast.error(isAr ? 'تعذر الاتصال' : 'Network error, please try again');
    } finally {
      setNlLoading(false);
    }
  };

  const cats = [
    { key: 'living',  icon: '🛋️', label: t.cats.living  },
    { key: 'bedroom', icon: '🛏️', label: t.cats.bedroom },
    { key: 'dining',  icon: '🍽️', label: t.cats.dining  },
    { key: 'office',  icon: '💼', label: t.cats.office  },
    { key: 'outdoor', icon: '🌿', label: t.cats.outdoor },
  ];

  return (
    <div className="bg-[#FAF8F5] dark:bg-[#0E0904]" dir={isAr ? 'rtl' : 'ltr'}>
      {/* HERO */}
      <section className="min-h-[88vh] bg-gradient-to-br from-[#190F07] via-[#2B1B0E] to-[#4A2E1A] flex items-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className={`absolute ${isAr ? 'left-0' : 'right-0'} top-0 bottom-0 w-5/12 overflow-hidden hidden lg:block`}>
          <Image src="https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80" alt={isAr ? 'أثاث فاخر' : 'Premium Furniture'} fill className="object-cover opacity-40 mix-blend-luminosity" sizes="45vw" priority />
          <div className={`absolute inset-0 bg-gradient-to-${isAr ? 'l' : 'r'} from-[#190F07] via-[#190F07]/40 to-transparent`} />
        </div>
        <div className="max-w-[1200px] mx-auto px-6 py-20 relative z-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-px bg-[#B8935A]" />
              <span className={`text-[#D4B07A] text-xs font-semibold tracking-[4px] uppercase ${isAr ? 'font-arabic' : ''}`}>{t.eyebrow}</span>
              <div className="w-8 h-px bg-[#B8935A]" />
            </div>
            <h1 className={`${isAr ? 'font-arabic' : 'font-serif'} text-6xl md:text-7xl text-[#FAF8F5] font-normal leading-[1.05] mb-6`}>
              {t.heroTitle1}<br/><em className="text-[#D4B07A]">{t.heroTitle2}</em>
            </h1>
            <p className={`text-[#B8A898] text-lg leading-relaxed mb-10 max-w-xl ${isAr ? 'font-arabic' : ''}`}>
              {t.heroSub}
            </p>
            <div className="flex gap-4 flex-wrap">
              <Link href="/shop" className={`bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-8 py-4 rounded-xl transition-all hover:translate-y-[-1px] hover:shadow-lg ${isAr ? 'font-arabic' : ''}`}>{t.shopNow}</Link>
              <Link href="/about" className={`border-2 border-white/20 hover:border-white/40 text-[#FAF8F5] font-semibold px-8 py-4 rounded-xl transition-all hover:bg-white/5 ${isAr ? 'font-arabic' : ''}`}>{t.ourStory}</Link>
            </div>
            <div className="flex gap-10 mt-14 pt-10 border-t border-white/10">
              {t.stats.map(([n, l]) => (
                <div key={l}>
                  <div className={`${isAr ? 'font-arabic' : 'font-serif'} text-3xl text-[#D4B07A] font-medium`}>{n}</div>
                  <div className={`text-xs text-[#8A7868] mt-1 tracking-wide ${isAr ? 'font-arabic' : ''}`}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="bg-[#F2EDE6] dark:bg-[#1A1208] py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-3"><div className="w-6 h-px bg-[#B8935A]"/><span className={`text-[#B8935A] text-xs font-semibold tracking-[3px] uppercase ${isAr ? 'font-arabic' : ''}`}>{t.explore}</span><div className="w-6 h-px bg-[#B8935A]"/></div>
            <h2 className={`${isAr ? 'font-arabic' : 'font-serif'} text-4xl text-[#1A1208] dark:text-[#F0EBE2] font-normal`}>{t.collections}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {cats.map(c => (
              <Link key={c.key} href={`/shop?category=${c.key}`}
                className="bg-white dark:bg-[#221710] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-7 text-center hover:border-[#B8935A] hover:-translate-y-1 hover:shadow-md transition-all duration-300 group">
                <span className="text-4xl block mb-3">{c.icon}</span>
                <div className={`font-medium text-sm text-[#1A1208] dark:text-[#F0EBE2] group-hover:text-[#B8935A] transition-colors ${isAr ? 'font-arabic' : ''}`}>{c.label}</div>
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
              <div className="flex items-center gap-3 mb-3"><div className="w-6 h-px bg-[#B8935A]"/><span className={`text-[#B8935A] text-xs font-semibold tracking-[3px] uppercase ${isAr ? 'font-arabic' : ''}`}>{t.handpicked}</span></div>
              <h2 className={`${isAr ? 'font-arabic' : 'font-serif'} text-4xl text-[#1A1208] dark:text-[#F0EBE2] font-normal`}>{t.featured}</h2>
            </div>
            <Link href="/shop" className={`border border-[#E8DDD0] dark:border-[#2A1F14] text-[#1A1208] dark:text-[#F0EBE2] hover:border-[#B8935A] hover:text-[#B8935A] font-medium px-5 py-2.5 rounded-xl transition-all text-sm hidden sm:block ${isAr ? 'font-arabic' : ''}`}>{t.viewAll}</Link>
          </div>
          {products.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">{Array.from({length:8}).map((_,i)=><div key={i} className="bg-white dark:bg-[#1A1208] rounded-2xl h-72 animate-pulse border border-[#E8DDD0] dark:border-[#2A1F14]"/>)}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {products.map((p: IProduct) => {
                const disc = p.oldPrice ? Math.round((1-p.price/p.oldPrice)*100) : 0;
                const wished = isWL(p._id);
                const productName = isAr && (p as IProduct & { nameAr?: string }).nameAr ? (p as IProduct & { nameAr?: string }).nameAr! : p.nameEn;
                return (
                  <div key={p._id} className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col">
                    <Link href={`/product/${p.slug}`} className="block relative h-52 bg-[#F2EDE6] dark:bg-[#221710] overflow-hidden group">
                      {p.images?.[0] ? <Image src={p.images[0]} alt={productName} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="300px"/> : <div className="w-full h-full flex items-center justify-center text-6xl">🛋️</div>}
                      {p.badge && <span className={`absolute top-3 ${isAr ? 'right-3' : 'left-3'} px-2 py-0.5 rounded-full text-xs font-bold ${p.badge==='Sale'?'bg-red-500 text-white':p.badge==='New'?'bg-[#6B7F6A] text-white':'bg-[#B8935A] text-white'}`}>{p.badge==='Sale'?`${disc}% OFF`:p.badge}</span>}
                      <button onClick={e=>{e.preventDefault();toggleWL(p._id);}} className={`absolute top-3 ${isAr ? 'left-3' : 'right-3'} w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-sm transition-all ${wished?'text-red-500':'text-gray-300 hover:text-red-400'}`}>{wished?'♥':'♡'}</button>
                    </Link>
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="text-xs text-[#B8935A] mb-1">{'★'.repeat(Math.round(p.rating))} <span className="text-gray-400">({p.reviewCount})</span></div>
                      <Link href={`/product/${p.slug}`} className={`${isAr ? 'font-arabic' : 'font-serif'} text-base font-medium text-[#1A1208] dark:text-[#F0EBE2] mb-1 hover:text-[#B8935A] line-clamp-2 leading-snug transition-colors`}>{productName}</Link>
                      <div className="flex items-baseline gap-2 mb-3 mt-auto"><span className="font-bold text-[#B8935A]">{t.currency} {p.price.toLocaleString(isAr ? 'ar-EG' : 'en-US')}</span>{p.oldPrice&&<span className="text-xs text-gray-400 line-through">{t.currency} {p.oldPrice.toLocaleString(isAr ? 'ar-EG' : 'en-US')}</span>}</div>
                      <button onClick={()=>{addItem(p);toast.success(t.addedToCart(productName),{icon:'🛒'});}} disabled={p.stock===0} className={`w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 ${isAr ? 'font-arabic' : ''}`}>{p.stock===0?t.outOfStock:t.addToCart}</button>
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
          <h2 className={`${isAr ? 'font-arabic' : 'font-serif'} text-5xl text-[#FAF8F5] font-normal mb-4`}>{t.promoTitle}</h2>
          <p className={`text-[#B8A090] text-lg mb-8 ${isAr ? 'font-arabic' : ''}`}>{t.promoSub}</p>
          <Link href="/shop?badge=Sale" className={`inline-block bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold px-10 py-4 rounded-xl transition-all hover:translate-y-[-1px] ${isAr ? 'font-arabic' : ''}`}>{t.promoCta}</Link>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-[#F2EDE6] dark:bg-[#1A1208] py-20 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-3"><div className="w-6 h-px bg-[#B8935A]"/><span className={`text-[#B8935A] text-xs font-semibold tracking-[3px] uppercase ${isAr ? 'font-arabic' : ''}`}>{t.reviews}</span><div className="w-6 h-px bg-[#B8935A]"/></div>
            <h2 className={`${isAr ? 'font-arabic' : 'font-serif'} text-4xl text-[#1A1208] dark:text-[#F0EBE2] font-normal`}>{t.reviewsTitle}</h2>
            <p className={`text-gray-400 text-sm mt-2 ${isAr ? 'font-arabic' : ''}`}>{t.reviewsSub}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {t.testimonials.map((tm, i) => (
              <div key={i} className="bg-white dark:bg-[#221710] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-7">
                <div className="text-[#B8935A] text-base mb-4 tracking-widest">★★★★★</div>
                <p className={`${isAr ? 'font-arabic' : 'font-serif'} text-lg text-[#1A1208] dark:text-[#F0EBE2] leading-relaxed italic mb-5`}>&ldquo;{tm.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#B8935A] flex items-center justify-center text-white font-bold">{tm.name[0]}</div>
                  <div>
                    <div className={`font-semibold text-sm text-[#1A1208] dark:text-[#F0EBE2] ${isAr ? 'font-arabic' : ''}`}>{tm.name}</div>
                    <div className={`text-xs text-gray-400 ${isAr ? 'font-arabic' : ''}`}>📍 {tm.loc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="bg-gradient-to-br from-[#190F07] to-[#3A2010] py-20 px-6 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className={`${isAr ? 'font-arabic' : 'font-serif'} text-4xl text-[#FAF8F5] font-normal mb-3`}>{t.newsletterTitle}</h2>
          <p className={`text-[#B8A090] text-sm mb-8 ${isAr ? 'font-arabic' : ''}`}>{t.newsletterSub}</p>
          <div className="flex gap-3 max-w-md mx-auto">
            <input ref={emailRef} type="email" placeholder={t.emailPh} disabled={nlDone} className={`flex-1 bg-white/10 border border-white/15 text-[#FAF8F5] placeholder-[#8A7060] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#B8935A] min-w-0 disabled:opacity-60 ${isAr ? 'font-arabic text-right' : ''}`}/>
            <button onClick={handleSubscribe} disabled={nlLoading || nlDone} className={`bg-[#B8935A] hover:bg-[#D4B07A] disabled:opacity-60 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex-shrink-0 ${isAr ? 'font-arabic' : ''}`}>
              {nlLoading ? '…' : nlDone ? t.subscribed : t.subscribe}
            </button>
          </div>
          <div className="flex gap-6 justify-center mt-4 flex-wrap">
            {t.perks.map(f => <span key={f} className={`text-xs text-[#9A8878] ${isAr ? 'font-arabic' : ''}`}>✓ {f}</span>)}
          </div>
        </div>
      </section>
    </div>
  );
}
