'use client';
// src/... — HemaV050: syncs lang cookie + dark class to document
import { SessionProvider, useSession } from 'next-auth/react';
import { SWRConfig } from 'swr';
import { useEffect } from 'react';
import { useUIStore, useWishlistStore } from '@/store/cartStore';

interface ProvidersProps {
  children:    React.ReactNode;
  nonce:       string;
  initialLang: 'en' | 'ar';
}

function LangSync({ initialLang }: { initialLang: 'en' | 'ar' }) {
  const { lang, dark, toggleDark } = useUIStore();

  /* Sync html[lang], html[dir] and cookie on every change */
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', lang);
    root.setAttribute('dir',  lang === 'ar' ? 'rtl' : 'ltr');

    // Persist to cookie so SSR layout can read it on next full page load
    document.cookie = `hema-lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
  }, [lang]);

  /* Sync dark class */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return null;
}

function WishlistSync() {
  const { data: session } = useSession();
  const { ids, toggle } = useWishlistStore();

  useEffect(() => {
    if (!session?.user?.id) return;
    // Fetch DB wishlist and merge with localStorage on login
    fetch('/api/v1/users/wishlist/sync')
      .then(r => r.json())
      .then(json => {
        if (!json.success || !Array.isArray(json.data?.wishlist)) return;
        const dbIds: string[] = json.data.wishlist;
        // Add DB items not in localStorage (one-way merge: DB wins for new devices)
        dbIds.forEach(id => { if (!ids.includes(id)) toggle(id); });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  return null;
}

export default function Providers({ children, nonce, initialLang }: ProvidersProps) {
  return (
    <SessionProvider>
      <SWRConfig
        value={{
          revalidateOnFocus:  false,
          errorRetryCount:    3,
          errorRetryInterval: 5000,
          onError: (error: unknown) => {
            // V072 FIX: logger.ts uses async_hooks (Node.js built-in) which is not
            // available in the browser bundle. Client-side SWR errors are logged via
            // console only — PII redaction for client errors is handled server-side
            // when the error is reported to the API (e.g. /api/csp-report).
            // Do NOT import '@/lib/logger' here — it pulls async_hooks into the bundle.
            if (process.env.NODE_ENV !== 'production') {
              console.error('[SWR]', error);
            } else {
              // In production: suppress noisy SWR errors from console.
              // Server-side errors are captured by Sentry via sentry.client.config.ts.
              const msg = error instanceof Error ? error.message : String(error);
              console.warn('[SWR] fetch error:', msg);
            }
          },
        }}
      >
        <LangSync initialLang={initialLang} />
        <WishlistSync />
        {children}
      </SWRConfig>
    </SessionProvider>
  );
}
