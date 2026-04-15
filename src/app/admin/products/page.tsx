'use client';
// src/app/admin/products/page.tsx
import { useState, useRef } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useUIStore } from '@/store/cartStore';
import Image from 'next/image';
import toast from 'react-hot-toast';
import type { IProduct } from '@/types';

const CATEGORIES = ['living','bedroom','dining','office','outdoor'] as const;
const BADGES     = ['New','Sale','Best Seller','Limited'] as const;

export default function AdminProducts() {
  const { lang } = useUIStore();
  const ar = lang === 'ar';
  const { data, mutate } = useProducts({}, 'newest', 1, 50);
  const products = data?.data?.products ?? [];

  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<IProduct | null>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nameEn: '', nameAr: '', descEn: '', descAr: '',
    price: '', oldPrice: '', category: 'living', badge: '',
    stock: '100', material: '', materialAr: '', warrantyYears: '1',
    isActive: true, isFeatured: false,
  });

  const resetForm = () => {
    setForm({ nameEn:'',nameAr:'',descEn:'',descAr:'',price:'',oldPrice:'',category:'living',badge:'',stock:'100',material:'',materialAr:'',warrantyYears:'1',isActive:true,isFeatured:false });
    setPreview([]); setUploadedUrls([]); setEditing(null);
  };

  const openEdit = (p: IProduct) => {
    setEditing(p);
    setForm({
      nameEn: p.nameEn, nameAr: p.nameAr, descEn: p.descEn ?? '', descAr: p.descAr ?? '',
      price: String(p.price), oldPrice: p.oldPrice ? String(p.oldPrice) : '', category: p.category,
      badge: p.badge ?? '', stock: String(p.stock), material: p.material ?? '', materialAr: p.materialAr ?? '',
      warrantyYears: String(p.warrantyYears ?? 1), isActive: p.isActive, isFeatured: p.isFeatured,
    });
    setPreview(p.images ?? []);
    setUploadedUrls(p.images ?? []);
    setShowForm(true);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach(f => fd.append('files', f));
      const res  = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const urls: string[] = data.data.urls;
      setUploadedUrls(prev => [...prev, ...urls]);
      setPreview(prev    => [...prev, ...urls]);
      toast.success(`${urls.length} image(s) uploaded`);
    } catch (e) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.nameEn || !form.price) { toast.error('Name and price are required'); return; }
    const body = {
      ...form,
      price:         parseFloat(form.price),
      oldPrice:      form.oldPrice ? parseFloat(form.oldPrice) : undefined,
      stock:         parseInt(form.stock),
      warrantyYears: parseInt(form.warrantyYears),
      badge:         form.badge || undefined,
      images:        uploadedUrls.length ? uploadedUrls : ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&q=80'],
    };
    try {
      const url    = editing ? `/api/products/${editing._id}` : '/api/products';
      const method = editing ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d      = await res.json();
      if (!d.success) throw new Error(d.error);
      toast.success(editing ? 'Product updated ✓' : 'Product created ✓');
      setShowForm(false); resetForm(); mutate();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed');
    }
  };

  const handleDelete = async (p: IProduct) => {
    if (!confirm(`Delete "${p.nameEn}"?`)) return;
    const res = await fetch(`/api/products/${p._id}`, { method: 'DELETE' });
    if ((await res.json()).success) { toast.success('Product deactivated'); mutate(); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-4xl font-serif text-espresso dark:text-cream">{ar ? 'المنتجات' : 'Products'}</h1>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium hover:bg-gold-light transition-colors">
          {showForm ? (ar ? '✕ إغلاق' : '✕ Close') : (ar ? '+ إضافة منتج' : '+ Add Product')}
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white dark:bg-[#1A1208] border border-sand dark:border-sand/20 rounded-xl p-6 mb-6">
          <h3 className="font-serif text-2xl text-espresso dark:text-cream mb-5">
            {editing ? (ar ? 'تعديل المنتج' : 'Edit Product') : (ar ? 'إضافة منتج جديد' : 'New Product')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {[
              { id: 'nameEn', label: 'Name (EN)', ph: 'Oslo Sofa' },
              { id: 'nameAr', label: 'الاسم (AR)', ph: 'أريكة أوسلو' },
            ].map(f => (
              <div key={f.id}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{f.label}</label>
                <input type="text" value={form[f.id as keyof typeof form] as string} onChange={e => setForm(p => ({ ...p, [f.id]: e.target.value }))} placeholder={f.ph} className="w-full rounded-lg border border-sand-dark px-3 py-2.5 text-sm" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Price (EGP) *</label>
              <input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0" className="w-full rounded-lg border border-sand-dark px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Old Price (EGP)</label>
              <input type="number" value={form.oldPrice} onChange={e => setForm(p => ({ ...p, oldPrice: e.target.value }))} placeholder="0 (optional)" className="w-full rounded-lg border border-sand-dark px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full rounded-lg border border-sand-dark px-3 py-2.5 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Badge</label>
              <select value={form.badge} onChange={e => setForm(p => ({ ...p, badge: e.target.value }))} className="w-full rounded-lg border border-sand-dark px-3 py-2.5 text-sm">
                <option value="">None</option>
                {BADGES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Stock</label>
              <input type="number" value={form.stock} onChange={e => setForm(p => ({ ...p, stock: e.target.value }))} className="w-full rounded-lg border border-sand-dark px-3 py-2.5 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description (EN)</label>
              <textarea value={form.descEn} onChange={e => setForm(p => ({ ...p, descEn: e.target.value }))} rows={3} className="w-full rounded-lg border border-sand-dark px-3 py-2.5 text-sm resize-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">الوصف (AR)</label>
              <textarea value={form.descAr} onChange={e => setForm(p => ({ ...p, descAr: e.target.value }))} rows={3} dir="rtl" className="w-full rounded-lg border border-sand-dark px-3 py-2.5 text-sm resize-none" />
            </div>
          </div>

          {/* Image Upload */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Product Images</label>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-sand-dark rounded-lg text-sm text-gray-500 hover:border-gold hover:text-gold transition-colors disabled:opacity-50"
            >
              {uploading ? '⟳ Uploading...' : '📸 Click to upload images (max 10MB each)'}
            </button>
            {preview.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {preview.map((url, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-sand group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { setPreview(p => p.filter((_, j) => j !== i)); setUploadedUrls(p => p.filter((_, j) => j !== i)); }}
                      className="absolute inset-0 bg-black/50 text-white text-xl hidden group-hover:flex items-center justify-center"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 mb-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="w-4 h-4 accent-gold" />
              <span className="text-sm">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(p => ({ ...p, isFeatured: e.target.checked }))} className="w-4 h-4 accent-gold" />
              <span className="text-sm">Featured</span>
            </label>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSubmit} className="px-6 py-2.5 bg-gold text-white rounded-lg text-sm font-medium hover:bg-gold-light transition-colors">
              {editing ? (ar ? 'حفظ التغييرات' : 'Save Changes') : (ar ? 'إضافة المنتج' : 'Add Product')}
            </button>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="px-6 py-2.5 border border-sand-dark rounded-lg text-sm hover:bg-sand-light transition-colors">
              {ar ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white dark:bg-[#1A1208] border border-sand dark:border-sand/20 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-sand-light/50 dark:bg-white/5">
                {['Image','Product','Category','Price','Stock','Status',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p._id} className="border-t border-sand/50 hover:bg-sand-light/20 dark:hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-sand-light flex-shrink-0">
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm text-espresso dark:text-cream">{p.nameEn}</div>
                    <div className="text-xs text-gray-400">{p.nameAr}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gold/10 text-gold rounded-full text-xs font-semibold">{p.category}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-gold text-sm">EGP {p.price.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{p.stock}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="px-3 py-1 bg-sand-light border border-sand-dark rounded text-xs font-medium hover:bg-sand transition-colors">{ar ? 'تعديل' : 'Edit'}</button>
                      <button onClick={() => handleDelete(p)} className="px-3 py-1 bg-red-50 border border-red-200 text-red-600 rounded text-xs font-medium hover:bg-red-100 transition-colors">{ar ? 'حذف' : 'Delete'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
