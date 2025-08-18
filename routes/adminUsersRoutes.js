import express from 'express';
import { 
  getUserAnalytics, 
  getUsers, 
  updateUserStatus, 
  exportUsers 
} from '../controllers/userAnalyticsController.js';
import { 
  adjustWalletBalance, 
  getUserWalletHistory, 
  getWalletStatistics, 
  bulkWalletOperation 
} from '../controllers/walletController.js';
import { 
  sendNotificationToUsers, 
  sendBroadcastNotification, 
  getNotificationTemplates, 
  getNotificationStatistics, 
  getScheduledNotifications, 
  cancelScheduledNotification 
} from '../controllers/adminNotificationController.js';
import { authenticateAdminOrSubAdmin } from '../middleware/authUnified.js';

const router = express.Router();

// Apply admin authentication to all routes
router.use(authenticateAdminOrSubAdmin);

// USER ANALYTICS ROUTES
router.get('/analytics', getUserAnalytics);
router.get('/list', getUsers);
router.patch('/:id/status', updateUserStatus);
router.get('/export', exportUsers);

// WALLET MANAGEMENT ROUTES
router.patch('/:userId/wallet/adjust', adjustWalletBalance);
router.get('/:userId/wallet/history', getUserWalletHistory);
router.get('/wallet/statistics', getWalletStatistics);
router.post('/wallet/bulk-operation', bulkWalletOperation);

// NOTIFICATION ROUTES
router.post('/notifications/send', sendNotificationToUsers);
router.post('/notifications/broadcast', sendBroadcastNotification);
router.get('/notifications/templates', getNotificationTemplates);
router.get('/notifications/statistics', getNotificationStatistics);
router.get('/notifications/scheduled', getScheduledNotifications);
router.patch('/notifications/:notificationId/cancel', cancelScheduledNotification);

export default router;
