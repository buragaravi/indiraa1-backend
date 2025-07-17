import express from 'express';
import * as couponController from '../controllers/couponController.js';
import { authenticateAdminOrSubAdmin } from '../middleware/authUnified.js';

const router = express.Router();

// Admin/Sub-admin endpoints
router.post('/', authenticateAdminOrSubAdmin, couponController.createCoupon);
router.get('/', authenticateAdminOrSubAdmin, couponController.getAllCoupons);
router.put('/:id', authenticateAdminOrSubAdmin, couponController.updateCoupon);
router.delete('/:id', authenticateAdminOrSubAdmin, couponController.deleteCoupon);

// Public
router.post('/validate', couponController.validateCoupon);

export default router;
