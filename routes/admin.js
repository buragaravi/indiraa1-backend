import express from 'express';
import { authenticateAdminOrSubAdmin } from '../middleware/authUnified.js';
import { getAllOrders } from '../controllers/productController.js';

const router = express.Router();

/**
 * Admin Routes
 * Provides convenient endpoints for admin operations including drill-down analytics
 */

// Apply admin/sub-admin authentication to all routes
router.use(authenticateAdminOrSubAdmin);

/**
 * Drill-down endpoints for revenue analytics
 * These endpoints support the drill-down functionality mentioned in requirements:
 * - pendingOrders: '/api/admin/orders?status=pending'
 * - upiPendingOrders: '/api/admin/orders?status=pending&payment=upi'
 * - deliveredCashOrders: '/api/admin/orders?status=delivered&payment=cash'
 */

// Get filtered orders - supports all drill-down scenarios
// GET /api/admin/orders?status=pending - pending orders
// GET /api/admin/orders?status=pending&payment=upi - UPI pending orders
// GET /api/admin/orders?status=delivered&payment=cash - delivered cash orders
// GET /api/admin/orders?payment=cash - all cash orders
// GET /api/admin/orders?payment=upi - all UPI orders
router.get('/orders', getAllOrders);

export default router;
