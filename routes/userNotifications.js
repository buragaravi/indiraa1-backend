import express from 'express';
import notificationService from '../services/notificationService.js';
import Notification from '../models/Notification.js';
import { authenticateUser } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateUser);

// Get user notifications with pagination
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, type, isRead } = req.query;
    const userId = req.user.id;

    // Build filters
    const filters = {};
    if (type) filters.type = type;
    if (isRead !== undefined) filters.isRead = isRead === 'true';

    const result = await notificationService.getUserNotifications(
      userId, 
      parseInt(page), 
      parseInt(limit), 
      filters
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

// Get unread notifications count
router.get('/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await notificationService.getUnreadCount(userId);

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count'
    });
  }
});

// Mark notifications as read
router.patch('/mark-read', async (req, res) => {
  try {
    const { notificationIds } = req.body;
    const userId = req.user.id;

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({
        success: false,
        message: 'Notification IDs array is required'
      });
    }

    const result = await notificationService.markAsRead(notificationIds, userId);

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
    });
  }
});

// Mark all notifications as read
router.patch('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await notificationService.markAllAsRead(userId);

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read'
    });
  }
});

// Delete notifications
router.delete('/', async (req, res) => {
  try {
    const { notificationIds } = req.body;
    const userId = req.user.id;

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return res.status(400).json({
        success: false,
        message: 'Notification IDs array is required'
      });
    }

    const result = await notificationService.deleteNotifications(notificationIds, userId);

    res.json({
      success: true,
      message: `${result.deletedCount} notifications deleted`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notifications'
    });
  }
});

// Get notification by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({ _id: id, userId })
      .populate('relatedOrderId', 'orderNumber totalAmount status')
      .populate('relatedProductId', 'name images price')
      .populate('relatedTransactionId', 'amount type description');

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Mark as read if not already read
    if (!notification.isRead) {
      await notification.markAsRead();
    }

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification'
    });
  }
});

// Mark single notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({ _id: id, userId });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    if (!notification.isRead) {
      await notification.markAsRead();
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});

// Get notification preferences
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.user.id;
    const User = (await import('../models/User.js')).default;
    
    const user = await User.findById(userId).select('notificationPreferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      preferences: user.notificationPreferences || {
        orders: true,
        offers: true,
        general: true,
        promotional: true
      }
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification preferences'
    });
  }
});

// Update notification preferences
router.patch('/preferences', async (req, res) => {
  try {
    const userId = req.user.id;
    const { preferences } = req.body;
    const User = (await import('../models/User.js')).default;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Valid preferences object is required'
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { notificationPreferences: preferences },
      { new: true }
    ).select('notificationPreferences');

    res.json({
      success: true,
      message: 'Notification preferences updated',
      preferences: user.notificationPreferences
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification preferences'
    });
  }
});

export default router;
