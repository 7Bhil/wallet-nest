import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class CurrencyService implements OnModuleInit {
  // 1 B$ = 1 USD (monnaie interne de la plateforme)
  private toBsdRates: { [key: string]: number } = {
    USD: 1,
    EUR: 1.08, // Fallbacks
    XOF: 0.0016,
    GBP: 1.27,
  };

  private fromBsdRates: { [key: string]: number } = {
    USD: 1,
    EUR: 0.92,
    XOF: 610,
    GBP: 0.79,
  };

  async onModuleInit() {
    await this.fetchRealRates();
  }

  private async fetchRealRates() {
    try {
      console.log('📡 Récupération des taux de change en temps réel...');
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await response.json();

      if (data && data.rates) {
        // En tant que B$ (base USD), le taux de conversion vers B$ d'une devise X est 1/rateX
        // Ex: si 1 USD = 0.92 EUR, alors 1 EUR = 1/0.92 USD = 1.08 USD (B$)
        this.fromBsdRates = data.rates;
        
        Object.keys(data.rates).forEach(currency => {
          this.toBsdRates[currency] = 1 / data.rates[currency];
        });
        
        console.log('✅ Taux de change mis à jour avec succès.');
        console.log(`1 EUR = ${this.toBsdRates['EUR'].toFixed(4)} B$`);
        console.log(`1 B$ = ${this.fromBsdRates['XOF'].toFixed(0)} XOF`);
      }
    } catch (e) {
      console.warn('⚠️ Échec de la récupération des taux réels, utilisation des taux par défaut.', e);
    }
  }

  /** Obtenir tous les taux actuels */
  getAllRates() {
    return {
      toBSD: this.toBsdRates,
      fromBSD: this.fromBsdRates,
      lastUpdate: new Date()
    };
  }

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

  convert(amount: number, from: string, _to: string): number {
    return this.convertToBSD(amount, from);
  }

  getRate(currency: string): number {
    return this.toBsdRates[currency.toUpperCase()] || 1;
  }
}
