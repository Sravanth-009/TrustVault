
import type { Request, Response, NextFunction } from "express";
import {
  checkDocumentAccess,
  type DocumentAccess,
} from "../services/document.service.js";
import { prisma } from "../utils/prisma.js";
import { recordAudit } from "../utils/audit.js";

export function requireDocumentAccess(requiredAccess: DocumentAccess) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userId = req.authUser?.id;
    const documentId = req.params.documentId ?? req.params.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (typeof documentId !== "string" || documentId.length === 0) {
      res.status(400).json({
        success: false,
        message: "A document ID is required",
      });
      return;
    }

    try {
      const allowed = await checkDocumentAccess(
        documentId,
        userId,
        requiredAccess,
      );

      if (!allowed) {
        const document = await prisma.document.findFirst({
          where: { id: documentId, deletedAt: null },
          select: { id: true },
        });

        await recordAudit({
          actorId: userId,
          documentId: document?.id ?? null,
          action:
            requiredAccess === "EDIT"
              ? "DOCUMENT_DOWNLOAD"
              : "DOCUMENT_READ",
          success: false,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          details: {
            reason: "Access denied",
            requiredAccess,
          },
        });

        res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action.",
        });
        return;
      }

      next();
    } catch (error) {
      console.error("Document access check failed:", error);

      res.status(500).json({
        success: false,
        message: "Unable to verify document access",
      });
    }
  };
}
