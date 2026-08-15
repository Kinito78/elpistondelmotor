-- CreateTable
CREATE TABLE "LoyaltyVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confirmToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "redemptionId" TEXT,
    CONSTRAINT "LoyaltyVisit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LoyaltyVisit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LoyaltyVisit_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LoyaltyVisit_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "LoyaltyRedemption" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoyaltyRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cutsUsed" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyRedemption_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LoyaltyRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "address" TEXT,
    "phone" TEXT,
    "ghlLocationId" TEXT,
    "ghlCalendarId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loyaltyCutsRequired" INTEGER NOT NULL DEFAULT 5,
    "loyaltyRewardCents" INTEGER NOT NULL DEFAULT 20000,
    "loyaltyWindowDays" INTEGER NOT NULL DEFAULT 5
);
INSERT INTO "new_Branch" ("address", "createdAt", "ghlCalendarId", "ghlLocationId", "id", "name", "phone", "timezone") SELECT "address", "createdAt", "ghlCalendarId", "ghlLocationId", "id", "name", "phone", "timezone" FROM "Branch";
DROP TABLE "Branch";
ALTER TABLE "new_Branch" RENAME TO "Branch";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyVisit_appointmentId_key" ON "LoyaltyVisit"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyVisit_confirmToken_key" ON "LoyaltyVisit"("confirmToken");

-- CreateIndex
CREATE INDEX "LoyaltyVisit_customerId_branchId_status_idx" ON "LoyaltyVisit"("customerId", "branchId", "status");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_customerId_branchId_idx" ON "LoyaltyRedemption"("customerId", "branchId");
