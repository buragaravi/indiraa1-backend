import express from 'express';
import multer from 'multer';
import * as productController from '../controllers/productController.js';
import { 
  addOrderReview, 
  getAverageOrderRating, 
  getCategories, 
  getProductsByCategory 
} from '../controllers/productController.js';
import { authenticateUser } from '../middleware/auth.js';
import { authenticateAdminOrSubAdmin } from '../middleware/authUnified.js';

const router = express.Router();
const upload = multer();

// Product CRUD (admin/sub-admin)
router.post('/', authenticateAdminOrSubAdmin, upload.array('images', 5), productController.createProduct);
router.post('/bulk-upload', authenticateAdminOrSubAdmin, upload.array('images', 100), productController.bulkCreateProducts);
router.put('/:id', authenticateAdminOrSubAdmin, upload.array('images', 5), productController.updateProduct);
router.delete('/:id', authenticateAdminOrSubAdmin, productController.deleteProduct);
router.put('/:id/featured', authenticateAdminOrSubAdmin, productController.toggleProductFeatured);

// Product listing/detail (public)
router.get('/', productController.getAllProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/categories', getCategories);
router.get('/categories/:category', getProductsByCategory);
router.get('/:id', productController.getProductById);

// Reviews (user)
router.post('/:id/reviews', authenticateUser, productController.addOrUpdateReview);
router.get('/:id/reviews', productController.getReviews);

// Orders
router.post('/orders', authenticateUser, productController.createOrder);
router.get('/orders/user', authenticateUser, productController.getUserOrders);
router.get('/orders/user/:id', authenticateUser, productController.getUserOrderById); // User endpoint for their own order details
router.get('/orders/all', authenticateAdminOrSubAdmin, productController.getAllOrders); // Admin/sub-admin access
router.put('/orders/:id/status', authenticateAdminOrSubAdmin, productController.updateOrderStatus); // admin/sub-admin access
router.post('/orders/:id/cancel', authenticateUser, productController.cancelOrder);
router.get('/orders/:id', authenticateAdminOrSubAdmin, productController.getOrderById); // Admin/sub-admin endpoint for order details
// Mark order as paid (admin/sub-admin)
router.post('/orders/:id/mark-paid', authenticateAdminOrSubAdmin, productController.markOrderAsPaid);
// Order review and average rating endpoints
router.post('/orders/:id/review', authenticateUser, addOrderReview);
router.get('/orders/ratings/average', authenticateAdminOrSubAdmin, getAverageOrderRating);

// Wishlist
router.get('/wishlist/me', authenticateUser, productController.getWishlistByUserId);
router.post('/wishlist/add', authenticateUser, productController.addToWishlist);
router.post('/wishlist/remove', authenticateUser, productController.removeFromWishlist);
router.post('/wishlist/clear', authenticateUser, productController.clearWishlist);

// Cart
router.get('/cart/me', authenticateUser, productController.getCart);
router.post('/cart', authenticateUser, productController.addToCart); // Fixed: /cart instead of /cart/add to match frontend
router.post('/cart/remove', authenticateUser, productController.removeFromCart); // Fixed: POST instead of DELETE to match frontend
router.post('/cart/update', authenticateUser, productController.updateCartItem); // Fixed: POST instead of PUT to match frontend
router.post('/cart/clear', authenticateUser, productController.clearCart);

// Admin/Sub-admin: get all users
router.get('/users/all', authenticateAdminOrSubAdmin, productController.getAllUsers); // admin/sub-admin only
// Admin/Sub-admin: get all orders for a user
router.get('/orders/user/:userId', authenticateAdminOrSubAdmin, productController.getOrdersByUserId); // admin/sub-admin only

export default router;
