// src/lib/auth.ts
import { AuthOptions, getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { connectDB, User } from './mongodb';
import type { UserRole } from '@/types';

declare module 'next-auth' {
  interface User { id: string; role: UserRole; }
  interface Session { user: { id: string; name: string; email: string; role: UserRole; image?: string } }
}
declare module 'next-auth/jwt' {
  interface JWT { id: string; role: UserRole; }
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        await connectDB();
        const user = await User.findOne({ email: credentials.email.toLowerCase() }).select('+passwordHash');
        if (!user || !user.isActive) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });
        return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
      },
    }),
    // Uncomment to enable Google OAuth
    // GoogleProvider({
    //   clientId: process.env.GOOGLE_CLIENT_ID!,
    //   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    // }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.role = user.role; }
      return token;
    },
    async session({ session, token }) {
      session.user.id   = token.id;
      session.user.role = token.role;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error:  '/login',
  },
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
};

export const getAuthSession = () => getServerSession(authOptions);

// ─── Helpers ───────────────────────────────────────────────
export async function requireAuth() {
  const session = await getAuthSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}

export async function requireAdmin() {
  const session = await getAuthSession();
  if (!session || session.user.role !== 'admin') throw new Error('FORBIDDEN');
  return session;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
