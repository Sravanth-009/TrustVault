import { Router, type Request, type Response } from "express";
import { PermissionLevel } from "../../generated/prisma/client.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { prisma } from "../utils/prisma.js";
import { recordAudit } from "../utils/audit.js";

const router = Router();

router.use(requireAuth);

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function recordDenied(
  req: Request,
  documentId: string,
  action: string,
): Promise<void> {
  try {
    await recordAudit({
      actorId: req.authUser?.id ?? null,
      documentId: documentId || null,
      action,
      success: false,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        reason: "Only the document owner can manage permissions",
      },
    });
  } catch (error) {
    console.error("Failed to record denied permission action:", error);
  }
}

async function checkOwner(
  req: Request,
  res: Response,
  documentId: string,
  action: string,
): Promise<{ id: string; ownerId: string; title: string } | null> {
  const userId = req.authUser?.id;

  if (!userId || !documentId) {
    res.status(400).json({
      success: false,
      message: "A valid document ID is required.",
    });
    return null;
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      deletedAt: null,
    },
    select: {
      id: true,
      ownerId: true,
      title: true,
    },
  });

  if (!document || document.ownerId !== userId) {
    await recordDenied(req, documentId, action);

    res.status(403).json({
      success: false,
      message: "Forbidden: only the document owner can manage permissions.",
    });
    return null;
  }

  return document;
}

// Only the document owner can grant READ or EDIT permission.
router.post("/:documentId/permissions", async (req, res) => {
  try {
    const documentId = getParam(req.params.documentId);
    const document = await checkOwner(
      req,
      res,
      documentId,
      "PERMISSION_GRANT_DENIED",
    );
    if (!document) {
      return;
    }

    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const rawLevel =
      typeof req.body?.level === "string"
        ? req.body.level.trim().toUpperCase()
        : "";

    if (
      !email ||
      ![PermissionLevel.READ, PermissionLevel.EDIT].includes(
        rawLevel as PermissionLevel,
      )
    ) {
      res.status(400).json({
        success: false,
        message: "Provide a valid email and permission level (READ or EDIT).",
      });
      return;
    }

    const recipient = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
      },
    });

    if (!recipient || !recipient.active) {
      res.status(404).json({
        success: false,
        message: "An active account with that email was not found.",
      });
      return;
    }

    if (recipient.id === req.authUser!.id) {
      res.status(400).json({
        success: false,
        message: "You already own this document.",
      });
      return;
    }

    const level = rawLevel as PermissionLevel;

    const permission = await prisma.$transaction(async (tx) => {
      return tx.permission.upsert({
        where: {
          documentId_userId: {
            documentId,
            userId: recipient.id,
          },
        },
        create: {
          documentId,
          userId: recipient.id,
          grantedById: req.authUser!.id,
          level,
        },
        update: {
          level,
          grantedById: req.authUser!.id,
          grantedAt: new Date(),
          revokedAt: null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });

    await recordAudit({
      actorId: req.authUser!.id,
      documentId,
      action: "PERMISSION_GRANTED",
      success: true,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        recipientEmail: recipient.email,
        level,
      },
    });

    // Create notification alert for both SENDER and RECEIVER
    const senderName = req.authUser!.name || req.authUser!.email;
    const recipientName = recipient.name || recipient.email;
    const docTitle = document.title;

    await prisma.notification.createMany({
      data: [
        {
          userId: req.authUser!.id,
          title: "Permission Granted",
          message: `You granted ${level} access to "${docTitle}" for ${recipientName} (${recipient.email}).`,
          type: "PERMISSION_GRANTED",
        },
        {
          userId: recipient.id,
          title: "Access Granted",
          message: `${senderName} granted you ${level} access to "${docTitle}".`,
          type: "PERMISSION_GRANTED",
        },
      ],
    });

    res.status(200).json({
      success: true,
      permission,
      message: `Permission (${level}) granted to ${recipientName}. Alerts sent to both sender and receiver.`,
    });
  } catch (error) {
    console.error("Grant permission error:", error);

    res.status(500).json({
      success: false,
      message: "Could not grant permission.",
    });
  }
});

// Only the document owner can list active permissions.
router.get("/:documentId/permissions", async (req, res) => {
  try {
    const documentId = getParam(req.params.documentId);
    const document = await checkOwner(
      req,
      res,
      documentId,
      "PERMISSION_LIST_DENIED",
    );
    if (!document) {
      return;
    }

    const permissions = await prisma.permission.findMany({
      where: {
        documentId,
        revokedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        grantedAt: "desc",
      },
    });

    res.json({
      success: true,
      permissions,
    });
  } catch (error) {
    console.error("List permissions error:", error);

    res.status(500).json({
      success: false,
      message: "Could not load permissions.",
    });
  }
});

// Only the document owner can revoke a permission.
router.delete(
  "/:documentId/permissions/:permissionId",
  async (req, res) => {
    try {
      const documentId = getParam(req.params.documentId);
      const permissionId = getParam(req.params.permissionId);

      const document = await checkOwner(
        req,
        res,
        documentId,
        "PERMISSION_REVOKE_DENIED",
      );
      if (!document) {
        return;
      }

      const permission = await prisma.permission.findFirst({
        where: {
          id: permissionId,
          documentId,
          revokedAt: null,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!permission) {
        res.status(404).json({
          success: false,
          message: "Active permission not found.",
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.permission.update({
          where: {
            id: permission.id,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      });

      await recordAudit({
        actorId: req.authUser!.id,
        documentId,
        action: "PERMISSION_REVOKED",
        success: true,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          recipientUserId: permission.userId,
          recipientEmail: permission.user?.email,
        },
      });

      // Create notification alert for both SENDER and RECEIVER
      const senderName = req.authUser!.name || req.authUser!.email;
      const recipientName = permission.user?.name || permission.user?.email || "User";
      const docTitle = document.title;

      await prisma.notification.createMany({
        data: [
          {
            userId: req.authUser!.id,
            title: "Permission Revoked",
            message: `You revoked access to "${docTitle}" for ${recipientName}.`,
            type: "PERMISSION_REVOKED",
          },
          {
            userId: permission.userId,
            title: "Access Revoked",
            message: `${senderName} revoked your access to "${docTitle}".`,
            type: "PERMISSION_REVOKED",
          },
        ],
      });

      res.json({
        success: true,
        message: `Permission revoked for ${recipientName}. Alerts sent to both sender and receiver.`,
      });
    } catch (error) {
      console.error("Revoke permission error:", error);

      res.status(500).json({
        success: false,
        message: "Could not revoke permission.",
      });
    }
  },
);

export default router;
