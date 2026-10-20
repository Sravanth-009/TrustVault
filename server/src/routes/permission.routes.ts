
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
): Promise<boolean> {
  const userId = req.authUser?.id;

  if (!userId || !documentId) {
    res.status(400).json({
      success: false,
      message: "A valid document ID is required.",
    });
    return false;
  }

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

  if (!document || document.ownerId !== userId) {
    await recordDenied(req, documentId, action);

    res.status(403).json({
      success: false,
      message: "Forbidden: only the document owner can manage permissions.",
    });
    return false;
  }

  return true;
}

// Only the document owner can grant READ or EDIT permission.
router.post("/:documentId/permissions", async (req, res) => {
  try {
    const documentId = getParam(req.params.documentId);

    if (
      !(await checkOwner(
        req,
        res,
        documentId,
        "PERMISSION_GRANT_DENIED",
      ))
    ) {
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

    res.status(200).json({
      success: true,
      permission,
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

    if (
      !(await checkOwner(
        req,
        res,
        documentId,
        "PERMISSION_LIST_DENIED",
      ))
    ) {
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

      if (
        !(await checkOwner(
          req,
          res,
          documentId,
          "PERMISSION_REVOKE_DENIED",
        ))
      ) {
        return;
      }

      const permission = await prisma.permission.findFirst({
        where: {
          id: permissionId,
          documentId,
          revokedAt: null,
        },
        select: {
          id: true,
          userId: true,
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
        },
      });

      res.json({
        success: true,
        message: "Permission revoked.",
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
