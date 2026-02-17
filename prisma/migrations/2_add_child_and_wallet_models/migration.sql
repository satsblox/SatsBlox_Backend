-- CreateTable parents (already exists from previous migration)
-- CreateTable children
CREATE TABLE "children" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "parentId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateTable wallets
CREATE TABLE "wallets" (
    "id" SERIAL NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "childId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex on children.username (unique)
CREATE UNIQUE INDEX "children_username_key" ON "children"("username");

-- CreateIndex on children.parentId (for efficient lookups)
CREATE INDEX "children_parentId_idx" ON "children"("parentId");

-- CreateIndex on wallets.childId (unique, enforces one-to-one relationship)
CREATE UNIQUE INDEX "wallets_childId_key" ON "wallets"("childId");

-- AddForeignKey: children.parentId -> parents.id (ON DELETE CASCADE)
ALTER TABLE "children" ADD CONSTRAINT "children_parentId_fkey" 
  FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: wallets.childId -> children.id (ON DELETE CASCADE)
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_childId_fkey" 
  FOREIGN KEY ("childId") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add CHECK constraint: wallets.balance >= 0 (optional, but recommended)
-- Note: Some PostgreSQL versions may require enabling "postgres" extension
ALTER TABLE "wallets" 
  ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0);
