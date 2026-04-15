// src/app/layout.tsx
import type { Metadata } from 'next';
import { Cormorant_Garamond, DM_Sans, Tajawal } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import Providers from './providers';
import './globals.css';

const cormorant = Cormorant_Garamond({ subsets:['latin'], weight:['400','500','600'], style:['normal','italic'], variable:'--font-serif', display:'swap' });
const dmSans    = DM_Sans({ subsets:['latin'], variable:'--font-sans', display:'swap' });
const tajawal   = Tajawal({ subsets:['arabic'], weight:['300','400','500','700'], variable:'--font-arabic', display:'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://hemafurniture.com'),
  title: { default: 'Hema Modern Furniture — هيما للأثاث العصري', template: '%s | Hema Furniture' },
  description: 'Premium modern furniture for Egyptian homes. Shop living room, bedroom, dining, and office collections. Free shipping over EGP 5,000.',
  keywords: ['furniture egypt','modern furniture cairo','أثاث مصر','أثاث عصري','هيما للأثاث'],
  openGraph: {
    type:'website', locale:'ar_EG', alternateLocale:['en_US'], siteName:'Hema Modern Furniture',
    images:[{ url:'/og-image.jpg', width:1200, height:630 }],
  },
  twitter: { card:'summary_large_image', creator:'@hemafurniture' },
  robots: { index:true, follow:true },
  icons: { icon:'/favicon.ico', apple:'/apple-touch-icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={`${cormorant.variable} ${dmSans.variable} ${tajawal.variable} font-sans antialiased bg-[#FAF8F5] text-[#1A1208] dark:bg-[#0E0904] dark:text-[#F0EBE2] transition-colors duration-300`}>
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: { fontFamily: 'var(--font-sans)', fontSize: '14px', borderRadius: '10px' },
              success: { iconTheme: { primary: '#B8935A', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
              duration: 2500,
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
