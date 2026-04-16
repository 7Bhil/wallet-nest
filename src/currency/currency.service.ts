import { Injectable } from '@nestjs/common';

@Injectable()
export class CurrencyService {
  // 1 B$ = 1 USD (monnaie interne de la plateforme)
  private readonly toBsdRates: { [key: string]: number } = {
    USD: 1,
    EUR: 1 / 0.92,
    XOF: 1 / 610,
    GBP: 1 / 0.79,
  };

  private readonly fromBsdRates: { [key: string]: number } = {
    USD: 1,
    EUR: 0.92,
    XOF: 610,
    GBP: 0.79,
  };

  /** Convertir une devise locale en B$ (pour les dépôts) */
  convertToBSD(amount: number, fromCurrency: string): number {
    const rate = this.toBsdRates[fromCurrency.toUpperCase()] || 1;
    return amount * rate;
  }

  /** Convertir B$ en devise locale (pour les retraits) */
  convertFromBSD(bsdAmount: number, toCurrency: string): number {
    const rate = this.fromBsdRates[toCurrency.toUpperCase()] || 1;
    return bsdAmount * rate;
  }

  /** Générique pour compatibilité avec le code existant */
  convert(amount: number, from: string, _to: string): number {
    return this.convertToBSD(amount, from);
  }

  getRate(currency: string): number {
    return this.toBsdRates[currency.toUpperCase()] || 1;
  }
}
