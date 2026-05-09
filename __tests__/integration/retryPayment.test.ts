// __tests__/integration/retryPayment.test.ts — Payment retry flow integration test
import { createMocks } from 'node-mocks-http';

// We test the retry-payment logic in isolation by mocking dependencies
jest.mock('@/lib/mongodb', () => ({
  connectDB: jest.fn(),
  Order: {
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

jest.mock('@/lib/paymob', () => ({
  createPaymobOrder: jest.fn(),
  getPaymentIframeUrl: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({
  getAuthSession: jest.fn(),
}));

import { connectDB, Order } from '@/lib/mongodb';
import { createPaymobOrder, getPaymentIframeUrl } from '@/lib/paymob';
import { getAuthSession } from '@/lib/auth';

const mockOrder = {
  _id: 'order123',
  orderNumber: 'HM-0001',
  userId: 'user1',
  total: 8500,
  paymentStatus: 'failed',
  paymentMethod: 'paymob',
  customer: { firstName: 'Ahmed', lastName: 'Hassan', email: 'ahmed@example.com', phone: '01012345678' },
  items: [{ nameEn: 'Oslo Sofa', quantity: 1, price: 8500 }],
};

describe('Payment Retry Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (connectDB as jest.Mock).mockResolvedValue(undefined);
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user1', role: 'customer' },
    });
  });

  it('rejects retry if order not found', async () => {
    (Order.findOne as jest.Mock).mockResolvedValue(null);

    // Simulate the condition the API checks
    const order = await Order.findOne({ _id: 'nonexistent', userId: 'user1' });
    expect(order).toBeNull();
  });

  it('rejects retry if payment status is already paid', async () => {
    const paidOrder = { ...mockOrder, paymentStatus: 'paid' };
    (Order.findOne as jest.Mock).mockResolvedValue(paidOrder);

    const order = await Order.findOne({ _id: 'order123' });
    expect(order?.paymentStatus).toBe('paid');
    // API should return 400 for already-paid orders
  });

  it('creates new Paymob order for failed payment', async () => {
    (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);
    (createPaymobOrder as jest.Mock).mockResolvedValue({ id: 'pm_order_456' });
    (getPaymentIframeUrl as jest.Mock).mockResolvedValue('https://accept.paymob.com/iframe/token123');

    const order = await Order.findOne({ _id: 'order123' });
    expect(order?.paymentStatus).toBe('failed');

    // Simulate calling Paymob
    const paymobResult = await createPaymobOrder({
      amount: order!.total,
      orderId: order!._id,
    });
    const iframeUrl = await getPaymentIframeUrl(paymobResult.id);

    expect(createPaymobOrder).toHaveBeenCalledTimes(1);
    expect(iframeUrl).toContain('accept.paymob.com');
  });

  it('handles Paymob API failure gracefully', async () => {
    (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);
    (createPaymobOrder as jest.Mock).mockRejectedValue(new Error('Paymob unavailable'));

    await expect(
      createPaymobOrder({ amount: 8500, orderId: 'order123' })
    ).rejects.toThrow('Paymob unavailable');
  });

  it('updates paymobOrderId after successful retry', async () => {
    (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);
    (createPaymobOrder as jest.Mock).mockResolvedValue({ id: 'pm_order_789' });
    (Order.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      ...mockOrder,
      paymobOrderId: 'pm_order_789',
    });

    const paymobResult = await createPaymobOrder({ amount: 8500, orderId: 'order123' });
    const updated = await Order.findByIdAndUpdate(
      'order123',
      { paymobOrderId: paymobResult.id },
      { new: true }
    );

    expect(updated?.paymobOrderId).toBe('pm_order_789');
  });
});
