// __tests__/components/OrderSummary.test.tsx — v4.9: unit tests for extracted OrderSummary
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

jest.mock('@/lib/utils', () => ({
  formatEGP: (n: number) => `EGP ${n.toLocaleString('en-EG')}`,
}));

import OrderSummary from '@/components/checkout/OrderSummary';

const MOCK_ITEMS = [
  {
    productId: 'p1',
    quantity:   2,
    product:   { nameEn: 'Oslo Sofa', images: ['https://img.example.com/sofa.jpg'], price: 8500 },
  },
  {
    productId: 'p2',
    quantity:   1,
    product:   { nameEn: 'Milan Chair', images: [], price: 3200 },
  },
];

describe('OrderSummary', () => {
  // ── Rendering ─────────────────────────────────────────────────
  it('renders the Order Summary heading', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={0} finalTotal={20200} />
    );
    expect(screen.getByText(/order summary/i)).toBeInTheDocument();
  });

  it('renders all product names', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={0} finalTotal={20200} />
    );
    expect(screen.getByText('Oslo Sofa')).toBeInTheDocument();
    expect(screen.getByText('Milan Chair')).toBeInTheDocument();
  });

  it('renders quantity for each item', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={0} finalTotal={20200} />
    );
    expect(screen.getByText('×2')).toBeInTheDocument();
    expect(screen.getByText('×1')).toBeInTheDocument();
  });

  it('renders product image when provided', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={0} finalTotal={20200} />
    );
    const img = screen.getByAltText('Oslo Sofa') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('sofa.jpg');
  });

  it('renders fallback emoji when no product image', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={0} finalTotal={20200} />
    );
    // Milan Chair has empty images array — fallback emoji should render
    expect(screen.getByText('🛋️')).toBeInTheDocument();
  });

  // ── Pricing ───────────────────────────────────────────────────
  it('displays subtotal correctly', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={0} finalTotal={20200} />
    );
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
  });

  it('shows Free shipping label when shipping is 0', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={0} finalTotal={20200} />
    );
    expect(screen.getByText('✓ Free')).toBeInTheDocument();
  });

  it('shows shipping cost when shipping > 0', () => {
    render(
      <OrderSummary items={[MOCK_ITEMS[1]]} subtotal={3200} shipping={299}
        couponDisc={0} finalTotal={3499} />
    );
    expect(screen.queryByText('✓ Free')).not.toBeInTheDocument();
  });

  it('shows discount row when couponDisc > 0', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={2020} finalTotal={18180} />
    );
    expect(screen.getByText('Discount')).toBeInTheDocument();
  });

  it('does NOT show discount row when couponDisc is 0', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={0} finalTotal={20200} />
    );
    expect(screen.queryByText('Discount')).not.toBeInTheDocument();
  });

  it('renders security badge', () => {
    render(
      <OrderSummary items={MOCK_ITEMS} subtotal={20200} shipping={0}
        couponDisc={0} finalTotal={20200} />
    );
    expect(screen.getByText(/256-bit ssl/i)).toBeInTheDocument();
    expect(screen.getByText(/pci dss/i)).toBeInTheDocument();
  });

  // ── Edge cases ────────────────────────────────────────────────
  it('renders correctly with empty items list', () => {
    render(
      <OrderSummary items={[]} subtotal={0} shipping={0}
        couponDisc={0} finalTotal={0} />
    );
    expect(screen.getByText(/order summary/i)).toBeInTheDocument();
  });

  it('renders correctly with a single item', () => {
    render(
      <OrderSummary items={[MOCK_ITEMS[0]]} subtotal={17000} shipping={0}
        couponDisc={0} finalTotal={17000} />
    );
    expect(screen.getByText('Oslo Sofa')).toBeInTheDocument();
    expect(screen.queryByText('Milan Chair')).not.toBeInTheDocument();
  });
});
