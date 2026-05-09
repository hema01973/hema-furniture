import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Hema Modern Furniture',
  description: 'Terms and conditions for shopping at Hema Modern Furniture.',
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="font-serif text-xl text-[#1A1208] dark:text-[#F0EBE2] mb-3">{title}</h2>
    <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-2">{children}</div>
  </section>
);

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904]">
      <div className="bg-gradient-to-r from-[#190F07] to-[#3A2010] py-16 px-6">
        <div className="max-w-[800px] mx-auto">
          <h1 className="font-serif text-4xl text-[#FAF8F5] mb-2">Terms of Service</h1>
          <p className="text-[#C8B898] text-sm">Last updated: April 2026</p>
        </div>
      </div>
      <div className="max-w-[800px] mx-auto px-6 py-14">
        <Section title="1. Acceptance of Terms">
          <p>By placing an order or creating an account on hemafurniture.com, you agree to be bound by these Terms of Service and our Privacy Policy.</p>
        </Section>
        <Section title="2. Orders & Pricing">
          <p>All prices are listed in Egyptian Pounds (EGP) and include VAT where applicable. Hema reserves the right to refuse or cancel any order at our discretion.</p>
          <p>Order confirmation does not guarantee availability. In the event of a stock issue, we will contact you promptly.</p>
        </Section>
        <Section title="3. Shipping & Delivery">
          <p>We deliver across Egypt. Standard delivery takes 5–7 business days in Cairo and Giza, and 10–14 business days for other governorates.</p>
          <p>Free shipping is applied to orders over EGP 5,000. Shipping fees are non-refundable unless the error is ours.</p>
        </Section>
        <Section title="4. Returns & Refunds">
          <p>You may return unused items in their original packaging within 14 days of delivery. Custom-made or assembled items are non-returnable.</p>
          <p>Refunds are processed to the original payment method within 7–14 business days after we receive the returned item.</p>
        </Section>
        <Section title="5. Payments">
          <p>We accept Cash on Delivery, Visa, Mastercard, Meeza, Fawry, and Valu. Online payments are processed securely via Paymob (PCI DSS Level 1 compliant).</p>
        </Section>
        <Section title="6. Account Responsibility">
          <p>You are responsible for maintaining the confidentiality of your account credentials. Notify us immediately at hello@hemafurniture.com if you suspect unauthorized access.</p>
        </Section>
        <Section title="7. Governing Law">
          <p>These terms are governed by the laws of the Arab Republic of Egypt. Any disputes shall be subject to the exclusive jurisdiction of Egyptian courts.</p>
        </Section>
        <Section title="8. Contact">
          <p>For any questions about these terms, contact us at <a href="mailto:hello@hemafurniture.com" className="text-[#B8935A] hover:underline">hello@hemafurniture.com</a>.</p>
        </Section>
      </div>
    </div>
  );
}
