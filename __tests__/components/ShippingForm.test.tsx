// __tests__/components/ShippingForm.test.tsx — v4.9: unit tests for extracted ShippingForm
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('@/lib/constants', () => ({
  GOVERNORATES: ['Cairo', 'Giza', 'Alexandria', 'Luxor'],
}));

import ShippingForm from '@/components/checkout/ShippingForm';
import type { FormData } from '@/components/checkout/ShippingForm';

const DEFAULT_FORM: FormData = {
  firstName: '', lastName: '', email: '',
  phone: '', street: '', city: 'Cairo', notes: '',
};

const DEFAULT_ERRORS: Partial<FormData> = {};

function renderForm(overrides: Partial<{
  form: FormData;
  formErrors: Partial<FormData>;
  onFieldChange: jest.Mock;
  onContinue: jest.Mock;
}> = {}) {
  const props = {
    form:          overrides.form          ?? DEFAULT_FORM,
    formErrors:    overrides.formErrors    ?? DEFAULT_ERRORS,
    onFieldChange: overrides.onFieldChange ?? jest.fn(),
    onContinue:    overrides.onContinue    ?? jest.fn(),
  };
  return { ...render(<ShippingForm {...props} />), ...props };
}

describe('ShippingForm', () => {
  // ── Rendering ─────────────────────────────────────────────────
  it('renders all required fields', () => {
    renderForm();
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/city \/ governorate/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/order notes/i)).toBeInTheDocument();
  });

  it('renders the Continue button', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /continue to payment/i })).toBeInTheDocument();
  });

  it('renders governorates in the city dropdown', () => {
    renderForm();
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cairo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Giza' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alexandria' })).toBeInTheDocument();
  });

  it('displays pre-filled values from form prop', () => {
    renderForm({
      form: { ...DEFAULT_FORM, firstName: 'Ahmed', email: 'ahmed@example.com' },
    });
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ahmed');
    expect(screen.getByLabelText(/email/i)).toHaveValue('ahmed@example.com');
  });

  // ── Error display ─────────────────────────────────────────────
  it('shows field-level error messages when formErrors provided', () => {
    renderForm({
      formErrors: {
        firstName: 'At least 2 characters',
        email:     'Valid email required',
        phone:     'Valid Egyptian phone required',
        street:    'Full street address required',
      },
    });
    expect(screen.getByText('At least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Valid email required')).toBeInTheDocument();
    expect(screen.getByText('Valid Egyptian phone required')).toBeInTheDocument();
    expect(screen.getByText('Full street address required')).toBeInTheDocument();
  });

  it('sets aria-invalid on fields that have errors', () => {
    renderForm({ formErrors: { firstName: 'At least 2 characters' } });
    expect(screen.getByLabelText(/first name/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('does NOT set aria-invalid when there is no error', () => {
    renderForm();
    expect(screen.getByLabelText(/first name/i)).toHaveAttribute('aria-invalid', 'false');
  });

  // ── Interaction ───────────────────────────────────────────────
  it('calls onFieldChange when typing in First Name', async () => {
    const user = userEvent.setup();
    const onFieldChange = jest.fn();
    renderForm({ onFieldChange });

    await user.type(screen.getByLabelText(/first name/i), 'M');
    expect(onFieldChange).toHaveBeenCalledWith('firstName', 'M');
  });

  it('calls onFieldChange when typing in Email', async () => {
    const user = userEvent.setup();
    const onFieldChange = jest.fn();
    renderForm({ onFieldChange });

    await user.type(screen.getByLabelText(/email/i), 'a');
    expect(onFieldChange).toHaveBeenCalledWith('email', 'a');
  });

  it('calls onFieldChange when selecting a city', async () => {
    const user = userEvent.setup();
    const onFieldChange = jest.fn();
    renderForm({ onFieldChange });

    await user.selectOptions(screen.getByRole('combobox'), 'Giza');
    expect(onFieldChange).toHaveBeenCalledWith('city', 'Giza');
  });

  it('calls onContinue when Continue button is clicked', async () => {
    const user = userEvent.setup();
    const onContinue = jest.fn();
    renderForm({ onContinue });

    await user.click(screen.getByRole('button', { name: /continue to payment/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  // ── Character counter ─────────────────────────────────────────
  it('shows character count for notes field', () => {
    renderForm({ form: { ...DEFAULT_FORM, notes: 'Hello' } });
    expect(screen.getByText('5/500')).toBeInTheDocument();
  });

  it('shows 0/500 when notes is empty', () => {
    renderForm();
    expect(screen.getByText('0/500')).toBeInTheDocument();
  });
});
