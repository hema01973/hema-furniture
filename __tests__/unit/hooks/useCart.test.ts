// __tests__/unit/hooks/useCart.test.ts — V031: unit tests for useCart hook
import { renderHook, act } from '@testing-library/react';
import toast from 'react-hot-toast';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

const mockStore = {
  items:       [] as unknown[],
  addItem:     jest.fn(),
  removeItem:  jest.fn(),
  clearCart:   jest.fn(),
  updateQty:   jest.fn(),
  count:       jest.fn(() => 0),
  subtotal:    jest.fn(() => 0),
  shipping:    jest.fn(() => 0),
  total:       jest.fn(() => 0),
};

jest.mock('@/store/cartStore', () => ({
  useCartStore: () => mockStore,
}));

import { useCart } from '@/hooks/useCart';
import type { IProduct } from '@/types';

const MOCK_PRODUCT: IProduct = {
  _id:         'prod-001',
  slug:        'oslo-sofa',
  nameEn:      'Oslo Sofa',
  nameAr:      'أريكة أوسلو',
  price:       8500,
  stock:       10,
  images:      ['https://img.example.com/sofa.jpg'],
  category:    { main: 'living' },
  rating:      4.5,
  reviewCount: 12,
  isActive:    true,
  isFeatured:  false,
} as IProduct;

describe('useCart hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── add ───────────────────────────────────────────────────────
  it('calls store.addItem with correct args when add() is called', () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.add(MOCK_PRODUCT, 2, 'Walnut'); });
    expect(mockStore.addItem).toHaveBeenCalledWith(MOCK_PRODUCT, 2, 'Walnut');
  });

  it('shows success toast when add() is called', () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.add(MOCK_PRODUCT); });
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('Oslo Sofa'),
      expect.objectContaining({ icon: '🛒' })
    );
  });

  it('defaults quantity to 1 when add() is called without qty', () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.add(MOCK_PRODUCT); });
    expect(mockStore.addItem).toHaveBeenCalledWith(MOCK_PRODUCT, 1, undefined);
  });

  it('defaults color to undefined when add() is called without color', () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.add(MOCK_PRODUCT, 3); });
    expect(mockStore.addItem).toHaveBeenCalledWith(MOCK_PRODUCT, 3, undefined);
  });

  // ── remove ────────────────────────────────────────────────────
  it('calls store.removeItem with correct productId when remove() is called', () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.remove('prod-001'); });
    expect(mockStore.removeItem).toHaveBeenCalledWith('prod-001');
  });

  it('shows success toast when remove() is called', () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.remove('prod-001'); });
    expect(toast.success).toHaveBeenCalledWith('Item removed', expect.any(Object));
  });

  // ── store passthrough ─────────────────────────────────────────
  it('exposes store.items', () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.items).toBe(mockStore.items);
  });

  it('exposes store.clearCart', () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.clearCart).toBe(mockStore.clearCart);
  });

  it('exposes store.count', () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.count).toBe(mockStore.count);
  });

  it('exposes store.subtotal', () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.subtotal).toBe(mockStore.subtotal);
  });

  it('exposes store.total', () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.total).toBe(mockStore.total);
  });
});
