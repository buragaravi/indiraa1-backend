import express from 'express';
import {
  getAllBatchGroups,
  getBatchGroupById,
  getBatchAnalytics,
  updateBatchGroup,
  getBatchUtilizationByProduct,
  // Legacy aliases
  getAllBatches,
  getBatchById
} from '../controllers/batchController.js';
import { authenticateAdminOrSubAdmin } from '../middleware/authUnified.js';

const router = express.Router();

// Batch Group Routes (New System)
router.get('/batch-groups', authenticateAdminOrSubAdmin, getAllBatchGroups);
router.get('/batch-groups/analytics', authenticateAdminOrSubAdmin, getBatchAnalytics);
router.get('/batch-groups/:id', authenticateAdminOrSubAdmin, getBatchGroupById);
router.put('/batch-groups/:id', authenticateAdminOrSubAdmin, updateBatchGroup);
router.get('/batch-groups/product/:productId/utilization', authenticateAdminOrSubAdmin, getBatchUtilizationByProduct);

// Legacy Routes (for backward compatibility)
router.get('/', authenticateAdminOrSubAdmin, getAllBatches);
router.get('/analytics', authenticateAdminOrSubAdmin, getBatchAnalytics);
router.get('/:id', authenticateAdminOrSubAdmin, getBatchById);

export default router;
