import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class CurrencyService implements OnModuleInit {
  private toBsdRates: { [key: string]: number } = {
    USD: 1, EUR: 1.08, XOF: 0.0016, GBP: 1.27,
  };

  private fromBsdRates: { [key: string]: number } = {
    USD: 1, EUR: 0.92, XOF: 610, GBP: 0.79,
  };

  private lastUpdate: number = 0;
  private readonly REFRESH_INTERVAL = 60 * 1000; // 60 secondes de "fraîcheur"

  async onModuleInit() {
    await this.ensureFreshRates();
  }

  /** Garantit que les taux sont à jour (moins de 60s) */
  async ensureFreshRates() {
    const now = Date.now();
    if (now - this.lastUpdate > this.REFRESH_INTERVAL) {
      await this.fetchRealRates();
      this.lastUpdate = now;
    }
  }

  private async fetchRealRates() {
    try {
      console.log('🔄 Actualisation des taux de change (Sur demande)...');
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await response.json();

      if (data && data.rates) {
        this.fromBsdRates = data.rates;
        Object.keys(data.rates).forEach(currency => {
          this.toBsdRates[currency] = 1 / data.rates[currency];
        });
        console.log('✅ Taux synchronisés avec le marché.');
      }
    } catch (e) {
      console.warn('⚠️ Erreur API Taux, utilisation du cache.', e);
    }
  }

  getAllRates() {
    return {
      toBSD: this.toBsdRates,
      fromBSD: this.fromBsdRates,
      lastUpdate: new Date(this.lastUpdate)
    };
  }

  async convertToBSD(amount: number, fromCurrency: string): Promise<number> {
    await this.ensureFreshRates();
    const rate = this.toBsdRates[fromCurrency.toUpperCase()] || 1;
    return amount * rate;
  }

  async convertFromBSD(bsdAmount: number, toCurrency: string): Promise<number> {
    await this.ensureFreshRates();
    const rate = this.fromBsdRates[toCurrency.toUpperCase()] || 1;
    return bsdAmount * rate;
  }

  async getLatestRate(currency: string): Promise<number> {
    await this.ensureFreshRates();
    return this.toBsdRates[currency.toUpperCase()] || 1;
  }
}
