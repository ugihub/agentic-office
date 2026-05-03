/**
 * Money — Decimal-safe monetary value handling using decimal.js
 *
 * Convention: all monetary amounts stored as Decimal128 in MongoDB.
 * In application layer: use Money type for calculations.
 * NEVER use native JS number for monetary math — floating point errors.
 */
import Decimal from 'decimal.js'

// Configure Decimal.js for financial precision
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -20,
  toExpPos: 20,
})

export type { Decimal }

export class Money {
  private readonly _amount: Decimal
  private readonly _currency: Currency

  private constructor(amount: Decimal, currency: Currency) {
    this._amount = amount
    this._currency = currency
  }

  /** Create a Money from a number, string, or Decimal */
  static of(amount: number | string | Decimal, currency: Currency = 'USD'): Money {
    return new Money(new Decimal(amount), currency)
  }

  /** Create USD Money */
  static usd(amount: number | string | Decimal): Money {
    return Money.of(amount, 'USD')
  }

  /** Zero USD */
  static zero(currency: Currency = 'USD'): Money {
    return new Money(new Decimal(0), currency)
  }

  get amount(): Decimal {
    return this._amount
  }

  get currency(): Currency {
    return this._currency
  }

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this._amount.plus(other._amount), this._currency)
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    return new Money(this._amount.minus(other._amount), this._currency)
  }

  multiply(factor: number | string | Decimal): Money {
    return new Money(this._amount.times(new Decimal(factor)), this._currency)
  }

  /** Is this amount >= other? */
  gte(other: Money): boolean {
    this.assertSameCurrency(other)
    return this._amount.gte(other._amount)
  }

  /** Is this amount > other? */
  gt(other: Money): boolean {
    this.assertSameCurrency(other)
    return this._amount.gt(other._amount)
  }

  /** Is this amount === 0? */
  isZero(): boolean {
    return this._amount.isZero()
  }

  /** Is this amount < 0? */
  isNegative(): boolean {
    return this._amount.isNegative()
  }

  /** Convert to string with fixed decimal places */
  toString(decimalPlaces = 6): string {
    return this._amount.toFixed(decimalPlaces)
  }

  /** Serialize for MongoDB Decimal128 */
  toDecimalString(): string {
    return this._amount.toString()
  }

  equals(other: Money): boolean {
    return this._currency === other._currency && this._amount.equals(other._amount)
  }

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new Error(
        `Currency mismatch: cannot operate on ${this._currency} and ${other._currency}`,
      )
    }
  }
}

export type Currency = 'USD' | 'IDR' | 'EUR' | 'SGD'

/** Parse a MongoDB Decimal128 string back to Money */
export function parseMoney(value: string | undefined | null, currency: Currency = 'USD'): Money {
  if (value === undefined || value === null || value === '') {
    return Money.zero(currency)
  }
  return Money.of(value, currency)
}
