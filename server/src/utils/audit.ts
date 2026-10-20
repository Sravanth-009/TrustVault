
import { createHash } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "./prisma.js";

type AuditInput = {
  actorId?: string | null;
  documentId?: string | null;
  action: string;
  success: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
};

function hashAuditRecord(
  payload: Record<string, unknown>,
  previousHash: string | null,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ payload, previousHash }))
    .digest("hex");
}

export async function recordAudit(input: AuditInput) {
  return prisma.$transaction(async (tx) => {
    // Serialize hash-chain writes to prevent concurrent writers
    // from choosing the same previous record.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(742819305)`;

    const previous = await tx.auditLog.findFirst({
      where: { integrityHash: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { integrityHash: true },
    });

    const previousHash = previous?.integrityHash ?? null;
    const createdAt = new Date();
    const details = input.details ?? {};

    const payload: Record<string, unknown> = {
      actorId: input.actorId ?? null,
      documentId: input.documentId ?? null,
      action: input.action,
      success: input.success,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      details,
      createdAt: createdAt.toISOString(),
    };

    const integrityHash = hashAuditRecord(payload, previousHash);

    return tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        documentId: input.documentId ?? null,
        action: input.action,
        success: input.success,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        details: details as Prisma.InputJsonObject,
        createdAt,
        previousHash,
        integrityHash,
      },
    });
  });
}
