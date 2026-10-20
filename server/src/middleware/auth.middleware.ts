
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/prisma.js";

export type TrustVaultRole = "ADMIN" | "OWNER" | "VIEWER";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        role: TrustVaultRole;
      };
    }
  }
}

/**
 * Verify the session and reload the active user from PostgreSQL.
 * Never trust a role supplied by the browser.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        active: true,
      },
    });

    if (!user || !user.active) {
      req.session.destroy(() => {
        res.clearCookie("trustvault.sid");

        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      });
      return;
    }

    req.authUser = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error("Authentication middleware failed:", error);

    res.status(500).json({
      success: false,
      message: "Unable to verify authentication",
    });
  }
}

/**
 * Restrict an endpoint to specific roles.
 * Always use after requireAuth.
 */
export function requireRole(...allowedRoles: TrustVaultRole[]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.authUser) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action",
      });
      return;
    }

    next();
  };
}
