
import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";

function hashAuditRecord(
  payload: Record<string, unknown>,
  previousHash: string | null,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ payload, previousHash }))
    .digest("hex");
}

export async function verifyAuditChain() {
  const records = await prisma.auditLog.findMany({
    where: {
      integrityHash: { not: null },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const unchainedCount = await prisma.auditLog.count({
    where: {
      integrityHash: null,
    },
  });

  const problems: Array<{
    recordId: string;
    issue: string;
  }> = [];

  let expectedPreviousHash: string | null = null;

  if (records.length === 0) {
    problems.push({
      recordId: "CHAIN",
      issue: "No chained audit records are available to verify",
    });
  }

  for (const record of records) {
    if (record.previousHash !== expectedPreviousHash) {
      problems.push({
        recordId: record.id,
        issue:
          expectedPreviousHash === null
            ? "The first record does not start a valid chain"
            : "Previous hash does not match the preceding record",
      });
    }

    const payload: Record<string, unknown> = {
      actorId: record.actorId ?? null,
      documentId: record.documentId ?? null,
      action: record.action,
      success: record.success,
      ipAddress: record.ipAddress ?? null,
      userAgent: record.userAgent ?? null,
      details: record.details ?? {},
      createdAt: record.createdAt.toISOString(),
    };

    const calculatedHash = hashAuditRecord(
      payload,
      record.previousHash,
    );

    if (calculatedHash !== record.integrityHash) {
      problems.push({
        recordId: record.id,
        issue: "Record integrity hash does not match its contents",
      });
    }

    expectedPreviousHash = record.integrityHash;
  }

  if (unchainedCount > 0) {
    problems.push({
      recordId: "UNCHAINED_RECORDS",
      issue: `${unchainedCount} audit record(s) have no integrity hash`,
    });
  }

  const chainValid =
    records.length > 0 &&
    problems.every(
      (problem) => problem.recordId !== "UNCHAINED_RECORDS",
    ) &&
    problems.every(
      (problem) =>
        problem.recordId !== "CHAIN" &&
        !problem.issue.includes("Previous hash") &&
        !problem.issue.includes("first record") &&
        !problem.issue.includes("integrity hash"),
    );

  return {
    valid: chainValid && unchainedCount === 0,
    chainValid,
    checkedRecords: records.length,
    unchainedRecords: unchainedCount,
    problems,
    verifiedAt: new Date().toISOString(),
  };
}
