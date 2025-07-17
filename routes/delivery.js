import express from 'express';
import {
  getAssignedOrders,
  getOrderDetails,
  updateDeliveryStatus,
  reportDeliveryIssue,
  getDeliveryStats
} from '../controllers/deliveryController.js';
import { 
  authenticateDeliveryAgent,
  checkWorkingHours 
} from '../middleware/authDeliveryAgent.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateDeliveryAgent);

// @route   GET /api/delivery/orders/assigned
// @desc    Get assigned orders for delivery agent
// @access  Private (Delivery Agent)
router.get('/orders/assigned', getAssignedOrders);

// @route   GET /api/delivery/orders/:orderId
// @desc    Get single order details
// @access  Private (Delivery Agent)
router.get('/orders/:orderId', getOrderDetails);

// @route   PUT /api/delivery/orders/:orderId/status
// @desc    Update delivery status (includes OTP verification for delivered status)
// @access  Private (Delivery Agent)
router.put('/orders/:orderId/status', updateDeliveryStatus);

// @route   POST /api/delivery/orders/:orderId/issue
// @desc    Report delivery issue
// @access  Private (Delivery Agent)
router.post('/orders/:orderId/issue', reportDeliveryIssue);

// @route   GET /api/delivery/stats
// @desc    Get delivery agent statistics
// @access  Private (Delivery Agent)
router.get('/stats', getDeliveryStats);

export default router;
