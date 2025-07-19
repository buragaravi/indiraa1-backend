import express from 'express';
import { authenticateAdminOrSubAdmin } from '../middleware/auth.js';
import {
  getReturnAnalytics,
  getReturnReports,
  getProductReturnAnalysis,
  getCustomerReturnBehavior
} from '../controllers/returnAnalyticsController.js';

const router = express.Router();

// Return Analytics & Reports Routes

// Return Analytics Dashboard
router.get('/analytics', authenticateAdminOrSubAdmin, getReturnAnalytics);

// Return Reports
router.get('/reports', authenticateAdminOrSubAdmin, getReturnReports);

// Product Return Analysis
router.get('/product-analysis', authenticateAdminOrSubAdmin, getProductReturnAnalysis);

// Customer Return Behavior
router.get('/customer-behavior', authenticateAdminOrSubAdmin, getCustomerReturnBehavior);

export default router;
