import { Router, type Request } from "express";
import multer from "multer";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../utils/prisma.js";
import { recordAudit } from "../utils/audit.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireDocumentAccess } from "../middleware/document.middleware.js";
import { supabase, DOCUMENTS_BUCKET } from "../utils/supabase.js";

const router = Router();

const allowedTypes: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".txt": ["text/plain"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

const previewableTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
]);

// Keep uploads in memory only long enough to send them to Supabase Storage.
// Render's local filesystem is ephemeral and must not be used for persistent files.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const validMimeTypes = allowedTypes[extension];

    if (!validMimeTypes || !validMimeTypes.includes(file.mimetype)) {
      callback(
        new Error("Unsupported file type. Use PDF, PNG, JPG, TXT, or DOCX."),
      );
      return;
    }

    callback(null, true);
  },
});

function auditRequest(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  };
}

function getSingleParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (
    Array.isArray(value) &&
    typeof value[0] === "string" &&
    value[0].length > 0
  ) {
    return value[0];
  }

  return null;
}

function safeDownloadName(name: string): string {
  return path.basename(name).replace(/["\r\n]/g, "_");
}

router.use(requireAuth);

// POST /api/documents — Upload to private Supabase Storage.
router.post(
  "/",
  (req, res, next) => {
    upload.single("file")(req, res, (error: unknown) => {
      if (error) {
        res.status(400).json({
          success: false,
          message:
            error instanceof Error ? error.message : "File upload failed",
        });
        return;
      }
      next();
    });
  },
  async (req, res): Promise<void> => {
    const userId = req.authUser!.id;
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        message: 'Select a file using the form field name "file".',
      });
      return;
    }

    const extension = path.extname(file.originalname).toLowerCase();
    const storageKey = `${randomUUID()}${extension}`;
    let storedInSupabase = false;

    try {
      const title =
        typeof req.body.title === "string" && req.body.title.trim()
          ? req.body.title.trim().slice(0, 200)
          : path.basename(file.originalname, extension).slice(0, 200);

      const category =
        typeof req.body.category === "string" && req.body.category.trim()
          ? req.body.category.trim().slice(0, 100)
          : null;

      const { error: storageError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .upload(storageKey, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (storageError) {
        throw new Error(`Supabase upload failed: ${storageError.message}`);
      }
      storedInSupabase = true;

      const document = await prisma.document.create({
        data: {
          title,
          originalName: path.basename(file.originalname),
          storageKey,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          category,
          ownerId: userId,
        },
        select: {
          id: true,
          title: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          category: true,
          createdAt: true,
          ownerId: true,
        },
      });

      try {
        await recordAudit({
          actorId: userId,
          documentId: document.id,
          action: "DOCUMENT_UPLOAD",
          success: true,
          ...auditRequest(req),
          details: {
            fileName: document.originalName,
            sizeBytes: file.size,
          },
        });
      } catch (auditError) {
        await prisma.document
          .delete({ where: { id: document.id } })
          .catch(() => undefined);
        throw auditError;
      }

      res.status(201).json({
        success: true,
        message: "Document uploaded successfully",
        document: {
          ...document,
          sizeBytes: document.sizeBytes.toString(),
        },
      });
    } catch (error) {
      if (storedInSupabase) {
        const { error: cleanupError } = await supabase.storage
          .from(DOCUMENTS_BUCKET)
          .remove([storageKey]);

        if (cleanupError) {
          console.error("Supabase upload cleanup failed:", cleanupError.message);
        }
      }

      console.error("Document upload failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Unable to save the document",
        });
      }
    }
  },
);

// GET /api/documents — List owned and shared documents.
router.get("/", async (req, res): Promise<void> => {
  const userId = req.authUser!.id;

  try {
    const documents = await prisma.document.findMany({
      where: {
        deletedAt: null,
        OR: [
          { ownerId: userId },
          {
            permissions: {
              some: {
                userId,
                revokedAt: null,
              },
            },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        category: true,
        createdAt: true,
        updatedAt: true,
        ownerId: true,
      },
    });

    res.json({
      success: true,
      documents: documents.map((document) => ({
        ...document,
        sizeBytes: document.sizeBytes.toString(),
      })),
    });
  } catch (error) {
    console.error("Document listing failed:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve documents",
    });
  }
});

// DELETE /api/documents/:documentId — Owner-only soft delete plus storage removal.
router.delete("/:documentId", async (req, res): Promise<void> => {
  const userId = req.authUser!.id;
  const documentId = getSingleParam(req.params.documentId);

  if (!documentId) {
    res.status(400).json({
      success: false,
      message: "A valid document ID is required.",
    });
    return;
  }

  try {
    const document = await prisma.document.findFirst({
      where: { id: documentId, ownerId: userId, deletedAt: null },
      select: { id: true, originalName: true, storageKey: true },
    });

    if (!document) {
      res.status(404).json({
        success: false,
        message: "Document not found or you are not its owner.",
      });
      return;
    }

    const deletedAt = new Date();
    await prisma.document.update({
      where: { id: document.id },
      data: {
        deletedAt,
        permissions: {
          updateMany: {
            where: { revokedAt: null },
            data: { revokedAt: deletedAt },
          },
        },
      },
    });

    const { data: removedFiles, error: storageError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove([document.storageKey]);

    const fileRemoved = !storageError && Boolean(removedFiles?.length);

    if (storageError) {
      console.error(
        "Deleted document file could not be removed from Supabase:",
        storageError.message,
      );
    }

    await recordAudit({
      actorId: userId,
      documentId: document.id,
      action: "DOCUMENT_DELETE",
      success: true,
      ...auditRequest(req),
      details: { fileName: document.originalName, fileRemoved },
    }).catch((auditError) => {
      console.error("Document deletion audit logging failed:", auditError);
    });

    res.status(200).json({
      success: true,
      message: storageError
        ? "Document removed from your library, but its stored file could not be removed."
        : "Document deleted successfully.",
    });
  } catch (error) {
    console.error("Document deletion failed:", error);
    res.status(500).json({
      success: false,
      message: "Unable to delete the document.",
    });
  }
});

// GET /api/documents/:documentId/preview
// Only users with READ access (or the owner) can preview supported types.
router.get(
  "/:documentId/preview",
  requireDocumentAccess("READ"),
  async (req, res): Promise<void> => {
    const userId = req.authUser!.id;
    const documentId = getSingleParam(req.params.documentId);

    if (!documentId) {
      res.status(400).json({
        success: false,
        message: "A valid document ID is required.",
      });
      return;
    }

    try {
      const document = await prisma.document.findFirst({
        where: { id: documentId, deletedAt: null },
      });

      if (!document) {
        res.status(404).json({
          success: false,
          message: "Document not found.",
        });
        return;
      }

      if (!previewableTypes.has(document.mimeType)) {
        res.status(415).json({
          success: false,
          message: "Preview is unavailable for this file type. Download it instead.",
        });
        return;
      }

      const { data: file, error: storageError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .download(document.storageKey);

      if (storageError || !file) {
        console.error(
          "Supabase preview retrieval failed:",
          storageError?.message ?? "File not found",
        );

        await recordAudit({
          actorId: userId,
          documentId: document.id,
          action: "DOCUMENT_VIEW",
          success: false,
          ...auditRequest(req),
          details: {
            fileName: document.originalName,
            reason: "Stored file unavailable",
          },
        }).catch((auditError) => {
          console.error("Preview audit logging failed:", auditError);
        });

        res.status(404).json({
          success: false,
          message: "Stored file is unavailable. Please upload the document again.",
        });
        return;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      res.status(200);
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${safeDownloadName(document.originalName)}"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(buffer);

      await recordAudit({
        actorId: userId,
        documentId: document.id,
        action: "DOCUMENT_VIEW",
        success: true,
        ...auditRequest(req),
        details: { fileName: document.originalName },
      }).catch((auditError) => {
        console.error("Preview audit logging failed:", auditError);
      });
    } catch (error) {
      console.error("Document preview failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Unable to preview the document.",
        });
      }
    }
  },
);

// GET /api/documents/:documentId/download
// Preserves the existing EDIT-access requirement for downloads.
router.get(
  "/:documentId/download",
  requireDocumentAccess("EDIT"),
  async (req, res): Promise<void> => {
    const userId = req.authUser!.id;
    const documentId = getSingleParam(req.params.documentId);

    if (!documentId) {
      res.status(400).json({
        success: false,
        message: "A valid document ID is required.",
      });
      return;
    }

    try {
      const document = await prisma.document.findFirst({
        where: { id: documentId, deletedAt: null },
      });

      if (!document) {
        res.status(404).json({
          success: false,
          message: "Document not found.",
        });
        return;
      }

      const { data: file, error: storageError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .download(document.storageKey);

      if (storageError || !file) {
        console.error(
          "Supabase download retrieval failed:",
          storageError?.message ?? "File not found",
        );

        await recordAudit({
          actorId: userId,
          documentId: document.id,
          action: "DOCUMENT_DOWNLOAD",
          success: false,
          ...auditRequest(req),
          details: {
            fileName: document.originalName,
            reason: "Stored file unavailable",
          },
        }).catch((auditError) => {
          console.error("Download audit logging failed:", auditError);
        });

        res.status(404).json({
          success: false,
          message: "Stored file is unavailable. Please upload the document again.",
        });
        return;
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      try {
        await recordAudit({
          actorId: userId,
          documentId: document.id,
          action: "DOCUMENT_DOWNLOAD",
          success: true,
          ...auditRequest(req),
          details: { fileName: document.originalName },
        });
      } catch (auditError) {
        console.error("Download audit logging failed:", auditError);
        res.status(500).json({
          success: false,
          message: "Unable to record the download audit event.",
        });
        return;
      }

      res.status(200);
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeDownloadName(document.originalName)}"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(buffer);
    } catch (error) {
      console.error("Document download failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Unable to download the document.",
        });
      }
    }
  },
);

export default router;
