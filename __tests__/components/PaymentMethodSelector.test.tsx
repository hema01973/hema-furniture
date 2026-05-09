// __tests__/components/PaymentMethodSelector.test.tsx — v4.9: unit tests for extracted PaymentMethodSelector
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import toast from 'react-hot-toast';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/utils', () => ({
  formatEGP: (n: number) => `EGP ${n.toLocaleString()}`,
}));

import PaymentMethodSelector from '@/components/checkout/PaymentMethodSelector';
import type { PaymentMethod } from '@/components/checkout/PaymentMethodSelector';

const DEFAULT_PROPS = {
  payMethod:          'cod' as PaymentMethod,
  onMethodChange:     jest.fn(),
  couponCode:         '',
  couponDisc:         0,
  subtotal:           10000,
  onCouponCodeChange: jest.fn(),
  onCouponApply:      jest.fn().mockResolvedValue(undefined),
  onCouponRemove:     jest.fn(),
  onBack:             jest.fn(),
  onNext:             jest.fn(),
};

function renderSelector(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  // Reset mocks between tests
  Object.values(props).forEach(v => { if (typeof v === 'function' && (v as jest.Mock).mockClear) (v as jest.Mock).mockClear(); });
  return { ...render(<PaymentMethodSelector {...props} />), props };
}

describe('PaymentMethodSelector', () => {
  // ── Rendering ─────────────────────────────────────────────────
  it('renders both payment options', () => {
    renderSelector();
    expect(screen.getByLabelText(/cash on delivery/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/online payment via paymob/i)).toBeInTheDocument();
  });

  it('shows COD as checked by default', () => {
    renderSelector();
    expect(screen.getByLabelText(/cash on delivery/i)).toBeChecked();
  });

  it('shows paymob as checked when payMethod is paymob', () => {
    renderSelector({ payMethod: 'paymob' });
    expect(screen.getByLabelText(/online payment via paymob/i)).toBeChecked();
    expect(screen.getByLabelText(/cash on delivery/i)).not.toBeChecked();
  });

  it('shows payment brand badges for Paymob option', () => {
    renderSelector();
    expect(screen.getByText('VISA')).toBeInTheDocument();
    expect(screen.getByText('MC')).toBeInTheDocument();
    expect(screen.getByText('Meeza')).toBeInTheDocument();
    expect(screen.getByText('Fawry')).toBeInTheDocument();
  });

  it('renders Back and Review Order buttons', () => {
    renderSelector();
    expect(screen.getByRole('button', { name: /← back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review order/i })).toBeInTheDocument();
  });

  it('renders coupon input when no coupon applied', () => {
    renderSelector();
    expect(screen.getByPlaceholderText(/WELCOME10/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
  });

  // ── Applied coupon state ──────────────────────────────────────
  it('shows applied coupon UI when couponDisc > 0', () => {
    renderSelector({ couponCode: 'SAVE10', couponDisc: 1000 });
    expect(screen.getByText(/✓ SAVE10/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove coupon/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/WELCOME10/i)).not.toBeInTheDocument();
  });

  // ── Interactions ──────────────────────────────────────────────
  it('calls onMethodChange when paymob radio is selected', async () => {
    const user = userEvent.setup();
    const onMethodChange = jest.fn();
    renderSelector({ onMethodChange });

    await user.click(screen.getByLabelText(/online payment via paymob/i));
    expect(onMethodChange).toHaveBeenCalledWith('paymob');
  });

  it('calls onBack when Back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = jest.fn();
    renderSelector({ onBack });

    await user.click(screen.getByRole('button', { name: /← back/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onNext when Review Order button is clicked', async () => {
    const user = userEvent.setup();
    const onNext = jest.fn();
    renderSelector({ onNext });

    await user.click(screen.getByRole('button', { name: /review order/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('calls onCouponCodeChange when typing in coupon field', async () => {
    const user = userEvent.setup();
    const onCouponCodeChange = jest.fn();
    renderSelector({ onCouponCodeChange });

    await user.type(screen.getByPlaceholderText(/WELCOME10/i), 'a');
    expect(onCouponCodeChange).toHaveBeenCalled();
  });

  it('calls onCouponApply when Apply button is clicked', async () => {
    const user = userEvent.setup();
    const onCouponApply = jest.fn().mockResolvedValue(undefined);
    renderSelector({ couponCode: 'SAVE10', onCouponApply });

    await user.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => expect(onCouponApply).toHaveBeenCalledTimes(1));
  });

  it('calls onCouponApply when Enter pressed in coupon field', async () => {
    const user = userEvent.setup();
    const onCouponApply = jest.fn().mockResolvedValue(undefined);
    renderSelector({ couponCode: 'HELLO', onCouponApply });

    await user.type(screen.getByPlaceholderText(/WELCOME10/i), '{Enter}');
    await waitFor(() => expect(onCouponApply).toHaveBeenCalled());
  });

  it('Apply button is disabled when couponCode is empty', () => {
    renderSelector({ couponCode: '' });
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('calls onCouponRemove when Remove button is clicked', async () => {
    const user = userEvent.setup();
    const onCouponRemove = jest.fn();
    renderSelector({ couponCode: 'SAVE10', couponDisc: 1000, onCouponRemove });

    await user.click(screen.getByRole('button', { name: /remove coupon/i }));
    expect(onCouponRemove).toHaveBeenCalledTimes(1);
  });
});
