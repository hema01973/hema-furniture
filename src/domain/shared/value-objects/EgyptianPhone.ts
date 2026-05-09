// src/domain/shared/value-objects/EgyptianPhone.ts — HemaV050
// Value object for Egyptian mobile phone number validation and normalization.
// Supports Vodafone (010), Orange (012), Etisalat/e& (011), WE (015).

export class EgyptianPhone {
  /** Matches +20XXXXXXXXXX, 0XXXXXXXXXX, or bare 1XXXXXXXXX (10 digits after prefix) */
  private static readonly PATTERN = /^(\+20|0)(10|11|12|15)\d{8}$/;

  private constructor(private readonly normalized: string) {}

  /**
   * Validate a phone string (with or without country code, spaces allowed).
   * Returns true if the number is a valid Egyptian mobile number.
   */
  static validate(phone: string): boolean {
    return this.PATTERN.test(phone.replace(/\s/g, ''));
  }

  /**
   * Normalize a phone number to the +20XXXXXXXXXX format.
   * Throws if the number is invalid.
   */
  static normalize(phone: string): string {
    const cleaned = phone.replace(/\s/g, '');
    if (!this.PATTERN.test(cleaned)) {
      throw new Error(`Invalid Egyptian phone number: ${phone}`);
    }
    if (cleaned.startsWith('+20')) return cleaned;
    if (cleaned.startsWith('0'))   return `+20${cleaned.slice(1)}`;
    return `+20${cleaned}`;
  }

  /**
   * Parse a phone string into an EgyptianPhone value object.
   * Throws if the number is invalid.
   */
  static from(phone: string): EgyptianPhone {
    return new EgyptianPhone(EgyptianPhone.normalize(phone));
  }

  /** Return the normalized +20XXXXXXXXXX form. */
  toString(): string {
    return this.normalized;
  }

  /** Return the local 0XXXXXXXXXX form (without country code). */
  toLocalFormat(): string {
    return `0${this.normalized.slice(3)}`;
  }

  equals(other: EgyptianPhone): boolean {
    return this.normalized === other.normalized;
  }
}
