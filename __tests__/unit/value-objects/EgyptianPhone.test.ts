// __tests__/unit/value-objects/EgyptianPhone.test.ts — V049
// TEST-GAP-02 FIX: unit tests for EgyptianPhone value object.
// EgyptianPhone is the single source of truth for phone validation in the domain.

import { EgyptianPhone } from '@/domain/shared/value-objects/EgyptianPhone';

describe('EgyptianPhone', () => {
  // ── validate ──────────────────────────────────────────────────────────────
  describe('validate', () => {
    it.each([
      '+201012345678',   // Vodafone with country code
      '01012345678',     // Vodafone local
      '+201112345678',   // Etisalat/e& with country code
      '01112345678',     // Etisalat local
      '+201212345678',   // Orange with country code
      '01212345678',     // Orange local
      '+201512345678',   // WE with country code
      '01512345678',     // WE local
    ])('accepts valid number %s', (phone) => {
      expect(EgyptianPhone.validate(phone)).toBe(true);
    });

    it.each([
      '0201012345678',   // incorrect country code prefix
      '0912345678',      // too short — 9 digits
      '+2001012345678',  // double country code
      '1012345678',      // missing leading 0 or +20
      '+201312345678',   // 013 is not a valid prefix
      '+201412345678',   // 014 is not a valid prefix
      '00201012345678',  // 00 prefix instead of +
      'abc01012345678',  // non-numeric prefix
      '010123456789',    // too long — 12 digits after 01
      '',                // empty string
    ])('rejects invalid number %s', (phone) => {
      expect(EgyptianPhone.validate(phone)).toBe(false);
    });

    it('ignores spaces in phone numbers', () => {
      expect(EgyptianPhone.validate('0101 234 5678')).toBe(true);
      expect(EgyptianPhone.validate('+20 101 234 5678')).toBe(true);
    });
  });

  // ── normalize ─────────────────────────────────────────────────────────────
  describe('normalize', () => {
    it('normalizes local format to +20 format', () => {
      expect(EgyptianPhone.normalize('01012345678')).toBe('+201012345678');
    });

    it('keeps +20 format unchanged', () => {
      expect(EgyptianPhone.normalize('+201012345678')).toBe('+201012345678');
    });

    it('throws on invalid phone number', () => {
      expect(() => EgyptianPhone.normalize('invalid')).toThrow('Invalid Egyptian phone number');
      expect(() => EgyptianPhone.normalize('0912345678')).toThrow('Invalid Egyptian phone number');
    });

    it('normalizes all valid prefixes correctly', () => {
      expect(EgyptianPhone.normalize('01112345678')).toBe('+201112345678');
      expect(EgyptianPhone.normalize('01212345678')).toBe('+201212345678');
      expect(EgyptianPhone.normalize('01512345678')).toBe('+201512345678');
    });
  });

  // ── from ─────────────────────────────────────────────────────────────────
  describe('from', () => {
    it('creates an EgyptianPhone from a valid number', () => {
      const phone = EgyptianPhone.from('01012345678');
      expect(phone.toString()).toBe('+201012345678');
    });

    it('throws on invalid phone', () => {
      expect(() => EgyptianPhone.from('invalid')).toThrow('Invalid Egyptian phone number');
    });
  });

  // ── toString / toLocalFormat ──────────────────────────────────────────────
  describe('toString and toLocalFormat', () => {
    it('toString returns +20 format', () => {
      const phone = EgyptianPhone.from('01012345678');
      expect(phone.toString()).toBe('+201012345678');
    });

    it('toLocalFormat returns 0XX format', () => {
      const phone = EgyptianPhone.from('+201012345678');
      expect(phone.toLocalFormat()).toBe('01012345678');
    });

    it('roundtrips correctly', () => {
      const original = '01512345678';
      const phone = EgyptianPhone.from(original);
      expect(phone.toLocalFormat()).toBe(original);
    });
  });

  // ── equals ───────────────────────────────────────────────────────────────
  describe('equals', () => {
    it('returns true for same normalized number', () => {
      const a = EgyptianPhone.from('01012345678');
      const b = EgyptianPhone.from('+201012345678');
      expect(a.equals(b)).toBe(true);
    });

    it('returns false for different numbers', () => {
      const a = EgyptianPhone.from('01012345678');
      const b = EgyptianPhone.from('01112345678');
      expect(a.equals(b)).toBe(false);
    });
  });
});
