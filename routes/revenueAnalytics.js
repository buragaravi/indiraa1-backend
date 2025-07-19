import express from 'express';
import revenueAnalyticsController from '../controllers/revenueAnalyticsController.js';
import { authenticateAdminOrSubAdmin } from '../middleware/authUnified.js';

const router = express.Router();

/**
 * Revenue Analytics Routes
 * All routes require admin authentication
 */

// Apply admin authentication to all routes
router.use(authenticateAdminOrSubAdmin);

// Main revenue analytics endpoint
// GET /api/revenue-analytics
router.get('/', revenueAnalyticsController.getRevenueAnalytics);

// Revenue analytics by date range
// GET /api/revenue-analytics/date-range?startDate=2024-01-01&endDate=2024-01-31
router.get('/date-range', revenueAnalyticsController.getRevenueAnalyticsByDateRange);

// Drill-down data for specific revenue categories
// GET /api/revenue-analytics/details?category=status&filter=pending&page=1&limit=20
router.get('/details', revenueAnalyticsController.getRevenueDetailsByCategory);

// Revenue trends (daily, weekly, monthly)
// GET /api/revenue-analytics/trends?period=daily&days=30
router.get('/trends', revenueAnalyticsController.getRevenueTrends);

// Top performing products by revenue
// GET /api/revenue-analytics/top-products?limit=10&period=30
router.get('/top-products', revenueAnalyticsController.getTopPerformingProducts);

export default router;
