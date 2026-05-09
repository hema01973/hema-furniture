// __tests__/unit/layout-metadata.test.ts — V031
// Verify layout.tsx has correct separate viewport export + metadata fields
import * as fs from 'fs';
import * as path from 'path';

const LAYOUT_SRC = path.resolve(__dirname, '../../src/app/layout.tsx');
const src = fs.readFileSync(LAYOUT_SRC, 'utf-8');

describe('layout.tsx — Viewport export (Next.js 14+)', () => {
  it('imports Viewport type from next', () => {
    expect(src).toContain('Viewport');
    expect(src).toMatch(/from ['"]next['"]/);
  });

  it('exports a viewport const (not inside metadata)', () => {
    expect(src).toMatch(/export const viewport/);
  });

  it('sets width to device-width', () => {
    expect(src).toContain('device-width');
  });

  it('sets initialScale to 1', () => {
    expect(src).toContain('initialScale: 1');
  });

  it('includes themeColor for light mode', () => {
    expect(src).toContain('prefers-color-scheme: light');
  });

  it('includes themeColor for dark mode', () => {
    expect(src).toContain('prefers-color-scheme: dark');
  });

  it('uses brand colors for themeColor (#FAF8F5 light, #0E0904 dark)', () => {
    expect(src).toContain('#FAF8F5');
    expect(src).toContain('#0E0904');
  });
});

describe('layout.tsx — Metadata', () => {
  it('exports a metadata const', () => {
    expect(src).toMatch(/export const metadata/);
  });

  it('has metadataBase set', () => {
    expect(src).toContain('metadataBase');
  });

  it('uses NEXT_PUBLIC_APP_URL env var in metadataBase', () => {
    expect(src).toContain('NEXT_PUBLIC_APP_URL');
  });

  it('has Arabic and English title', () => {
    expect(src).toContain('Hema Modern Furniture');
    expect(src).toContain('هيما');
  });

  it('has openGraph configuration', () => {
    expect(src).toContain('openGraph');
  });

  it('has twitter card configuration', () => {
    expect(src).toContain('twitter');
  });

  it('has robots: index + follow', () => {
    expect(src).toContain('index: true');
    expect(src).toContain('follow: true');
  });

  it('has favicon icon configured', () => {
    expect(src).toContain('favicon.ico');
  });
});

describe('layout.tsx — Font configuration', () => {
  it('loads Cormorant Garamond (serif)', () => {
    expect(src).toContain('Cormorant_Garamond');
  });

  it('loads DM Sans (sans-serif)', () => {
    expect(src).toContain('DM_Sans');
  });

  it('loads Tajawal (Arabic)', () => {
    expect(src).toContain('Tajawal');
  });

  it('sets display:swap for all fonts (avoids FOUT)', () => {
    const swapMatches = (src.match(/display: 'swap'/g) ?? []).length;
    expect(swapMatches).toBeGreaterThanOrEqual(3);
  });
});

describe('layout.tsx — Accessibility + i18n', () => {
  it('sets lang attribute from cookie', () => {
    expect(src).toContain('hema-lang');
  });

  it('supports RTL direction for Arabic', () => {
    expect(src).toContain("'rtl'");
  });

  it('has suppressHydrationWarning for dark mode', () => {
    expect(src).toContain('suppressHydrationWarning');
  });
});
