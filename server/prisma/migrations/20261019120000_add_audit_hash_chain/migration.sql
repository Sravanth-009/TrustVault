ALTER TABLE "AuditLog"
ADD COLUMN "previousHash" TEXT,
ADD COLUMN "integrityHash" TEXT;

CREATE UNIQUE INDEX "AuditLog_integrityHash_key"
ON "AuditLog"("integrityHash");