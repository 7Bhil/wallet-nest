import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class CurrencyService implements OnModuleInit {
  private toBsdRates: { [key: string]: number } = {
    USD: 1, EUR: 1.05, XOF: 0.0016, GBP: 1.25,
  };

  private fromBsdRates: { [key: string]: number } = {
    USD: 1, EUR: 0.90, XOF: 600, GBP: 0.77,
  };

  private lastUpdate: number = 0;
  private readonly REFRESH_INTERVAL = 60 * 1000;
  
  // COMMISSION de change (Spread) : 2%
  // On donne 2% de moins lors des conversions pour générer du revenu financier
  private readonly SPREAD_COMMISSION = 0.02; 

  async onModuleInit() {
    await this.ensureFreshRates();
  }

  async ensureFreshRates() {
    const now = Date.now();
    if (now - this.lastUpdate > this.REFRESH_INTERVAL) {
      await this.fetchRealRates();
      this.lastUpdate = now;
    }
  }

  private async fetchRealRates() {
    try {
      console.log('🔄 Actualisation des taux de change (Strategy: Spread 2%)...');
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await response.json();

      if (data && data.rates) {
        // Pour les retraits (B$ -> Local) : on donne moins de devise locale
        // Si 1 B$ = 0.92 EUR réel, on donne 0.92 * (1 - 0.02) = 0.90 EUR
        this.fromBsdRates = {};
        Object.keys(data.rates).forEach(curr => {
          this.fromBsdRates[curr] = data.rates[curr] * (1 - this.SPREAD_COMMISSION);
        });

        // Pour les dépôts (Local -> B$) : on donne moins de B$
        // Si 1 EUR = 1.08 B$ réel, on donne 1.08 * (1 - 0.02) = 1.05 B$
        this.toBsdRates = {};
        Object.keys(data.rates).forEach(curr => {
          const realToBsd = 1 / data.rates[curr];
          this.toBsdRates[curr] = realToBsd * (1 - this.SPREAD_COMMISSION);
        });

        console.log('✅ Taux synchronisés avec commission de 2% appliquée.');
      }
    } catch (e) {
      console.warn('⚠️ Erreur API Taux, utilisation du cache.', e);
    }
  }

  getAllRates() {
    return {
      toBSD: this.toBsdRates,
      fromBSD: this.fromBsdRates,
      commission: this.SPREAD_COMMISSION,
      lastUpdate: new Date(this.lastUpdate)
    };
  }

  async convertToBSD(amount: number, fromCurrency: string): Promise<number> {
    await this.ensureFreshRates();
    const rate = this.toBsdRates[fromCurrency.toUpperCase()] || (1 - this.SPREAD_COMMISSION);
    return amount * rate;
  }

  async convertFromBSD(bsdAmount: number, toCurrency: string): Promise<number> {
    await this.ensureFreshRates();
    const rate = this.fromBsdRates[toCurrency.toUpperCase()] || (1 - this.SPREAD_COMMISSION);
    return bsdAmount * rate;
  }

  async getLatestRate(currency: string): Promise<number> {
    await this.ensureFreshRates();
    return this.toBsdRates[currency.toUpperCase()] || (1 - this.SPREAD_COMMISSION);
  }
}
