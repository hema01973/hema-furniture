'use client';
// src/components/layout/Navbar.tsx
import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useCartStore, useWishlistStore, useUIStore } from '@/store/cartStore';
import { useProductSearch } from '@/hooks/useProducts';
import Image from 'next/image';
import Link from 'next/link';

const NAV_LINKS = [
  { href: '/',        labelEn: 'Home',    labelAr: 'الرئيسية' },
  { href: '/shop',    labelEn: 'Shop',    labelAr: 'المتجر'   },
  { href: '/about',   labelEn: 'About',   labelAr: 'من نحن'   },
  { href: '/contact', labelEn: 'Contact', labelAr: 'تواصل'   },
];

export default function Navbar() {
  const { data: session } = useSession();
  const router   = useRouter();
  const pathname = usePathname();
  const { lang, dark, toggleLang, toggleDark, setSearch, setMobile, searchOpen, mobileOpen } = useUIStore();
  const cartCount = useCartStore(s => s.count());
  const wlCount   = useWishlistStore(s => s.ids.length);

  const [scrolled,  setScrolled ] = useState(false);
  const [searchQ,   setSearchQ  ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: searchData } = useProductSearch(searchQ, searchOpen && searchQ.length >= 2);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 80);
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSearch(false); setMobile(false); }
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault(); setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearch, setMobile]);

  const label = (en: string, ar: string) => lang === 'ar' ? ar : en;

  return (
    <>
      {/* Search Overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[850] flex items-start justify-center pt-24"
          onClick={() => setSearch(false)}
        >
          <div
            className="bg-white dark:bg-[#1A1208] rounded-2xl p-6 w-[92%] max-w-[560px] shadow-2xl flex flex-col max-h-[75vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex gap-3 mb-4">
              <input
                ref={searchRef}
                type="text"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder={label('Search products...', 'ابحث عن منتجات...')}
                className="flex-1 text-base px-4 py-3 rounded-lg border border-sand-dark focus:border-gold focus:ring-2 focus:ring-gold/10 outline-none bg-cream dark:bg-espresso"
              />
              <button
                onClick={() => { setSearch(false); setSearchQ(''); }}
                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-sand-light transition-colors text-xl"
                aria-label="Close search"
              >✕</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {searchData?.data?.products?.map(p => (
                <button
                  key={p._id}
                  onClick={() => { router.push(`/product/${p.slug}`); setSearch(false); setSearchQ(''); }}
                  className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-sand-light/50 dark:hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-sand-light flex-shrink-0">
                    {p.images?.[0] && (
                      <Image src={p.images[0]} alt={p.nameEn} width={56} height={56} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-espresso dark:text-cream">{lang === 'ar' ? p.nameAr : p.nameEn}</div>
                    <div className="text-sm text-gold font-semibold mt-0.5">EGP {p.price.toLocaleString()}</div>
                  </div>
                </button>
              ))}
              {searchQ.length >= 2 && !searchData?.data?.products?.length && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  {label('No results found', 'لا توجد نتائج')}
                </div>
              )}
              {!searchQ && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  {label('Start typing to search...', 'ابدأ الكتابة للبحث...')}
                  <div className="mt-2 text-xs text-gray-300">Press "/" to open search</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[900] bg-cream dark:bg-[#0E0904] flex flex-col">
          <div className="flex justify-between items-center px-6 py-5 border-b border-sand">
            <span className="font-serif text-xl font-semibold text-espresso dark:text-cream">
              {lang === 'ar' ? 'هيما' : 'Hema'}
            </span>
            <button onClick={() => setMobile(false)} className="text-2xl p-1 hover:text-gold transition-colors">✕</button>
          </div>
          <nav className="flex-1 overflow-y-auto px-6 py-4">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobile(false)}
                className={`flex items-center gap-4 py-4 border-b border-sand/60 text-xl font-serif transition-colors ${
                  pathname === link.href ? 'text-gold' : 'text-espresso dark:text-cream hover:text-gold'
                }`}
              >
                {label(link.labelEn, link.labelAr)}
              </Link>
            ))}
            {session ? (
              <>
                <Link href="/account" onClick={() => setMobile(false)} className="flex items-center gap-4 py-4 border-b border-sand/60 text-xl font-serif text-espresso dark:text-cream hover:text-gold transition-colors">
                  {label('My Account', 'حسابي')}
                </Link>
                <Link href="/orders" onClick={() => setMobile(false)} className="flex items-center gap-4 py-4 border-b border-sand/60 text-xl font-serif text-espresso dark:text-cream hover:text-gold transition-colors">
                  {label('My Orders', 'طلباتي')}
                </Link>
                {(session.user.role === 'admin' || session.user.role === 'staff') && (
                  <Link href="/admin" onClick={() => setMobile(false)} className="flex items-center gap-4 py-4 border-b border-sand/60 text-xl font-serif text-gold transition-colors">
                    ⚙️ {label('Admin Panel', 'لوحة الإدارة')}
                  </Link>
                )}
              </>
            ) : (
              <Link href="/login" onClick={() => setMobile(false)} className="flex items-center gap-4 py-4 border-b border-sand/60 text-xl font-serif text-espresso dark:text-cream hover:text-gold transition-colors">
                {label('Sign In', 'تسجيل الدخول')}
              </Link>
            )}
          </nav>
          <div className="px-6 py-6 border-t border-sand flex gap-3 flex-wrap">
            <button onClick={() => { toggleLang(); setMobile(false); }} className="px-4 py-2 rounded-full bg-sand-light border border-sand-dark text-sm font-semibold">
              {lang === 'en' ? 'عربي' : 'English'}
            </button>
            <button onClick={() => { toggleDark(); setMobile(false); }} className="px-4 py-2 rounded-full bg-sand-light border border-sand-dark text-sm">
              {dark ? '☀️' : '🌙'}
            </button>
            {session && (
              <button onClick={() => signOut({ callbackUrl: '/' })} className="px-4 py-2 rounded-full border border-red-200 text-red-500 text-sm">
                {label('Sign Out', 'خروج')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav
        className={`sticky top-0 z-[800] transition-all duration-300 ${
          scrolled ? 'shadow-furniture' : ''
        } bg-cream/95 dark:bg-[#0E0904]/95 backdrop-blur-md border-b border-sand dark:border-sand/20`}
        aria-label="Main navigation"
      >
        <div className="max-w-[1200px] mx-auto px-6 h-[68px] flex items-center justify-between gap-6">
          {/* Logo */}
          <Link href="/" className="font-serif text-[21px] font-semibold text-espresso dark:text-cream hover:text-gold transition-colors flex-shrink-0">
            {lang === 'ar' ? 'هيما للأثاث العصري' : 'Hema Modern Furniture'}
          </Link>

          {/* Desktop Nav */}
          <ul className="hidden lg:flex items-center gap-1 flex-1 justify-center list-none" role="menubar">
            {NAV_LINKS.map(link => (
              <li key={link.href} role="none">
                <Link
                  href={link.href}
                  role="menuitem"
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    pathname === link.href
                      ? 'text-gold font-medium'
                      : 'text-gray-500 hover:text-gold'
                  }`}
                >
                  {label(link.labelEn, link.labelAr)}
                </Link>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Search */}
            <button
              onClick={() => setSearch(true)}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-sand-light dark:hover:bg-white/5 transition-colors text-[17px]"
              aria-label="Search"
            >🔍</button>

            {/* Wishlist */}
            <button
              onClick={() => router.push('/wishlist')}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-sand-light dark:hover:bg-white/5 transition-colors text-[17px] relative"
              aria-label={label('Wishlist', 'المفضلة')}
            >
              ♡
              {wlCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border-2 border-cream">
                  {wlCount}
                </span>
              )}
            </button>

            {/* Cart */}
            <button
              onClick={() => router.push('/cart')}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-sand-light dark:hover:bg-white/5 transition-colors text-[17px] relative"
              aria-label={label('Cart', 'السلة')}
            >
              🛒
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gold text-white text-[9px] font-bold flex items-center justify-center border-2 border-cream">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Language */}
            <button
              onClick={toggleLang}
              className="hidden sm:flex px-3 py-1.5 rounded-full bg-sand-light dark:bg-white/5 border border-sand-dark/50 text-xs font-semibold cursor-pointer hover:bg-sand-dark/20 transition-colors ml-1"
            >
              {lang === 'en' ? 'عربي' : 'English'}
            </button>

            {/* Dark mode */}
            <button
              onClick={toggleDark}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-sand-light dark:hover:bg-white/5 transition-colors"
              aria-label="Toggle dark mode"
            >
              {dark ? '☀️' : '🌙'}
            </button>

            {/* User menu */}
            {session ? (
              <div className="relative group hidden sm:block">
                <button className="w-9 h-9 rounded-full bg-gold text-white font-bold text-sm flex items-center justify-center ml-1">
                  {session.user.name?.[0]?.toUpperCase()}
                </button>
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1A1208] border border-sand rounded-xl shadow-furniture-lg py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="px-3 py-2 border-b border-sand">
                    <div className="text-sm font-medium text-espresso dark:text-cream truncate">{session.user.name}</div>
                    <div className="text-xs text-gray-400 truncate">{session.user.email}</div>
                  </div>
                  <Link href="/account" className="block px-3 py-2 text-sm text-espresso dark:text-cream hover:text-gold hover:bg-sand-light/50 transition-colors">{label('My Account', 'حسابي')}</Link>
                  <Link href="/orders"  className="block px-3 py-2 text-sm text-espresso dark:text-cream hover:text-gold hover:bg-sand-light/50 transition-colors">{label('My Orders', 'طلباتي')}</Link>
                  {(session.user.role === 'admin' || session.user.role === 'staff') && (
                    <Link href="/admin" className="block px-3 py-2 text-sm text-gold hover:bg-sand-light/50 transition-colors">⚙️ Admin</Link>
                  )}
                  <hr className="border-sand my-1" />
                  <button onClick={() => signOut({ callbackUrl: '/' })} className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                    {label('Sign Out', 'تسجيل الخروج')}
                  </button>
                </div>
              </div>
            ) : (
              <Link href="/login" className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-lg border border-sand-dark/50 text-sm font-medium text-espresso dark:text-cream hover:border-gold hover:text-gold transition-colors ml-1">
                {label('Sign In', 'دخول')}
              </Link>
            )}

            {/* Hamburger */}
            <button
              onClick={() => setMobile(true)}
              className="lg:hidden w-10 h-10 flex items-center justify-center text-2xl"
              aria-label="Open menu"
            >☰</button>
          </div>
        </div>
      </nav>
    </>
  );
}
