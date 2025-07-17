import express from 'express';
import {
  getAllBanners,
  getActiveBanners,
  getBannerById,
  createBanner,
  updateBanner,
  deleteBanner,
  toggleBannerStatus,
  reorderBanners,
  bulkDeleteBanners,
  bulkUpdateBannerStatus,
  trackBannerClick,
  getBannerAnalytics,
  upload
} from '../controllers/bannerController.js';
import { authenticateAdminOrSubAdmin } from '../middleware/authUnified.js';

const router = express.Router();

// Public routes (for displaying banners)
router.get('/active', getActiveBanners);
router.post('/:id/click', trackBannerClick);
router.get('/', getAllBanners);


// Protected admin/sub-admin routes
router.use(authenticateAdminOrSubAdmin);

// Banner CRUD operations

router.get('/analytics', getBannerAnalytics);
router.get('/:id', getBannerById);
router.post('/', upload.single('image'), createBanner);
router.put('/:id', upload.single('image'), updateBanner);
router.delete('/:id', deleteBanner);

// Banner status and ordering
router.patch('/:id/status', toggleBannerStatus);
router.patch('/reorder', reorderBanners);

// Bulk operations
router.delete('/bulk', bulkDeleteBanners);
router.patch('/bulk-status', bulkUpdateBannerStatus);

export default router;
