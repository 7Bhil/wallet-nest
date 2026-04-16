import { Injectable } from '@nestjs/common';

@Injectable()
export class CurrencyService {
  private readonly rates: { [key: string]: number } = {
    USD: 1,
    EUR: 0.92,
    XOF: 610,
    GBP: 0.79,
  };

  convert(amount: number, from: string, to: string): number {
    const rateFrom = this.rates[from.toUpperCase()] || 1;
    const rateTo = this.rates[to.toUpperCase()] || 1;
    
    // Convert to USD first then to target
    const amountInUsd = amount / rateFrom;
    return amountInUsd * rateTo;
  }

  getRate(currency: string): number {
    return this.rates[currency.toUpperCase()] || 1;
  }
}
