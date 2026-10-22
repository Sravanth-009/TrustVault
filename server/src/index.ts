import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";

import { prisma } from "./utils/prisma.js";
import authRoutes from "./routes/auth.routes.js";
import documentRoutes from "./routes/document.routes.js";
import permissionRoutes from "./routes/permission.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import {
  requireAuth,
  requireRole,
} from "./middleware/auth.middleware.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error(
    "SESSION_SECRET must be set to a random secret of at least 32 characters",
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const PgSessionStore = connectPgSimple(session);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.use(
  session({
    name: "trustvault.sid",
    store: new PgSessionStore({
      pool: sessionPool,
      createTableIfMissing: true,
      tableName: "user_sessions",
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

// API information
app.get("/", (_req, res) => {
  res.status(200).json({
    name: "TrustVault",
    description: "Secure document sharing with a real audit trail",
    status: "running",
    endpoints: {
      health: "GET /api/health",
      database: "GET /api/db-check",
      register: "POST /api/auth/register",
      login: "POST /api/auth/login",
      me: "GET /api/auth/me",
      logout: "POST /api/auth/logout",
      uploadDocument: "POST /api/documents",
      listDocuments: "GET /api/documents",
      downloadDocument: "GET /api/documents/:documentId/download",
      grantPermission: "POST /api/documents/:documentId/permissions",
      listPermissions: "GET /api/documents/:documentId/permissions",
      revokePermission:
        "DELETE /api/documents/:documentId/permissions/:userId",
      auditVerification: "GET /api/audit/verify",
      protected: "GET /api/protected",
      adminTest: "GET /api/admin-test",
    },
  });
});

// Health check
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "TrustVault API is running",
    timestamp: new Date().toISOString(),
  });
});

// Diagnostic endpoint: confirms that auth routes are mounted.
app.get("/api/auth-route-check", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Authentication routes are mounted",
    currentUserEndpoint: "GET /api/auth/me",
  });
});

// Database check
app.get("/api/db-check", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "TrustVault database connection successful",
    });
  } catch (error) {
    console.error("Database check failed:", error);

    res.status(503).json({
      success: false,
      message: "TrustVault database connection failed",
    });
  }
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Document routes
app.use("/api/documents", documentRoutes);

// Permission routes
app.use("/api/documents", permissionRoutes);

// Audit verification routes
app.use("/api/audit", auditRoutes);

// Notification routes
app.use("/api/notifications", notificationRoutes);

// Protected route
app.get("/api/protected", requireAuth, (req, res) => {
  res.status(200).json({
    success: true,
    message: "You are authenticated",
    user: req.authUser,
  });
});

// Administrator-only test route
app.get(
  "/api/admin-test",
  requireAuth,
  requireRole("ADMIN"),
  (_req, res) => {
    res.status(200).json({
      success: true,
      message: "Admin access granted",
    });
  },
);

// Keep the 404 handler last.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});

const startServer = async (): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await sessionPool.query("SELECT 1");

    const server = app.listen(PORT, () => {
      console.log("Database connection successful");
      console.log("PostgreSQL session store connection successful");
      console.log(`TrustVault API running at http://localhost:${PORT}`);
      console.log("Authentication routes mounted at /api/auth");
      console.log("Audit verification mounted at /api/audit");
    });

    server.on("error", (error) => {
      console.error("TrustVault HTTP server error:", error);
    });
  } catch (error) {
    console.error("Unable to start TrustVault:", error);
    await prisma.$disconnect();
    await sessionPool.end();
    process.exitCode = 1;
  }
};

async function shutdown(): Promise<void> {
  console.log("Shutting down TrustVault...");
  await prisma.$disconnect();
  await sessionPool.end();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

void startServer();
