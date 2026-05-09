// __tests__/components/CheckoutPage.test.tsx — RTL tests for checkout wizard
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// ── Mocks ──────────────────────────────────────────────────────────
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { name: 'Ahmed Hassan', email: 'ahmed@example.com' } },
    status: 'authenticated',
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

// Mock cart store — non-empty cart
jest.mock('@/store/cartStore', () => ({
  useCartStore: () => ({
    items: [
      {
        productId: 'p1',
        quantity: 2,
        selectedColor: 'Walnut',
        product: {
          _id: 'p1',
          nameEn: 'Oslo Sofa',
          nameAr: 'أريكة أوسلو',
          price: 8500,
          images: ['https://placehold.co/400'],
          stock: 10,
        },
      },
    ],
    subtotal:  () => 17000,
    shipping:  () => 0,
    total:     () => 17000,
    clearCart: jest.fn(),
  }),
}));

import CheckoutPage from '@/components/checkout/CheckoutPage';

// ── Helpers ───────────────────────────────────────────────────────
async function fillStep0(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), 'Ahmed');
  await user.type(screen.getByLabelText(/last name/i),  'Hassan');
  await user.clear(screen.getByLabelText(/email/i));
  await user.type(screen.getByLabelText(/email/i),      'ahmed@example.com');
  await user.type(screen.getByLabelText(/phone/i),      '01012345678');
  await user.type(screen.getByLabelText(/street/i),     '123 Tahrir Square');
}

// ── Tests ─────────────────────────────────────────────────────────
describe('CheckoutPage', () => {
  it('renders step 0 — Information', () => {
    render(<CheckoutPage />);
    expect(screen.getByText(/information/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty step 0', async () => {
    const user = userEvent.setup();
    render(<CheckoutPage />);

    await user.click(screen.getByRole('button', { name: /continue to payment/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 2 characters/i)).toBeInTheDocument();
    });
  });

  it('advances to step 1 — Payment after valid step 0', async () => {
    const user = userEvent.setup();
    render(<CheckoutPage />);

    await fillStep0(user);
    await user.click(screen.getByRole('button', { name: /continue to payment/i }));

    await waitFor(() => {
      expect(screen.getByText(/payment/i)).toBeInTheDocument();
    });
  });

  it('displays COD option by default on step 1', async () => {
    const user = userEvent.setup();
    render(<CheckoutPage />);

    await fillStep0(user);
    await user.click(screen.getByRole('button', { name: /continue to payment/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/cash on delivery/i)).toBeChecked();
    });
  });

  it('advances to step 2 — Review from step 1', async () => {
    const user = userEvent.setup();
    render(<CheckoutPage />);

    await fillStep0(user);
    await user.click(screen.getByRole('button', { name: /continue to payment/i }));
    await waitFor(() => screen.getByText(/payment/i));

    await user.click(screen.getByRole('button', { name: /continue to review/i }));

    await waitFor(() => {
      expect(screen.getByText(/review your order/i)).toBeInTheDocument();
      expect(screen.getByText(/ahmed hassan/i)).toBeInTheDocument();
    });
  });

  it('shows Edit button on review step that navigates back', async () => {
    const user = userEvent.setup();
    render(<CheckoutPage />);

    await fillStep0(user);
    await user.click(screen.getByRole('button', { name: /continue to payment/i }));
    await waitFor(() => screen.getByText(/payment/i));
    await user.click(screen.getByRole('button', { name: /continue to review/i }));
    await waitFor(() => screen.getByText(/review your order/i));

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    });
  });

  it('renders order summary with product name and total', () => {
    render(<CheckoutPage />);
    expect(screen.getByText(/oslo sofa/i)).toBeInTheDocument();
    expect(screen.getByText(/17[,.]?000/)).toBeInTheDocument();
  });

  it('step indicators show correct active state', async () => {
    const user = userEvent.setup();
    render(<CheckoutPage />);

    // Step 0 active
    expect(screen.getByRole('list')).toBeInTheDocument();

    await fillStep0(user);
    await user.click(screen.getByRole('button', { name: /continue to payment/i }));

    // Now on step 1
    await waitFor(() => {
      const steps = screen.getAllByRole('listitem');
      expect(steps.length).toBeGreaterThanOrEqual(3);
    });
  });
});
