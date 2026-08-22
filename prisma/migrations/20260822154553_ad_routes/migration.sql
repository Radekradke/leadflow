-- CreateTable
CREATE TABLE "AdRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adSourceId" TEXT NOT NULL,
    "label" TEXT,
    "queueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdRoute_tenantId_idx" ON "AdRoute"("tenantId");

-- CreateIndex
CREATE INDEX "AdRoute_queueId_idx" ON "AdRoute"("queueId");

-- CreateIndex
CREATE UNIQUE INDEX "AdRoute_tenantId_adSourceId_key" ON "AdRoute"("tenantId", "adSourceId");

-- AddForeignKey
ALTER TABLE "AdRoute" ADD CONSTRAINT "AdRoute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdRoute" ADD CONSTRAINT "AdRoute_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
