
import { PermissionLevel } from "../../generated/prisma/client.js";
import { prisma } from "../utils/prisma.js";

export type DocumentAccess = "READ" | "EDIT";

export async function checkDocumentAccess(
  documentId: string,
  userId: string,
  requiredAccess: DocumentAccess
): Promise<boolean> {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
    },
    select: {
      id: true,
      ownerId: true,
    },
  });

  if (!document) {
    return false;
  }

  // The document owner has full access.
  if (document.ownerId === userId) {
    return true;
  }

  const permission = await prisma.permission.findFirst({
    where: {
      documentId,
      userId,
      revokedAt: null,
      level:
        requiredAccess === "EDIT"
          ? PermissionLevel.EDIT
          : { in: [PermissionLevel.READ, PermissionLevel.EDIT] },
    },
    select: {
      id: true,
    },
  });

  return permission !== null;
}
