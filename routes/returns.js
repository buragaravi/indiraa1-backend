import express from 'express';
import { authenticateUser } from '../middleware/auth.js';
import {
  createReturnRequest,
  getCustomerReturns,
  getReturnDetails,
  cancelReturnRequest,
  checkReturnEligibility,
  getReturnPolicies
} from '../controllers/returnController.js';

const router = express.Router();

// Customer Return Management Routes

// Create Return Request
router.post('/create', authenticateUser, createReturnRequest);

// Get Customer's Returns
router.get('/my-returns', authenticateUser, getCustomerReturns);

// Get Specific Return Details
router.get('/:returnId', authenticateUser, getReturnDetails);

// Cancel Return Request
router.post('/:returnId/cancel', authenticateUser, cancelReturnRequest);

// Return Eligibility and Policies

// Check Order Return Eligibility
router.get('/orders/:orderId/eligibility', authenticateUser, checkReturnEligibility);

// Get Return Policies
router.get('/policies/info', getReturnPolicies);

export default router;
