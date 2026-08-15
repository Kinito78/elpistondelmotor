/*
  Warnings:

  - Added the required column `branchId` to the `AdminSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `adminPasswordHash` to the `Branch` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminSession" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "AdminSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Las sesiones existentes no tienen sucursal asignada; se descartan (solo
-- obliga a un nuevo login, no hay pérdida de datos de negocio).
DROP TABLE "AdminSession";
ALTER TABLE "new_AdminSession" RENAME TO "AdminSession";
CREATE INDEX "AdminSession_branchId_idx" ON "AdminSession"("branchId");
CREATE TABLE "new_Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "address" TEXT,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slug" TEXT,
    "domain" TEXT,
    "adminUser" TEXT NOT NULL DEFAULT 'admin',
    "adminPasswordHash" TEXT NOT NULL,
    "ghlApiKey" TEXT,
    "ghlLocationId" TEXT,
    "ghlCalendarId" TEXT,
    "ghlWebhookSecret" TEXT,
    "loyaltyCutsRequired" INTEGER NOT NULL DEFAULT 5,
    "loyaltyRewardCents" INTEGER NOT NULL DEFAULT 20000,
    "loyaltyWindowDays" INTEGER NOT NULL DEFAULT 5
);
-- Backfill de la sucursal existente: login y credenciales de GHL que hoy
-- viven en variables de entorno pasan a ser propias de esta fila. La
-- contraseña actual ("barberia123") queda hasheada, no en texto plano.
INSERT INTO "new_Branch" (
  "address", "createdAt", "ghlCalendarId", "ghlLocationId", "id",
  "loyaltyCutsRequired", "loyaltyRewardCents", "loyaltyWindowDays", "name", "phone", "timezone",
  "slug", "adminUser", "adminPasswordHash", "ghlApiKey", "ghlWebhookSecret"
)
SELECT
  "address", "createdAt", "ghlCalendarId", "ghlLocationId", "id",
  "loyaltyCutsRequired", "loyaltyRewardCents", "loyaltyWindowDays", "name", "phone", "timezone",
  'la-navaja', 'admin',
  'bd98b62150ed90a238c6e6238540f17d:1832218f7a41fdae86ad92efbd5e226b46682cd96e8546bf125f704628ea0336f47a60591aec1f75f00f8189a0eb711a6c99efaf6586cbf7e45d92c278545969',
  'pit-33b783dd-6843-431c-8cd9-71f33940c4d5',
  'dev-webhook-secret'
FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
CREATE UNIQUE INDEX "Branch_slug_key" ON "Branch"("slug");
CREATE UNIQUE INDEX "Branch_domain_key" ON "Branch"("domain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
