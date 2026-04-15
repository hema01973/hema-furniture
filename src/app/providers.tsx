'use client';
// src/app/providers.tsx
import { SessionProvider } from 'next-auth/react';
import { SWRConfig } from 'swr';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig value={{
        revalidateOnFocus: false,
        errorRetryCount:   3,
        errorRetryInterval: 5000,
        onError: (error: unknown) => {
          if (process.env.NODE_ENV !== 'production') console.error('[SWR Error]', error);
        },
      }}>
        {children}
      </SWRConfig>
    </SessionProvider>
  );
}
