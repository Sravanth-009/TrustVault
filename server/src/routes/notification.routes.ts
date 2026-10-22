import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { prisma } from "../utils/prisma.js";

const router = Router();
router.use(requireAuth);

// GET /api/notifications
// Return the user's notifications (newest first) and unread count
router.get("/", async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId, read: false },
      }),
    ]);

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Failed to load notifications:", error);
    res.status(500).json({
      success: false,
      message: "Unable to load notifications.",
    });
  }
});

// PATCH /api/notifications/:id/read
// Mark a single notification as read
router.patch("/:id/read", async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id) {
      res.status(400).json({ success: false, message: "Notification ID is required." });
      return;
    }

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      res.status(404).json({ success: false, message: "Notification not found." });
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    res.status(200).json({ success: true, notification: updated });
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    res.status(500).json({ success: false, message: "Unable to update notification." });
  }
});

// POST /api/notifications/mark-all-read
// Mark all notifications for current user as read
router.post("/mark-all-read", async (req, res) => {
  try {
    const userId = req.authUser!.id;

    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    res.status(200).json({ success: true, message: "All notifications marked as read." });
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
    res.status(500).json({ success: false, message: "Unable to mark notifications as read." });
  }
});

export default router;
