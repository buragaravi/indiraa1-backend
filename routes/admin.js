import express from 'express';
import { authenticateAdminOrSubAdmin } from '../middleware/authUnified.js';
import { getAllOrders } from '../controllers/productController.js';
import {
  getCurrentAdmin,
  createAdmin,
  listAdmins,
  updateAdmin,
  updateAdminPermissions,
  deleteAdmin,
  getAdminActivityLogs
} from '../controllers/adminController.js';

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

/**
 * Multi-Admin Management Endpoints
 * These endpoints support the multi-admin permission system
 */

// Get current admin data with permissions
router.get('/me', getCurrentAdmin);

// Admin management (Super Admin only)
router.post('/create', createAdmin);
router.get('/list', listAdmins);
router.put('/:id', updateAdmin);
router.put('/:adminId/permissions', updateAdminPermissions);
router.delete('/:adminId', deleteAdmin);

// Activity logs (Super Admin only)
router.get('/activity-logs', getAdminActivityLogs);

export default router;
