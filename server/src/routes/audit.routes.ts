
import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { verifyAuditChain } from "../utils/verifyAudit.js";

const router = Router();

// GET /api/audit/verify
// Check the integrity of the audit hash chain.
router.get("/verify", requireAuth, async (_req, res) => {
  try {
    const result = await verifyAuditChain();

    return res.status(200).json({
      message: result.valid
        ? "Audit chain verification completed."
        : "Audit chain verification detected problems.",
      ...result,
    });
  } catch (error) {
    console.error("Audit verification failed:", error);

    return res.status(500).json({
      message: "Unable to verify the audit chain.",
    });
  }
});

// GET /api/audit/documents/:documentId
// Only the document owner can view its activity.
router.get(
  "/documents/:documentId",
  requireAuth,
  async (req, res): Promise<void> => {
    const ownerId = req.authUser!.id;
    const documentId = req.params.documentId;

    if (typeof documentId !== "string" || !documentId.trim()) {
      res.status(400).json({
        success: false,
        message: "A valid document ID is required.",
      });
      return;
    }

    try {
      // Verify ownership before returning any activity.
      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          ownerId,
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          originalName: true,
        },
      });

      if (!document) {
        // Do not reveal whether another user's document exists.
        res.status(404).json({
          success: false,
          message: "Document not found or access denied.",
        });
        return;
      }

      // Retrieve document activity and permission events.
      const records = await prisma.auditLog.findMany({
        where: {
          documentId: document.id,
          action: {
            in: [
              "DOCUMENT_VIEW",
              "DOCUMENT_VIEWED",
              "DOCUMENT_DOWNLOAD",
              "DOCUMENT_DOWNLOADED",
              "PERMISSION_GRANTED",
              "PERMISSION_REVOKED",
              "PERMISSION_GRANT_DENIED",
              "PERMISSION_REVOKE_DENIED",
              "PERMISSION_LIST_DENIED",
            ],
          },
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select: {
          id: true,
          actorId: true,
          action: true,
          success: true,
          createdAt: true,
          details: true,
        },
      });

      res.status(200).json({
        success: true,
        document,
        activity: records.map((record) => ({
          id: record.id,
          userId: record.actorId,
          action: record.action,
          success: record.success,
          timestamp: record.createdAt.toISOString(),
          details: record.details,
        })),
      });
    } catch (error) {
      console.error("Document activity retrieval failed:", error);

      res.status(500).json({
        success: false,
        message: "Unable to retrieve document activity.",
      });
    }
  },
);

export default router;
