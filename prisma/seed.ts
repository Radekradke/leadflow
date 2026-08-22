import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/security/password';
import {
  onboardTenant,
  syncPermissions,
} from '../src/modules/platform/onboarding/onboard-tenant';

// O seed conecta com DATABASE_URL (owner / BYPASSRLS): atravessa a RLS
// DE PROPÓSITO. É um dos poucos lugares onde isso é legítimo.
// Pré-requisito: o usuário do DATABASE_URL precisa ter BYPASSRLS, senão
// o FORCE RLS bloqueia os inserts deste seed.
const db = new PrismaClient();

/**
 * Lê um segredo do ambiente. Em produção, é obrigatório. Em DEV, cai num
 * valor de teste com aviso barulhento — para nunca subir senha de DEV
 * para produção por acidente.
 */
function secret(name: string, devFallback: string): string {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Variável ${name} é obrigatória em produção.`);
  }
  console.warn(`⚠  ${name} não definida — usando valor de DEV. NUNCA use em produção.`);
  return devFallback;
}

async function main() {
  // 1) Catálogo global de permissões (idempotente)
  await syncPermissions(db);
  console.log('✔ Permissões sincronizadas');

  // 2) Planos
  const trial = await db.plan.upsert({
    where: { name: 'Trial' },
    update: {},
    create: { name: 'Trial', maxUsers: 10, maxLeadsPerMonth: 500 },
  });
  await db.plan.upsert({
    where: { name: 'Pro' },
    update: {},
    create: { name: 'Pro', maxUsers: 100, maxLeadsPerMonth: 10000 },
  });
  console.log('✔ Planos prontos');

  // 3) Administrador da PLATAFORMA (você, dono do SaaS)
  const platformEmail = secret('PLATFORM_ADMIN_EMAIL', 'owner@leadflow.local');
  const platformPass = secret('PLATFORM_ADMIN_PASSWORD', 'dev-owner-123!');
  await db.platformAdmin.upsert({
    where: { email: platformEmail },
    update: {},
    create: {
      email: platformEmail,
      name: 'Platform Owner',
      passwordHash: await hashPassword(platformPass),
    },
  });
  console.log(`✔ PlatformAdmin: ${platformEmail}`);

  // 4) Tenant de demonstração (idempotente pelo slug)
  const demoSlug = 'imobiliaria-demo';
  const existing = await db.tenant.findUnique({ where: { slug: demoSlug } });
  if (existing) {
    console.log('• Tenant demo já existe — pulando');
  } else {
    const demoAdminEmail = secret('DEMO_ADMIN_EMAIL', 'admin@demo.local');
    const demoAdminPass = secret('DEMO_ADMIN_PASSWORD', 'dev-admin-123!');
    const { tenant, adminUser } = await onboardTenant(db, {
      tenantName: 'Imobiliária Demo',
      tenantSlug: demoSlug,
      planId: trial.id,
      admin: {
        name: 'Admin Demo',
        email: demoAdminEmail,
        passwordHash: await hashPassword(demoAdminPass),
      },
    });
    console.log(`✔ Tenant "${tenant.name}" criado — admin: ${adminUser.email}`);

    // 5) Dados operacionais de DEMONSTRAÇÃO. Sem uma fila ATIVA com
    //    corretores DISPONÍVEIS, a distribuição não tem para quem
    //    distribuir e o lead fica parado — parecendo defeito. Só em dev.
    if (process.env.NODE_ENV !== 'production') {
      await seedDemoOperation(tenant.id);
    }
  }
}

/**
 * Cria uma fila de entrada e dois corretores prontos para receber leads.
 * Os critérios são os que o motor exige: fila ativa com distribuição
 * ligada, corretor AVAILABLE, aceitando distribuição e usuário ativo.
 */
async function seedDemoOperation(tenantId: string): Promise<void> {
  const brokerRole = await db.role.findFirst({
    where: { tenantId, type: 'BROKER' },
    select: { id: true },
  });
  if (!brokerRole) {
    console.warn('⚠  Role BROKER não encontrada — pulando corretores de demo.');
    return;
  }

  // ── Cadeia de distribuição: Regional → 2 gerentes → corretores ──
  // A fila "Regional" é um ROTEADOR: não tem corretores, só reparte entre
  // as filas dos gerentes conforme o percentual. Cada fila de gerente é
  // uma FOLHA, onde os corretores ficam e o rodízio acontece.
  const regional = await db.queue.create({
    data: {
      tenantId,
      name: 'Regional Nova Iguaçu',
      isActive: true,
      distributionEnabled: true,
      distributionStrategy: 'ROUND_ROBIN',
    },
  });

  const gerentes = [
    { nome: 'Gerente Márcio', peso: 60 },
    { nome: 'Gerente Wellington', peso: 40 },
  ];

  const corretoresPorGerente: Record<string, { name: string; email: string }[]> = {
    'Gerente Márcio': [
      { name: 'Marcos Vieira', email: 'marcos@demo.local' },
      { name: 'Priya Nair', email: 'priya@demo.local' },
    ],
    'Gerente Wellington': [
      { name: 'Lucas Mota', email: 'lucas@demo.local' },
      { name: 'Sofia Pires', email: 'sofia@demo.local' },
    ],
  };

  const passwordHash = await hashPassword(
    secret('DEMO_BROKER_PASSWORD', 'dev-broker-123!'),
  );

  for (const g of gerentes) {
    const filaGerente = await db.queue.create({
      data: {
        tenantId,
        name: g.nome,
        isActive: true,
        distributionEnabled: true,
        distributionStrategy: 'ROUND_ROBIN',
        parentId: regional.id,
        routingWeight: g.peso,
      },
    });

    for (const c of corretoresPorGerente[g.nome]) {
      const user = await db.user.create({
        data: {
          tenantId,
          name: c.name,
          email: c.email,
          passwordHash,
          roleId: brokerRole.id,
          isActive: true,
        },
      });
      const profile = await db.brokerProfile.create({
        data: {
          tenantId,
          userId: user.id,
          availability: 'AVAILABLE',
          acceptsDistribution: true,
          maxActiveLeads: 50,
        },
      });
      await db.queueMembership.create({
        data: { tenantId, queueId: filaGerente.id, brokerProfileId: profile.id },
      });
    }
  }

  console.log(
    '✔ Cadeia de distribuição: Regional Nova Iguaçu → Gerente Márcio (60%) ' +
      'e Gerente Wellington (40%) → 4 corretores disponíveis (demo)',
  );
}

main()
  .then(() => console.log('Seed concluído.'))
  .catch((e) => {
    console.error('Seed falhou:', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
