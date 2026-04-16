import { Module, Global } from '@nestjs/common';
import { CurrencyService } from './currency.service';

@Global()
@Module({
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
