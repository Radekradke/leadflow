import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * @Global: como Prisma e Audit, fica disponível em toda a app sem
 * precisar reimportar. Troque MailService por uma implementação real
 * de produção sem mexer em quem o consome.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
