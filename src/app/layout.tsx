// src/... — HemaV050: separate viewport export (Next.js 14+), Vercel Analytics
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import { Cormorant_Garamond, DM_Sans, Tajawal } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import { Analytics }     from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Providers from './providers';
import { TrustedTypesProvider } from '@/components/TrustedTypesProvider';
import './globals.css';

const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400','500','600'], style: ['normal','italic'], variable: '--font-serif', display: 'swap' });
const dmSans    = DM_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const tajawal   = Tajawal({ subsets: ['arabic'], weight: ['300','400','500','700'], variable: '--font-arabic', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://hemafurniture.com'),
  title: { default: 'Hema Modern Furniture — هيما للأثاث العصري', template: '%s | Hema Furniture' },
  description: 'Premium modern furniture for Egyptian homes. Shop living room, bedroom, dining, and office collections. Free shipping over EGP 5,000.',
  keywords: ['furniture egypt', 'modern furniture cairo', 'أثاث مصر', 'أثاث عصري', 'هيما للأثاث'],
  openGraph: {
    type: 'website', locale: 'ar_EG', alternateLocale: ['en_US'],
    siteName: 'Hema Modern Furniture',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630 }],
  },
  twitter:  { card: 'summary_large_image', creator: '@hemafurniture' },
  robots:   { index: true, follow: true },
  icons:    { icon: '/favicon.ico', apple: '/apple-touch-icon.png' },
  verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION },
};

// ── Viewport — must be exported separately in Next.js 14+ ─────────
export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  themeColor:   [
    { media: '(prefers-color-scheme: light)', color: '#FAF8F5' },
    { media: '(prefers-color-scheme: dark)',  color: '#0E0904' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const nonce   = headerStore.get('x-nonce') ?? '';
  const rawLang = cookieStore.get('hema-lang')?.value ?? 'en';
  const lang    = rawLang === 'ar' ? 'ar' : 'en';
  const dir     = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        {nonce && <meta name="csp-nonce" content={nonce} />}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://res.cloudinary.com" />
      </head>
      <body className={[cormorant.variable, dmSans.variable, tajawal.variable, 'font-sans antialiased', 'bg-[#FAF8F5] text-[#1A1208]', 'dark:bg-[#0E0904] dark:text-[#F0EBE2]', 'transition-colors duration-300', lang === 'ar' ? 'font-arabic' : ''].filter(Boolean).join(' ')}>
        <TrustedTypesProvider />
        <Providers nonce={nonce} initialLang={lang}>
          {children}
          <Toaster
            position={lang === 'ar' ? 'bottom-left' : 'bottom-right'}
            toastOptions={{
              style: { fontFamily: lang === 'ar' ? 'var(--font-arabic)' : 'var(--font-sans)', fontSize: '14px', borderRadius: '10px' },
              success: { iconTheme: { primary: '#B8935A', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
              duration: 2800,
            }}
          />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
