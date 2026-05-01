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
        this.rawRates = data.rates;
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
      fiatRates: this.rawRates,
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

  /**
   * Convertit un montant d'une devise locale à une autre avec un spread de 2%
   */
  async convertFiat(amount: number, from: string, to: string): Promise<number> {
    await this.ensureFreshRates();
    if (from === to) return amount;
    
    // On convertit via USD comme pivot
    // 1. De 'from' -> USD (réel)
    // 2. De USD -> 'to' (réel)
    // 3. Appliquer le SPREAD une seule fois sur le total
    
    const rateFrom = this.rawRates[from.toUpperCase()] || 1;
    const rateTo = this.rawRates[to.toUpperCase()] || 1;
    
    const amountInUsd = amount / rateFrom;
    const finalAmount = amountInUsd * rateTo * (1 - this.SPREAD_COMMISSION);
    
    return finalAmount;
  }

  async getFiatRate(from: string, to: string): Promise<number> {
    await this.ensureFreshRates();
    if (from === to) return 1;
    const rateFrom = this.rawRates[from.toUpperCase()] || 1;
    const rateTo = this.rawRates[to.toUpperCase()] || 1;
    return (rateTo / rateFrom) * (1 - this.SPREAD_COMMISSION);
  }

  async getLatestRate(currency: string): Promise<number> {
    await this.ensureFreshRates();
    return this.toBsdRates[currency.toUpperCase()] || (1 - this.SPREAD_COMMISSION);
  }

  /**
   * Convertit un montant exact d'une devise à une autre (utilisé pour les MAJ de profil)
   * Aucune commission de change n'est prelevée.
   */
  async convertExact(amount: number, from: string, to: string): Promise<number> {
    await this.ensureFreshRates();
    if (from === to) return amount;
    
    const rateFrom = this.rawRates[from.toUpperCase()] || 1;
    const rateTo = this.rawRates[to.toUpperCase()] || 1;
    
    const amountInUsd = amount / rateFrom;
    return amountInUsd * rateTo;
  }

  /**
   * Arrondit un montant à un "chiffre beau/propre" selon la devise
   * Utile pour les plafonds de cartes, objectifs, etc.
   */
  roundToPretty(amount: number, currency: string): number {
    const curr = currency.toUpperCase();
    
    if (curr === 'XOF') {
      if (amount <= 0) return 0;
      if (amount < 25000) return Math.max(5000, Math.round(amount / 5000) * 5000); 
      if (amount < 150000) return Math.round(amount / 25000) * 25000;
      if (amount < 1000000) return Math.round(amount / 100000) * 100000; 
      if (amount < 10000000) return Math.round(amount / 1000000) * 1000000; 
      return Math.round(amount / 5000000) * 5000000; 
    }

    if (['USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD'].includes(curr)) {
      if (amount < 1000) return Math.round(amount / 100) * 100;
      if (amount < 10000) return Math.round(amount / 500) * 500;
      return Math.round(amount / 1000) * 1000;
    }

    // Default: Round to 2 significant digits
    const magnitude = Math.pow(10, Math.floor(Math.log10(amount)) - 1);
    return Math.round(amount / magnitude) * magnitude;
  }

  private rawRates: { [key: string]: number } = { USD: 1 };
}
