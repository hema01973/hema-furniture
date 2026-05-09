import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Hema Modern Furniture',
  description: 'How Hema Modern Furniture collects, uses, and protects your personal information.',
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">{title}</h2>
    <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-2">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-16 px-6">
        <div className="max-w-[800px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5] mb-2">Privacy Policy</h1>
          <p className="text-[#C8B898] text-sm">Last updated: April 2026</p>
        </div>
      </div>
      <div className="max-w-[800px] mx-auto px-6 py-14">
        <Section title="1. Information We Collect">
          <p>When you create an account or place an order, we collect your name, email, phone number, and shipping address.</p>
          <p>We also collect usage data such as pages visited and products viewed to improve our service.</p>
        </Section>
        <Section title="2. How We Use Your Information">
          <p>Your data is used to process orders, send order updates, provide customer support, and improve our website.</p>
          <p>We do not sell your personal information to third parties.</p>
        </Section>
        <Section title="3. Payment Data">
          <p>We do not store your payment card details. All card transactions are processed by Paymob, which is PCI DSS Level 1 certified.</p>
        </Section>
        <Section title="4. Cookies">
          <p>We use essential cookies for session management and CSRF protection. We use analytics cookies (Vercel Analytics) to understand site usage. You can disable non-essential cookies in your browser settings.</p>
        </Section>
        <Section title="5. Data Retention">
          <p>Order records are retained for 7 years as required by Egyptian tax regulations. Account data is deleted upon request unless retention is legally required.</p>
        </Section>
        <Section title="6. Your Rights">
          <p>You have the right to access, correct, or delete your personal data. To exercise these rights, email us at <a href="mailto:privacy@hemafurniture.com" className="text-[#B8935A] hover:underline">privacy@hemafurniture.com</a>.</p>
        </Section>
        <Section title="7. Security">
          <p>We use industry-standard security measures including HTTPS encryption, CSRF protection, and rate limiting to protect your data.</p>
        </Section>
        <Section title="8. Contact">
          <p>Questions about this policy? Contact us at <a href="mailto:privacy@hemafurniture.com" className="text-[#B8935A] hover:underline">privacy@hemafurniture.com</a>.</p>
        </Section>
      </div>
    </div>
  );
}
