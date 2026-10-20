
import { Router, type Request } from "express";
import multer from "multer";
import path from "node:path";
import { mkdir, unlink, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { prisma } from "../utils/prisma.js";
import { recordAudit } from "../utils/audit.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireDocumentAccess } from "../middleware/document.middleware.js";

const router = Router();

const uploadDirectory = path.resolve(process.cwd(), "private_uploads");

await mkdir(uploadDirectory, { recursive: true });

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

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDirectory);
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
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

function getSafeFilePath(storageKey: string): string | null {
  // Uploaded storage keys are generated UUID filenames.
  if (
    path.basename(storageKey) !== storageKey ||
    storageKey.includes("..")
  ) {
    return null;
  }

  const filePath = path.resolve(uploadDirectory, storageKey);

  return path.dirname(filePath) === uploadDirectory ? filePath : null;
}

router.use(requireAuth);

// POST /api/documents — Upload a document.
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

    try {
      const title =
        typeof req.body.title === "string" && req.body.title.trim()
          ? req.body.title.trim().slice(0, 200)
          : path
              .basename(file.originalname, path.extname(file.originalname))
              .slice(0, 200);

      const category =
        typeof req.body.category === "string" && req.body.category.trim()
          ? req.body.category.trim().slice(0, 100)
          : null;

      const document = await prisma.document.create({
        data: {
          title,
          originalName: path.basename(file.originalname),
          storageKey: file.filename,
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
      await unlink(file.path).catch(() => undefined);

      console.error("Document upload failed:", error);

      res.status(500).json({
        success: false,
        message: "Unable to save the document",
      });
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

// DELETE /api/documents/:documentId — Only the original owner can delete a document.
// This is a soft delete in the database so audit history can remain intact;
// the stored file is also removed from the server's local upload directory.
router.delete(
  "/:documentId",
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
      // Match both ID and owner ID. A shared recipient, even with EDIT access,
      // cannot delete another user's document by calling this endpoint directly.
      const document = await prisma.document.findFirst({
        where: { id: documentId, ownerId: userId, deletedAt: null },
        select: {
          id: true,
          originalName: true,
          storageKey: true,
        },
      });

      // Use the same response for missing and non-owned documents.
      if (!document) {
        res.status(404).json({
          success: false,
          message: "Document not found or you are not its owner.",
        });
        return;
      }

      // Soft-delete and revoke active shares. This immediately removes the
      // document from normal document listings while preserving audit history.
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

      // Remove the stored file. If it is already missing, the database record
      // is still securely marked deleted; report other filesystem errors.
      const filePath = getSafeFilePath(document.storageKey);
      let fileRemoved = false;

      if (filePath) {
        try {
          await unlink(filePath);
          fileRemoved = true;
        } catch (fileError) {
          if ((fileError as NodeJS.ErrnoException).code !== "ENOENT") {
            console.error("Deleted document file could not be removed:", fileError);
          }
        }
      }

      await recordAudit({
        actorId: userId,
        documentId: document.id,
        action: "DOCUMENT_DELETE",
        success: true,
        ...auditRequest(req),
        details: {
          fileName: document.originalName,
          fileRemoved,
        },
      }).catch((auditError) => {
        // Do not undo a deletion if audit logging fails; preserve the server log.
        console.error("Document deletion audit logging failed:", auditError);
      });

      res.status(200).json({
        success: true,
        message: "Document deleted successfully.",
      });
    } catch (error) {
      console.error("Document deletion failed:", error);
      res.status(500).json({
        success: false,
        message: "Unable to delete the document.",
      });
    }
  },
);

// GET /api/documents/:documentId/preview
// Preview supported files and record a view after successful delivery.
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

      const filePath = getSafeFilePath(document.storageKey);

      if (!filePath) {
        res.status(400).json({
          success: false,
          message: "Invalid stored file path.",
        });
        return;
      }

      const fileInfo = await stat(filePath);

      res.status(200);
      res.setHeader("Content-Type", document.mimeType);
      res.setHeader("Content-Length", fileInfo.size);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${path.basename(document.originalName).replace(/["\r\n]/g, "_")}"`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");

      const stream = (await import("node:fs")).createReadStream(filePath);

      let auditRecorded = false;

      const auditView = async (success: boolean) => {
        if (auditRecorded) return;
        auditRecorded = true;

        try {
          await recordAudit({
            actorId: userId,
            documentId: document.id,
            action: "DOCUMENT_VIEW",
            success,
            ...auditRequest(req),
            details: {
              fileName: document.originalName,
            },
          });
        } catch (auditError) {
          console.error("Document view audit logging failed:", auditError);
        }
      };

      stream.on("error", (error) => {
        console.error("Document preview stream failed:", error);
        void auditView(false);

        if (!res.headersSent) {
          res.status(404).json({
            success: false,
            message: "Stored file is unavailable.",
          });
        } else {
          res.destroy(error);
        }
      });

      stream.on("end", () => {
        void auditView(true);
      });

      stream.pipe(res);
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
// Only EDIT users and document owners can download.
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

      const filePath = getSafeFilePath(document.storageKey);

      if (!filePath) {
        res.status(400).json({
          success: false,
          message: "Invalid stored file path.",
        });
        return;
      }

      try {
        await stat(filePath);
      } catch {
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
          console.error("Failed download audit logging failed:", auditError);
        });

        res.status(404).json({
          success: false,
          message: "Stored file is unavailable.",
        });
        return;
      }

      // Record the download attempt before sending the file.
      // This means the log represents an authorized download request,
      // not proof that the user read or retained the file.
      try {
        await recordAudit({
          actorId: userId,
          documentId: document.id,
          action: "DOCUMENT_DOWNLOAD",
          success: true,
          ...auditRequest(req),
          details: {
            fileName: document.originalName,
          },
        });
      } catch (auditError) {
        console.error("Download audit logging failed:", auditError);

        res.status(500).json({
          success: false,
          message: "Unable to record the download audit event.",
        });
        return;
      }

      res.download(filePath, document.originalName, (error) => {
        if (error) {
          console.error("Document download response failed:", error);

          if (!res.headersSent) {
            res.status(404).json({
              success: false,
              message: "Unable to deliver the stored file.",
            });
          }
        }
      });
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
