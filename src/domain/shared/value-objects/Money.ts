// src/domain/shared/value-objects/Money.ts — HemaV050
// Immutable Money value object — stores amount in integer piastres to prevent IEEE-754 drift.

export class Money {
  private constructor(private readonly cents: number) {
    if (!Number.isFinite(cents)) throw new Error('Money: amount must be a finite number');
    if (cents < 0) throw new Error('Money: amount cannot be negative');
  }

  static fromEGP(amount: number): Money {
    return new Money(Math.round(amount * 100));
  }

  static fromCents(cents: number): Money {
    return new Money(Math.round(cents));
  }

  static zero(): Money {
    return new Money(0);
  }

  toEGP(): number {
    return this.cents / 100;
  }

  toCents(): number {
    return this.cents;
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(Math.max(0, this.cents - other.cents));
  }

  multiply(factor: number): Money {
    if (factor < 0) throw new Error('Money: multiplication factor cannot be negative');
    return new Money(Math.round(this.cents * factor));
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  greaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  lessThan(other: Money): boolean {
    return this.cents < other.cents;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  toString(): string {
    return `${this.toEGP().toFixed(2)} EGP`;
  }
}
