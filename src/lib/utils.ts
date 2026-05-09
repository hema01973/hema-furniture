// src/lib/utils.ts — Shared utilities
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes safely — prevents conflicting utilities.
 * Requires: npm install clsx tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format EGP currency */
export function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString('en-EG')}`;
}

/** Format date in Egyptian locale */
export function formatDate(date: Date | string, locale: 'en' | 'ar' = 'en'): string {
  return new Date(date).toLocaleDateString(
    locale === 'ar' ? 'ar-EG' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric' }
  );
}

/** Truncate text */
export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

/** Sleep (for rate limiting tests) */
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
