import { Module } from '@nestjs/common';
import { DistributionModule } from '../distribution/distribution.module';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

@Module({
  imports: [DistributionModule], // reusa DistributionService na redistribuição
  controllers: [TransferController],
  providers: [TransferService],
})
export class TransferModule {}
