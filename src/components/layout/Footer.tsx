'use client';
// src/components/layout/Footer.tsx
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-[#0E0904] text-[#9A8870]">
      <div className="max-w-[1200px] mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div>
          <div className="font-serif text-2xl text-[#FAF8F5] mb-3">Hema Modern Furniture</div>
          <p className="text-sm text-[#6A5A4A] leading-relaxed mb-4">Crafting exceptional furniture for Egyptian homes since 2010.</p>
          <div className="flex gap-2 flex-wrap">
            {['VISA','MC','Paymob','Fawry','COD'].map(m => (
              <span key={m} className="px-2 py-0.5 bg-white/6 border border-white/6 rounded text-[10px] font-bold">{m}</span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-[#5A4A3A] mb-4">Quick Links</div>
          {[['/', 'Home'],['shop','Shop'],['/about','About'],['/contact','Contact']].map(([href, label]) => (
            <Link key={href} href={String(href)} className="block text-sm text-[#7A6858] hover:text-[#D4B07A] mb-2.5 transition-colors">{label}</Link>
          ))}
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-[#5A4A3A] mb-4">Collections</div>
          {['Living Room','Bedroom','Dining Room','Office','Outdoor'].map(c => (
            <Link key={c} href="/shop" className="block text-sm text-[#7A6858] hover:text-[#D4B07A] mb-2.5 transition-colors">{c}</Link>
          ))}
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-[#5A4A3A] mb-4">Customer Service</div>
          {['Shipping & Delivery','Return Policy','Warranty','FAQ'].map(l => (
            <span key={l} className="block text-sm text-[#7A6858] mb-2.5 cursor-pointer hover:text-[#D4B07A] transition-colors">{l}</span>
          ))}
          <div className="mt-4 text-xs text-[#5A4A3A]">
            <div>📞 +20 100 000 0000</div>
            <div>✉️ hello@hemafurniture.com</div>
          </div>
        </div>
      </div>
      <div className="border-t border-white/6 py-5 text-center text-xs text-[#4A3A28]">
        © {new Date().getFullYear()} Hema Modern Furniture. All rights reserved.
      </div>
    </footer>
  );
}
