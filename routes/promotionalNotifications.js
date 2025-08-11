import express from 'express';
import promotionalNotificationService from '../services/promotionalNotificationService.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get promotional notification service status
router.get('/status', authenticateAdmin, async (req, res) => {
  try {
    const status = promotionalNotificationService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting promotional notification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status',
      error: error.message
    });
  }
});

// Start promotional notification scheduler
router.post('/start', authenticateAdmin, async (req, res) => {
  try {
    promotionalNotificationService.startScheduler();
    res.json({
      success: true,
      message: 'Promotional notification scheduler started successfully',
      data: promotionalNotificationService.getStatus()
    });
  } catch (error) {
    console.error('Error starting promotional notification scheduler:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start scheduler',
      error: error.message
    });
  }
});

// Stop promotional notification scheduler
router.post('/stop', authenticateAdmin, async (req, res) => {
  try {
    promotionalNotificationService.stopScheduler();
    res.json({
      success: true,
      message: 'Promotional notification scheduler stopped successfully',
      data: promotionalNotificationService.getStatus()
    });
  } catch (error) {
    console.error('Error stopping promotional notification scheduler:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop scheduler',
      error: error.message
    });
  }
});

// Send test promotional notifications immediately
router.post('/test', authenticateAdmin, async (req, res) => {
  try {
    console.log('🧪 Admin requested test promotional notifications');
    const result = await promotionalNotificationService.sendTestNotification();
    
    res.json({
      success: true,
      message: 'Test promotional notifications sent',
      data: result
    });
  } catch (error) {
    console.error('Error sending test promotional notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notifications',
      error: error.message
    });
  }
});

// Send promotional notifications to specific user (for testing)
router.post('/send-to-user/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = await promotionalNotificationService.sendPromotionalNotificationToUser(user);
    
    res.json({
      success: true,
      message: 'Promotional notification sent to user',
      data: result
    });
  } catch (error) {
    console.error('Error sending promotional notification to user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
      error: error.message
    });
  }
});

// Get all promotional messages
router.get('/messages', authenticateAdmin, async (req, res) => {
  try {
    const messages = promotionalNotificationService.promotionalMessages;
    res.json({
      success: true,
      data: {
        messages,
        count: messages.length
      }
    });
  } catch (error) {
    console.error('Error getting promotional messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get messages',
      error: error.message
    });
  }
});

export default router;
