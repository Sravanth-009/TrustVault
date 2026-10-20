import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { recordAudit } from "../utils/audit.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

// Register: public accounts always receive the VIEWER role.
// After creating the account, establish a session so the user is signed in
// immediately and can go directly to the dashboard.
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid registration details",
    });
  }

  try {
    const { name, password } = parsed.data;
    const email = parsed.data.email.toLowerCase();

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "VIEWER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    try {
      await recordAudit({
        actorId: user.id,
        action: "REGISTER",
        success: true,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch (auditError) {
      console.error("Registration audit failed:", auditError);
      // Do not leave a newly created account unable to sign in because
      // an audit write failed. Continue with session creation.
    }

    req.session.regenerate((sessionError) => {
      if (sessionError) {
        console.error("Registration session regeneration failed:", sessionError);
        return res.status(500).json({
          success: false,
          message:
            "Account created, but automatic sign-in failed. Please sign in with your new account.",
        });
      }

      req.session.userId = user.id;

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Registration session save failed:", saveError);
          return res.status(500).json({
            success: false,
            message:
              "Account created, but automatic sign-in failed. Please sign in with your new account.",
          });
        }

        return res.status(201).json({
          success: true,
          message: "Registration successful",
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
          },
        });
      });
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    console.error("Registration failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to register user",
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid email or password",
    });
  }

  const email = parsed.data.email.toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    const passwordMatches =
      user !== null &&
      user.active &&
      (await argon2.verify(user.passwordHash, parsed.data.password));

    if (!passwordMatches || !user) {
      try {
        await recordAudit({
          action: "LOGIN",
          success: false,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          details: { email },
        });
      } catch (auditError) {
        console.error("Failed-login audit failed:", auditError);
      }

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Regenerate the session to protect against session fixation.
    req.session.regenerate((sessionError) => {
      if (sessionError) {
        console.error("Session regeneration failed:", sessionError);
        return res.status(500).json({
          success: false,
          message: "Unable to sign in",
        });
      }

      req.session.userId = user.id;

      req.session.save(async (saveError) => {
        if (saveError) {
          console.error("Session save failed:", saveError);
          return res.status(500).json({
            success: false,
            message: "Unable to sign in",
          });
        }

        try {
          await recordAudit({
            actorId: user.id,
            action: "LOGIN",
            success: true,
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
          });

          return res.status(200).json({
            success: true,
            message: "Login successful",
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
            },
          });
        } catch (error) {
          console.error("Login audit failed:", error);

          return req.session.destroy(() => {
            res.clearCookie("trustvault.sid");
            return res.status(500).json({
              success: false,
              message: "Unable to complete sign in",
            });
          });
        }
      });
    });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to sign in",
    });
  }
});

// Current authenticated user
router.get("/me", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!user || !user.active) {
      return req.session.destroy(() => {
        res.clearCookie("trustvault.sid");
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Session check failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to check session",
    });
  }
});

// Logout
router.post("/logout", (req, res) => {
  const userId = req.session.userId;

  req.session.destroy(async (error) => {
    if (error) {
      console.error("Logout failed:", error);
      return res.status(500).json({
        success: false,
        message: "Unable to log out",
      });
    }

    res.clearCookie("trustvault.sid");

    if (userId) {
      try {
        await recordAudit({
          actorId: userId,
          action: "LOGOUT",
          success: true,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });
      } catch (auditError) {
        console.error("Logout audit failed:", auditError);
        return res.status(500).json({
          success: false,
          message: "Logged out, but audit recording failed",
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  });
});

export default router;
