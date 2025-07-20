import express from 'express';
import multer from 'multer';
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

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Customer Return Management Routes

// Create Return Request
router.post('/create', authenticateUser, upload.array('evidenceImages', 5), createReturnRequest);

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
