// __tests__/components/Skeleton.test.tsx — RTL tests for skeleton components
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Skeleton,
  ProductCardSkeleton,
  OrderCardSkeleton,
  TableRowSkeleton,
} from '@/components/ui/Skeleton';

describe('Skeleton', () => {
  it('renders with animate-pulse class', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="h-8 w-24" />);
    expect(container.firstChild).toHaveClass('h-8', 'w-24');
  });
});

describe('ProductCardSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<ProductCardSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('contains image and text skeleton areas', () => {
    const { container } = render(<ProductCardSkeleton />);
    // Should have multiple animated elements
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThan(0);
  });
});

describe('OrderCardSkeleton', () => {
  it('renders without crashing', () => {
    const { container } = render(<OrderCardSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe('TableRowSkeleton', () => {
  it('renders default 5 columns', () => {
    render(
      <table>
        <tbody>
          <TableRowSkeleton />
        </tbody>
      </table>
    );
    const cells = screen.getAllByRole('cell');
    expect(cells).toHaveLength(5);
  });

  it('renders custom column count', () => {
    render(
      <table>
        <tbody>
          <TableRowSkeleton cols={3} />
        </tbody>
      </table>
    );
    const cells = screen.getAllByRole('cell');
    expect(cells).toHaveLength(3);
  });
});
