import express from 'express';
import { authenticateAdminOrSubAdmin } from '../middleware/auth.js';
import {
  getAllReturns,
  getAdminReturnDetails,
  reviewReturnRequest,
  togglePickupCharge,
  getPendingApprovalReturns,
  makeFinalRefundDecision,
  processCoinRefund,
  bulkProcessRefunds
} from '../controllers/adminReturnController.js';

const router = express.Router();

// Admin Return Management Routes

// Get All Returns with Filters
router.get('/all', authenticateAdminOrSubAdmin, getAllReturns);

// Get Return Details for Admin
router.get('/:returnId/details', authenticateAdminOrSubAdmin, getAdminReturnDetails);

// Review Return Request (Approve/Reject)
router.put('/:returnId/review', authenticateAdminOrSubAdmin, reviewReturnRequest);

// Toggle Pickup Charge
router.put('/:returnId/pickup-charge', authenticateAdminOrSubAdmin, togglePickupCharge);

// Refund Processing Routes

// Get Returns Pending Final Approval
router.get('/pending-approval', authenticateAdminOrSubAdmin, getPendingApprovalReturns);

// Make Final Refund Decision
router.put('/:returnId/final-decision', authenticateAdminOrSubAdmin, makeFinalRefundDecision);

// Process Coin Refund
router.post('/:returnId/process-refund', authenticateAdminOrSubAdmin, processCoinRefund);

// Bulk Process Refunds
router.post('/bulk-process-refunds', authenticateAdminOrSubAdmin, bulkProcessRefunds);

export default router;
