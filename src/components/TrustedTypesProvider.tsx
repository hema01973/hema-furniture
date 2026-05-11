'use client';

import { useEffect } from 'react';

export function TrustedTypesProvider() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      (window as any).trustedTypes?.createPolicy
    ) {
      try {
        (window as any).trustedTypes.createPolicy('default', {
          createHTML: (s: string) => s,
          createScriptURL: (s: string) => s,
          createScript: (s: string) => s,
        });
      } catch {
        // policy already exists
      }
    }
  }, []);
  return null;
}