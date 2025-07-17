import express from 'express';
import {
  loginDeliveryAgent,
  refreshToken,
  logoutDeliveryAgent,
  changePassword,
  getProfile,
  updateProfile
} from '../controllers/deliveryAuthController.js';
import { authenticateDeliveryAgent } from '../middleware/authDeliveryAgent.js';

const router = express.Router();

// @route   POST /api/delivery-auth/login
// @desc    Login delivery agent
// @access  Public
router.post('/login', loginDeliveryAgent);

// @route   POST /api/delivery-auth/refresh
// @desc    Refresh delivery agent token
// @access  Public
router.post('/refresh', refreshToken);

// @route   POST /api/delivery-auth/logout
// @desc    Logout delivery agent
// @access  Private (Delivery Agent)
router.post('/logout', authenticateDeliveryAgent, logoutDeliveryAgent);

// @route   PUT /api/delivery-auth/change-password
// @desc    Change delivery agent password
// @access  Private (Delivery Agent)
router.put('/change-password', authenticateDeliveryAgent, changePassword);

// @route   GET /api/delivery-auth/profile
// @desc    Get delivery agent profile
// @access  Private (Delivery Agent)
router.get('/profile', authenticateDeliveryAgent, getProfile);

// @route   PUT /api/delivery-auth/profile
// @desc    Update delivery agent profile
// @access  Private (Delivery Agent)
router.put('/profile', authenticateDeliveryAgent, updateProfile);

export default router;
