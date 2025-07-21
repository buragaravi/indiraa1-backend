import express from 'express';
import { authenticateSubAdmin } from '../middleware/auth.js';
import {
  getAssignedReturns,
  getUnassignedReturns,
  reviewReturnRequest,
  updateReturnStatus,
  assignAgentForPickup,
  schedulePickup,
  markItemsReceived,
  completeQualityAssessment,
  submitRefundRecommendation,
  makeFinalRefundDecision,
  processRefund,
  getAssessmentHistory,
  getStatusHistory,
  bulkStatusUpdate
} from '../controllers/warehouseReturnController.js';

const router = express.Router();

// Warehouse Manager Return Management Routes (Primary Controller)

// Get Assigned Returns
router.get('/assigned', authenticateSubAdmin, getAssignedReturns);

// Get Unassigned Returns for Review
router.get('/unassigned', authenticateSubAdmin, getUnassignedReturns);

// Review Return Request (Approve/Reject)
router.put('/:returnId/review', authenticateSubAdmin, reviewReturnRequest);

// Update Return Status
router.put('/:returnId/status', authenticateSubAdmin, updateReturnStatus);

// Pickup Management

// Assign Delivery Agent for Pickup
router.post('/:returnId/assign-agent', authenticateSubAdmin, assignAgentForPickup);

// Schedule Pickup (With or Without Agent)
router.put('/:returnId/schedule-pickup', authenticateSubAdmin, schedulePickup);

// Mark Items Received at Warehouse
router.put('/:returnId/receive', authenticateSubAdmin, markItemsReceived);

// Quality Assessment

// Complete Quality Assessment
router.put('/:returnId/assess', authenticateSubAdmin, completeQualityAssessment);

// Submit Refund Recommendation
router.post('/:returnId/recommend-refund', authenticateSubAdmin, submitRefundRecommendation);

// Make Final Refund Decision
router.put('/:returnId/final-decision', authenticateSubAdmin, makeFinalRefundDecision);

// Process Refund
router.post('/:returnId/process-refund', authenticateSubAdmin, processRefund);

// History and Analytics

// Get Quality Assessment History
router.get('/assessment-history', authenticateSubAdmin, getAssessmentHistory);

// Get Status Update History
router.get('/:returnId/status-history', authenticateSubAdmin, getStatusHistory);

// Bulk Operations

// Bulk Status Update
router.post('/bulk-status-update', authenticateSubAdmin, bulkStatusUpdate);

export default router;
