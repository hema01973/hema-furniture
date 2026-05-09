// src/... — HemaV050: dedicated wishlist page with server-sync
import type { Metadata } from 'next';
import WishlistPage from '@/components/wishlist/WishlistPage';

export const metadata: Metadata = {
  title: 'Wishlist | Hema Furniture',
  description: 'Your saved products and favourite items.',
};

export default function Wishlist() {
  return <WishlistPage />;
}
