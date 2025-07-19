import express from 'express';
import { authenticateDeliveryAgent } from '../middleware/authDeliveryAgent.js';
import {
  getAssignedPickups,
  verifyPickupOTP,
  updatePickupStatus,
  getPickupDetails,
  startPickupProcess,
  completePickupProcess
} from '../controllers/deliveryReturnController.js';

const router = express.Router();

// Delivery Agent Return Pickup Management Routes

// Get Assigned Return Pickups
router.get('/assigned', authenticateDeliveryAgent, getAssignedPickups);

// Get Pickup Details
router.get('/:returnId/details', authenticateDeliveryAgent, getPickupDetails);

// Pickup Process Management

// Start Pickup Process
router.post('/:returnId/start', authenticateDeliveryAgent, startPickupProcess);

// Verify Pickup Using Order OTP
router.post('/:returnId/verify-otp', authenticateDeliveryAgent, verifyPickupOTP);

// Update Pickup Progress
router.put('/:returnId/status', authenticateDeliveryAgent, updatePickupStatus);

// Complete Pickup Process
router.post('/:returnId/complete', authenticateDeliveryAgent, completePickupProcess);

export default router;
