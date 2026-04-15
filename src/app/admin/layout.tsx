'use client';
// src/app/admin/layout.tsx — FIXED: proper auth check, complete nav
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';

const NAV = [
  { href: '/admin',          icon: '📊', label: 'Dashboard'  },
  { href: '/admin/products', icon: '📦', label: 'Products'   },
  { href: '/admin/orders',   icon: '🧾', label: 'Orders'     },
  { href: '/admin/users',    icon: '👥', label: 'Customers'  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router   = useRouter();

  // Client-side guard (middleware is primary protection)
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login?callbackUrl=/admin');
    if (status === 'authenticated' && session.user.role !== 'admin' && session.user.role !== 'staff') {
      router.replace('/');
    }
  }, [status, session, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F2EDE6] dark:bg-[#0A0604]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#B8935A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || (session?.user.role !== 'admin' && session?.user.role !== 'staff')) {
    return null; // middleware handles redirect; this prevents flash
  }

  return (
    <div className="flex min-h-screen bg-[#F2EDE6] dark:bg-[#0A0604]" dir="ltr">
      {/* Sidebar */}
      <aside className="w-[230px] bg-gradient-to-b from-[#1A0F08] to-[#0E0904] flex flex-col flex-shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div className="px-5 py-6 border-b border-white/8">
          <div className="font-serif text-[17px] text-[#FAF8F5] mb-1">Hema Furniture</div>
          <div className="inline-flex px-2 py-0.5 rounded bg-[#B8935A]/20 text-[#D4B07A] text-[10px] font-bold uppercase tracking-wide capitalize">
            {session?.user.role}
          </div>
        </div>

        <nav className="flex-1 py-2">
          {NAV.map(item => {
            const active = item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-5 py-3 text-sm transition-all border-l-2 ${active
                  ? 'text-[#D4B07A] bg-white/6 border-l-[#B8935A]'
                  : 'text-[#8A7868] border-l-transparent hover:text-[#FAF8F5] hover:bg-white/4'}`}>
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/8 p-4 space-y-1">
          <div className="text-xs text-[#5A4A3A] truncate mb-2">{session?.user.name} · {session?.user.email}</div>
          <Link href="/" target="_blank" className="flex items-center gap-2 text-sm text-[#7A6858] hover:text-[#FAF8F5] transition-colors py-1.5 px-2 rounded hover:bg-white/5">
            🌐 View Store
          </Link>
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors py-1.5 px-2 rounded hover:bg-red-500/10 w-full text-left">
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
