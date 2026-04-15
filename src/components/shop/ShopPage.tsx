'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Image from 'next/image';
import { useCartStore, useWishlistStore } from '@/store/cartStore';
import toast from 'react-hot-toast';
import type { IProduct } from '@/types';

const fetcher = (u: string) => fetch(u).then(r => r.json());
const CATS = [{key:'',label:'All'},{key:'living',label:'Living Room'},{key:'bedroom',label:'Bedroom'},{key:'dining',label:'Dining'},{key:'office',label:'Office'},{key:'outdoor',label:'Outdoor'}];

export default function ShopPage() {
  const [cat,setCat]=useState('');const [sort,setSort]=useState('popular');const [maxP,setMaxP]=useState(12000);const [page,setPage]=useState(1);const [q,setQ]=useState('');
  const addItem=useCartStore(s=>s.addItem);const{toggle:toggleWL,has:isWL}=useWishlistStore();
  const qs=new URLSearchParams({page:String(page),limit:'12',sort,maxPrice:String(maxP),...(cat?{category:cat}:{}),...(q?{q}:{})}).toString();
  const{data,isLoading}=useSWR(`/api/products?${qs}`,fetcher);
  const products=data?.data?.products??[];const pagination=data?.data?.pagination;
  return(
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-14 px-6">
        <div className="max-w-[1200px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5] mb-1">The Shop</h1>
          <p className="text-[#C8B898] text-sm">{pagination?.total??0} products available</p>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <input type="text" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} placeholder="Search products..."
          className="w-full max-w-md rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-2.5 text-sm bg-white dark:bg-[#1A1208] mb-6 focus:outline-none focus:border-[#B8935A]"/>
        <div className="flex gap-8">
          <aside className="w-52 flex-shrink-0 hidden md:block">
            <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-xl p-5 sticky top-20">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Category</div>
              {CATS.map(c=>(
                <label key={c.key} className="flex items-center gap-2 text-sm mb-2.5 cursor-pointer text-[#1A1208] dark:text-[#F0EBE2] hover:text-[#B8935A]">
                  <input type="radio" name="cat" checked={cat===c.key} onChange={()=>{setCat(c.key);setPage(1);}} className="accent-[#B8935A]"/>{c.label}
                </label>
              ))}
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 mt-5">Max Price</div>
              <input type="range" min={500} max={15000} step={500} value={maxP} onChange={e=>{setMaxP(+e.target.value);setPage(1);}} className="w-full accent-[#B8935A]"/>
              <div className="text-sm text-[#B8935A] font-semibold mt-1">EGP {maxP.toLocaleString()}</div>
              <button onClick={()=>{setCat('');setSort('popular');setMaxP(12000);setQ('');setPage(1);}} className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline">Reset</button>
            </div>
          </aside>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
              <span className="text-sm text-gray-500">{pagination?.total??0} products</span>
              <select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}} className="rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] px-3 py-2 text-sm bg-white dark:bg-[#1A1208] focus:outline-none focus:border-[#B8935A]">
                <option value="popular">Most Popular</option><option value="newest">Newest</option>
                <option value="priceLow">Price: Low → High</option><option value="priceHigh">Price: High → Low</option>
              </select>
            </div>
            {isLoading?(
              <div className="grid grid-cols-2 md:grid-cols-3 gap-5">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-white dark:bg-[#1A1208] rounded-xl h-72 animate-pulse border border-[#E8DDD0] dark:border-[#2A1F14]"/>)}</div>
            ):products.length===0?(
              <div className="text-center py-20 text-gray-400"><div className="text-5xl mb-4">🔍</div><p className="font-serif text-lg">No products found</p></div>
            ):(
              <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                {products.map((p:IProduct)=><PCard key={p._id} p={p} addItem={addItem} toggleWL={toggleWL} isWL={isWL}/>)}
              </div>
            )}
            {pagination&&pagination.pages>1&&(
              <div className="flex justify-center gap-2 mt-10">
                {Array.from({length:pagination.pages}).map((_,i)=>(
                  <button key={i} onClick={()=>setPage(i+1)} className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${page===i+1?'bg-[#B8935A] text-white':'bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] hover:border-[#B8935A] text-gray-600 dark:text-gray-300'}`}>{i+1}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PCard({p,addItem,toggleWL,isWL}:{p:IProduct;addItem:(p:IProduct)=>void;toggleWL:(id:string)=>void;isWL:(id:string)=>boolean}){
  const wished=isWL(p._id);const disc=p.oldPrice?Math.round((1-p.price/p.oldPrice)*100):0;
  return(
    <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col">
      <Link href={`/product/${p.slug}`} className="block relative h-52 bg-[#F2EDE6] dark:bg-[#221710] overflow-hidden group">
        {p.images?.[0]?<Image src={p.images[0]} alt={p.nameEn} fill className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="300px"/>:<div className="w-full h-full flex items-center justify-center text-6xl">🛋️</div>}
        {p.badge&&<span className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-bold ${p.badge==='Sale'?'bg-red-500 text-white':p.badge==='New'?'bg-[#6B7F6A] text-white':'bg-[#B8935A] text-white'}`}>{p.badge==='Sale'?`${disc}% OFF`:p.badge}</span>}
        <button onClick={e=>{e.preventDefault();toggleWL(p._id);}} className={`absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-sm transition-all ${wished?'text-red-500':'text-gray-300 hover:text-red-400'}`}>{wished?'♥':'♡'}</button>
      </Link>
      <div className="p-4 flex-1 flex flex-col">
        <div className="text-xs text-[#B8935A] mb-1">{'★'.repeat(Math.round(p.rating))} <span className="text-gray-400">({p.reviewCount})</span></div>
        <Link href={`/product/${p.slug}`} className="font-serif text-base font-medium text-[#1A1208] dark:text-[#F0EBE2] mb-1 hover:text-[#B8935A] transition-colors leading-snug line-clamp-2">{p.nameEn}</Link>
        <div className="text-xs text-gray-400 mb-3 flex-1">{p.material}</div>
        <div className="flex items-baseline gap-2 mb-3"><span className="text-base font-bold text-[#B8935A]">EGP {p.price.toLocaleString()}</span>{p.oldPrice&&<span className="text-xs text-gray-400 line-through">EGP {p.oldPrice.toLocaleString()}</span>}</div>
        <button onClick={()=>{addItem(p);toast.success(`${p.nameEn} added`,{icon:'🛒'});}} disabled={p.stock===0} className="w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white text-sm font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{p.stock===0?'Out of Stock':'Add to Cart'}</button>
      </div>
    </div>
  );
}
