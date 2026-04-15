'use client';
// src/components/cart/CartPage.tsx
import Link from 'next/link';
import Image from 'next/image';
import { useCartStore } from '@/store/cartStore';

export default function CartPage() {
  const { items, removeItem, updateQty, subtotal, shipping, total, clearCart } = useCartStore();
  const sub  = subtotal();
  const ship = shipping();
  const tot  = total();
  const pct  = Math.min(100, Math.round((sub / 5000) * 100));

  if (!items.length) return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-5 px-4">
      <div className="text-7xl">🛒</div>
      <h2 className="font-serif text-3xl text-[#1A1208] dark:text-[#F0EBE2]">Your cart is empty</h2>
      <p className="text-gray-400 text-sm">Add some furniture to get started</p>
      <Link href="/shop" className="bg-[#B8935A] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#D4B07A] transition-colors">Browse Shop</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-14 px-6">
        <div className="max-w-[1100px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5]">Shopping Cart</h1>
          <p className="text-[#C8B898] text-sm mt-1">{items.reduce((s,i)=>s+i.quantity,0)} items</p>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
          {/* Items */}
          <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl overflow-hidden">
            {items.map((item, idx) => (
              <div key={item.productId} className={`grid grid-cols-[90px_1fr_auto] gap-4 p-5 items-start ${idx < items.length-1 ? 'border-b border-[#E8DDD0] dark:border-[#2A1F14]' : ''}`}>
                <div className="w-[90px] h-[90px] rounded-xl overflow-hidden bg-[#F2EDE6] dark:bg-[#221710] flex-shrink-0">
                  {item.product.images?.[0]
                    ? <Image src={item.product.images[0]} alt={item.product.nameEn} width={90} height={90} className="w-full h-full object-cover"/>
                    : <div className="w-full h-full flex items-center justify-center text-3xl">🛋️</div>}
                </div>
                <div>
                  <div className="font-serif text-lg font-medium text-[#1A1208] dark:text-[#F0EBE2] mb-0.5">{item.product.nameEn}</div>
                  <div className="text-sm text-[#B8935A] font-semibold mb-3">EGP {item.product.price.toLocaleString()}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQty(item.productId, item.quantity - 1)} className="w-8 h-8 rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] flex items-center justify-center text-base hover:bg-[#F2EDE6] dark:hover:bg-white/5 transition-colors">−</button>
                    <span className="w-8 text-center text-sm font-semibold text-[#1A1208] dark:text-[#F0EBE2]">{item.quantity}</span>
                    <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="w-8 h-8 rounded-lg border border-[#D0C4B4] dark:border-[#3A2D20] flex items-center justify-center text-base hover:bg-[#F2EDE6] dark:hover:bg-white/5 transition-colors">+</button>
                  </div>
                  <button onClick={() => removeItem(item.productId)} className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-2 underline">Remove</button>
                </div>
                <div className="text-right">
                  <div className="font-serif text-xl font-medium text-[#1A1208] dark:text-[#F0EBE2]">EGP {(item.product.price * item.quantity).toLocaleString()}</div>
                </div>
              </div>
            ))}
            <div className="px-5 py-3 flex justify-between items-center border-t border-[#E8DDD0] dark:border-[#2A1F14]">
              <Link href="/shop" className="text-sm text-[#B8935A] hover:underline">← Continue Shopping</Link>
              <button onClick={clearCart} className="text-xs text-gray-400 hover:text-red-500 transition-colors underline">Clear cart</button>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 h-fit sticky top-24">
            <h2 className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-5">Order Summary</h2>

            {/* Free shipping progress */}
            {ship > 0 && (
              <div className="mb-5">
                <div className="text-xs text-gray-500 mb-1.5">
                  Add <strong className="text-[#1A1208] dark:text-[#F0EBE2]">EGP {(5000 - sub).toLocaleString()}</strong> for free shipping
                </div>
                <div className="h-1.5 bg-[#F2EDE6] dark:bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[#B8935A] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
            {ship === 0 && (
              <div className="mb-5 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-xs text-green-700 dark:text-green-300">
                🎉 You qualify for free shipping!
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div className="flex justify-between text-sm text-[#1A1208] dark:text-[#F0EBE2]">
                <span className="text-gray-500">Subtotal</span>
                <span>EGP {sub.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm text-[#1A1208] dark:text-[#F0EBE2]">
                <span className="text-gray-500">Shipping</span>
                <span className={ship === 0 ? 'text-green-600 font-medium' : ''}>{ship === 0 ? '✓ Free' : `EGP ${ship}`}</span>
              </div>
            </div>

            <div className="border-t border-[#E8DDD0] dark:border-[#2A1F14] pt-4 mb-5">
              <div className="flex justify-between">
                <span className="font-semibold text-[#1A1208] dark:text-[#F0EBE2]">Total</span>
                <span className="font-serif text-2xl text-[#B8935A]">EGP {tot.toLocaleString()}</span>
              </div>
            </div>

            <Link href="/checkout"
              className="block w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white text-center font-semibold py-3.5 rounded-xl transition-colors mb-3">
              Proceed to Checkout
            </Link>
            <div className="text-center text-xs text-gray-400">🔒 Secure 256-bit SSL encryption</div>

            <div className="flex gap-1.5 justify-center mt-3 flex-wrap">
              {['VISA','MC','Paymob','Fawry','COD'].map(m => (
                <span key={m} className="px-2 py-0.5 bg-[#F2EDE6] dark:bg-white/5 border border-[#E8DDD0] dark:border-[#2A1F14] rounded text-[10px] font-bold text-gray-500">{m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
