import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './common/config/env.validation';

async function bootstrap() {
  // Falha cedo se faltar configuração essencial.
  validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // necessário p/ validar a assinatura do webhook do WhatsApp
  });

  // Confia no proxy do provedor (Railway/Render/etc.) para que req.ip seja
  // o IP REAL do cliente — sem isto, o rate limit por IP fica inútil
  // (todo mundo "vem" do IP do proxy). Ajuste o número de saltos se preciso.
  app.set('trust proxy', 1);

  // Popula req.cookies — a estratégia JWT e a CSRF dependem disto.
  app.use(cookieParser());

  // Headers de segurança (CSP, HSTS, etc.).
  app.use(helmet());

  // CORS com credenciais: obrigatório para cookies. origin NUNCA pode ser
  // '*' quando credentials é true. Use o domínio exato do frontend.
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
