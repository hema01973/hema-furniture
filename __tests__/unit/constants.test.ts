// __tests__/unit/constants.test.ts — Unit tests for shared constants
import {
  STATUS_COLOR,
  PAYMENT_STATUS_COLOR,
  TRACKING_STEPS,
  getTrackingStepIndex,
  GOVERNORATES,
  PRODUCT_CATEGORIES,
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_COST,
  BRAND,
} from '@/lib/constants';
import type { OrderStatus } from '@/types';

describe('STATUS_COLOR', () => {
  const statuses: OrderStatus[] = [
    'pending','confirmed','processing','shipped',
    'out_for_delivery','delivered','cancelled',
  ];

  it.each(statuses)('has a colour for status "%s"', (status) => {
    expect(STATUS_COLOR[status]).toBeTruthy();
    expect(typeof STATUS_COLOR[status]).toBe('string');
  });

  it('delivered is green', () => {
    expect(STATUS_COLOR.delivered).toContain('green');
  });

  it('cancelled is red', () => {
    expect(STATUS_COLOR.cancelled).toContain('red');
  });
});

describe('PAYMENT_STATUS_COLOR', () => {
  it('has entries for paid, pending, failed, refunded', () => {
    expect(PAYMENT_STATUS_COLOR.paid).toBeTruthy();
    expect(PAYMENT_STATUS_COLOR.pending).toBeTruthy();
    expect(PAYMENT_STATUS_COLOR.failed).toBeTruthy();
    expect(PAYMENT_STATUS_COLOR.refunded).toBeTruthy();
  });
});

describe('TRACKING_STEPS', () => {
  it('has 6 steps', () => {
    expect(TRACKING_STEPS).toHaveLength(6);
  });

  it('starts with pending and ends with delivered', () => {
    expect(TRACKING_STEPS[0].key).toBe('pending');
    expect(TRACKING_STEPS[TRACKING_STEPS.length - 1].key).toBe('delivered');
  });

  it('every step has key, label, and icon', () => {
    TRACKING_STEPS.forEach(step => {
      expect(step.key).toBeTruthy();
      expect(step.label).toBeTruthy();
      expect(step.icon).toBeTruthy();
    });
  });
});

describe('getTrackingStepIndex', () => {
  it('returns -1 for cancelled', () => {
    expect(getTrackingStepIndex('cancelled')).toBe(-1);
  });

  it('returns 0 for pending', () => {
    expect(getTrackingStepIndex('pending')).toBe(0);
  });

  it('returns last index for delivered', () => {
    expect(getTrackingStepIndex('delivered')).toBe(TRACKING_STEPS.length - 1);
  });
});

describe('GOVERNORATES', () => {
  it('includes Cairo and Giza', () => {
    expect(GOVERNORATES).toContain('Cairo');
    expect(GOVERNORATES).toContain('Giza');
  });

  it('has at least 20 governorates', () => {
    expect(GOVERNORATES.length).toBeGreaterThanOrEqual(20);
  });
});

describe('PRODUCT_CATEGORIES', () => {
  it('has 5 categories', () => {
    expect(PRODUCT_CATEGORIES).toHaveLength(5);
  });

  it('each category has key, labelEn, labelAr, icon', () => {
    PRODUCT_CATEGORIES.forEach(cat => {
      expect(cat.key).toBeTruthy();
      expect(cat.labelEn).toBeTruthy();
      expect(cat.labelAr).toBeTruthy();
      expect(cat.icon).toBeTruthy();
    });
  });
});

describe('Shipping thresholds', () => {
  it('FREE_SHIPPING_THRESHOLD is 5000 EGP', () => {
    expect(FREE_SHIPPING_THRESHOLD).toBe(5000);
  });

  it('SHIPPING_COST is positive', () => {
    expect(SHIPPING_COST).toBeGreaterThan(0);
  });
});

describe('BRAND colors', () => {
  it('gold is a valid hex color', () => {
    expect(BRAND.gold).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('has espresso, cream, goldLight, goldDark', () => {
    expect(BRAND.espresso).toBeTruthy();
    expect(BRAND.cream).toBeTruthy();
    expect(BRAND.goldLight).toBeTruthy();
    expect(BRAND.goldDark).toBeTruthy();
  });
});
