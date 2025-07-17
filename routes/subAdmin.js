import express from 'express';
import {
  createSubAdmin,
  loginSubAdmin,
  verifyEmail,
  getAllSubAdmins,
  updateSubAdmin,
  deleteSubAdmin,
  getSubAdminProfile,
  changePassword
} from '../controllers/subAdminController.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { authenticateSubAdmin } from '../middleware/authSubAdmin.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/login', loginSubAdmin);
router.get('/verify-email', verifyEmail);

// Sub admin protected routes (requires sub admin authentication)
router.get('/profile', authenticateSubAdmin, getSubAdminProfile);
router.put('/change-password', authenticateSubAdmin, changePassword);

// Admin only routes (requires main admin authentication)
router.post('/create', authenticateAdmin, createSubAdmin);
router.get('/all', authenticateAdmin, getAllSubAdmins);
router.put('/:id', authenticateAdmin, updateSubAdmin);
router.delete('/:id', authenticateAdmin, deleteSubAdmin);

// Dashboard routes (placeholder for role-based dashboards)
router.get('/warehouse-manager/dashboard', authenticateSubAdmin, (req, res) => {
  if (req.subAdmin.role !== 'warehouse_manager') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Warehouse Manager role required.'
    });
  }
  
  res.json({
    success: true,
    message: 'Welcome to Warehouse Manager Dashboard',
    dashboard: 'warehouse_manager',
    subAdmin: req.subAdmin,
    features: [
      'Product Management',
      'Inventory Control',
      'Stock Monitoring',
      'Bulk Upload',
      'Warehouse Analytics'
    ]
  });
});

router.get('/logistics-manager/dashboard', authenticateSubAdmin, (req, res) => {
  if (req.subAdmin.role !== 'logistics_manager') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Logistics Manager role required.'
    });
  }
  
  res.json({
    success: true,
    message: 'Welcome to Logistics Manager Dashboard',
    dashboard: 'logistics_manager',
    subAdmin: req.subAdmin,
    features: [
      'Order Management',
      'Delivery Tracking',
      'Agent Management',
      'Route Optimization',
      'Logistics Analytics'
    ]
  });
});

// Health check route
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Sub Admin service is running',
    timestamp: new Date().toISOString(),
    service: 'sub-admin-api'
  });
});

export default router;
