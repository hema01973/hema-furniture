'use client';
// src/... — HemaV050: extracted from CheckoutPage
import { GOVERNORATES } from '@/lib/constants';

// ── Reusable Field ────────────────────────────────────────────────
export function Field({
  label, id, error, required = false, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string; id: string; error?: string; required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>}
      </label>
      <input
        id={id} name={id}
        aria-required={required} aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={[
          'w-full rounded-xl border px-4 py-3 text-sm',
          'bg-[#FAF8F5] dark:bg-[#0E0904]',
          'text-[#1A1208] dark:text-[#F0EBE2]',
          'placeholder-gray-400 dark:placeholder-gray-600',
          'focus:outline-none focus:ring-2 transition-all',
          error
            ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
            : 'border-[#D0C4B4] dark:border-[#3A2D20] focus:border-[#B8935A] focus:ring-[#B8935A]/10',
        ].join(' ')}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}

// ── Form data type ────────────────────────────────────────────────
export interface FormData {
  firstName: string; lastName: string;
  email: string;     phone: string;
  street: string;    city: string;
  notes: string;
}

// ── ShippingForm ──────────────────────────────────────────────────
interface ShippingFormProps {
  form: FormData;
  formErrors: Partial<FormData>;
  onFieldChange: (field: keyof FormData, value: string) => void;
  onContinue: () => void;
}

export default function ShippingForm({
  form, formErrors, onFieldChange, onContinue,
}: ShippingFormProps) {
  return (
    <section
      className="bg-white dark:bg-[#1A1208] border border-[#E8DDD0] dark:border-[#2A1F14] rounded-2xl p-6 mb-5"
      aria-labelledby="info-heading"
    >
      <h2 id="info-heading" className="font-serif text-2xl text-[#1A1208] dark:text-[#F0EBE2] mb-5">
        Billing Information
      </h2>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field
          id="firstName" label="First Name" required
          value={form.firstName}
          onChange={e => onFieldChange('firstName', e.target.value)}
          placeholder="Mohamed" autoComplete="given-name"
          error={formErrors.firstName}
        />
        <Field
          id="lastName" label="Last Name" required
          value={form.lastName}
          onChange={e => onFieldChange('lastName', e.target.value)}
          placeholder="Ahmed" autoComplete="family-name"
          error={formErrors.lastName}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field
          id="email" label="Email" type="email" required
          value={form.email}
          onChange={e => onFieldChange('email', e.target.value)}
          placeholder="you@example.com" autoComplete="email"
          error={formErrors.email}
        />
        <Field
          id="phone" label="Phone" type="tel" required
          value={form.phone}
          onChange={e => onFieldChange('phone', e.target.value)}
          placeholder="+20 1XX XXX XXXX" autoComplete="tel"
          error={formErrors.phone}
        />
      </div>

      <div className="mb-4">
        <Field
          id="street" label="Street Address" required
          value={form.street}
          onChange={e => onFieldChange('street', e.target.value)}
          placeholder="123 El-Tahrir Street, Apartment 4"
          autoComplete="street-address"
          error={formErrors.street}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="city" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          City / Governorate <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <select
          id="city" name="city"
          value={form.city}
          onChange={e => onFieldChange('city', e.target.value)}
          autoComplete="address-level2"
          className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all"
        >
          {GOVERNORATES.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div className="mb-5">
        <label htmlFor="notes" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Order Notes
          <span className="ml-1 font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          id="notes" name="notes"
          value={form.notes}
          onChange={e => onFieldChange('notes', e.target.value)}
          rows={2} maxLength={500}
          placeholder="Any special instructions for delivery…"
          className="w-full rounded-xl border border-[#D0C4B4] dark:border-[#3A2D20] px-4 py-3 text-sm bg-[#FAF8F5] dark:bg-[#0E0904] text-[#1A1208] dark:text-[#F0EBE2] focus:outline-none focus:border-[#B8935A] focus:ring-2 focus:ring-[#B8935A]/10 transition-all resize-none"
        />
        <div className="text-right text-xs text-gray-400 mt-0.5">{form.notes.length}/500</div>
      </div>

      <button
        onClick={onContinue}
        className="w-full bg-[#B8935A] hover:bg-[#D4B07A] text-white font-semibold py-3.5 rounded-xl transition-colors"
      >
        Continue to Payment →
      </button>
    </section>
  );
}
