import express from 'express';
import {
  createDeliveryAgent,
  getDeliveryAgents,
  updateDeliveryAgent,
  deactivateDeliveryAgent,
  assignOrderToAgent,
  getUnassignedOrders,
  getDeliveryAnalytics
} from '../controllers/adminDeliveryController.js';
import { authenticateAdminOrSubAdmin } from '../middleware/authUnified.js';

const router = express.Router();

// Apply admin/sub-admin authentication middleware to all routes
router.use(authenticateAdminOrSubAdmin);

// @route   POST /api/admin/delivery/agents
// @desc    Create new delivery agent
// @access  Private (Admin)
router.post('/agents', createDeliveryAgent);

// @route   GET /api/admin/delivery/agents
// @desc    Get all delivery agents
// @access  Private (Admin)
router.get('/agents', getDeliveryAgents);

// @route   PUT /api/admin/delivery/agents/:agentId
// @desc    Update delivery agent
// @access  Private (Admin)
router.put('/agents/:agentId', updateDeliveryAgent);

// @route   DELETE /api/admin/delivery/agents/:agentId
// @desc    Deactivate delivery agent
// @access  Private (Admin)
router.delete('/agents/:agentId', deactivateDeliveryAgent);

// @route   POST /api/admin/orders/:orderId/assign/:agentId
// @desc    Assign order to delivery agent
// @access  Private (Admin)
router.post('/orders/:orderId/assign/:agentId', assignOrderToAgent);

// @route   GET /api/admin/delivery/unassigned-orders
// @desc    Get unassigned orders
// @access  Private (Admin)
router.get('/unassigned-orders', getUnassignedOrders);

// @route   GET /api/admin/delivery/analytics
// @desc    Get delivery analytics
// @access  Private (Admin)
router.get('/analytics', getDeliveryAnalytics);

export default router;
