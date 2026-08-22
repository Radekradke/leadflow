import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './modules/health/health.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { MailModule } from './common/mail/mail.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenantContextInterceptor } from './common/tenant/tenant-context.interceptor';
import { TenantContextMiddleware } from './common/tenant/tenant-context.middleware';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrokerModule } from './modules/brokers/broker.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DistributionModule } from './modules/distribution/distribution.module';
import { InteractionModule } from './modules/interactions/interaction.module';
import { LeadModule } from './modules/leads/lead.module';
import { OrgModule } from './modules/org/org.module';
import { QueueModule } from './modules/queues/queue.module';
import { TaskModule } from './modules/tasks/task.module';
import { TransferModule } from './modules/transfers/transfer.module';
import { UserModule } from './modules/users/user.module';

/**
 * Raiz da aplicação. A ordem de montagem importa:
 *
 *  - ThrottlerModule: rate limit global de baseline (anti-abuso). O login
 *    tem um limite mais apertado via @Throttle no controller.
 *  - PrismaModule (@Global): clientes de banco + contexto de tenant.
 *  - AuditModule (@Global): AuditService para toda a app.
 *  - AuthModule: liga os guards globais (auth, CSRF, permissões).
 *
 *  - TenantContextMiddleware: abre o contexto da requisição (vazio).
 *  - TenantContextInterceptor: preenche o tenant após a autenticação.
 *
 * Sobre a ordem dos APP_GUARD entre módulos: o que PRECISA ser garantido
 * (JwtAuthGuard antes de PermissionsGuard) está no mesmo array do
 * AuthModule. O ThrottlerGuard pode rodar em qualquer ponto da cadeia
 * sem afetar a correção.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), // 100 req/min/IP
    EventEmitterModule.forRoot(), // barramento de eventos interno
    PrismaModule,
    MailModule,
    HealthModule,
    WhatsAppModule,
    AuditModule,
    AuthModule,
    UserModule,
    OrgModule,
    BrokerModule,
    QueueModule,
    LeadModule,
    InteractionModule,
    TaskModule,
    DistributionModule,
    TransferModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
