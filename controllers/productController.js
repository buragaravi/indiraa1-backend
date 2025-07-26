import dotenv from 'dotenv';
dotenv.config();

import AWS from 'aws-sdk';
import mongoose from 'mongoose';
import path from 'path';
import Admin from '../models/Admin.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import * as notifications from '../notifications.js';
import { 
  sendOrderPlacedEmail,
  sendOrderOtpEmail,
  sendOrderDeliveredEmail
} from '../utils/emailSender.js';
import { 
  sendOTPNotification,
  sendOrderConfirmationNotification,
  sendStatusUpdateNotification,
  testCommunicationServices as testComm
} from '../services/communicationService.js';
import { processOrderRewards } from '../middleware/rewardMiddleware.js';
import { 
  createDeliveryOTPData, 
  isOrderLocked, 
  getRecentFailedAttempts,
  isValidOTPFormat, 
  requiresOTPValidation,
  createFailedAttemptRecord,
  calculateLockoutExpiry,
  getRemainingLockoutTime
} from '../utils/otpUtils.js';
import batchStockUtils from '../utils/batchStockUtils.js';
import batchService from '../services/batchService.js';

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION
});
const BUCKET = process.env.AWS_S3_BUCKET;

// Default image URL for products without images
const DEFAULT_PRODUCT_IMAGE = 'https://bannu-bkt.s3.amazonaws.com/Mango%20Smoothie/1752648479371.png';

// Upload a single image buffer to S3
async function uploadImageToS3(buffer, originalName, productName) {
  const ext = path.extname(originalName);
  const key = `${productName}/${Date.now()}${ext}`;
  const params = {
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/' + ext.replace('.', ''),
    ACL: 'public-read'
  };
  const data = await s3.upload(params).promise();
  return data.Location;
}

// Helper to add id field to product(s)
function addIdField(product) {
  if (!product) return product;
  const obj = product.toObject ? product.toObject() : product;
  return { ...obj, id: obj._id?.toString?.() || obj._id };
}

// Variant helper functions
function getDisplayPrice(product) {
  if (!product.hasVariants || !product.variants || product.variants.length === 0) {
    return product.price;
  }
  
  // Return the cheapest variant price
  const prices = product.variants.map(v => v.price);
  return Math.min(...prices);
}

function getVariantById(product, variantId) {
  if (!product.hasVariants || !product.variants || !variantId) {
    return null;
  }
  return product.variants.find(v => v.id === variantId);
}

function getDefaultVariant(product) {
  if (!product.hasVariants || !product.variants || product.variants.length === 0) {
    return null;
  }
  
  // Find default variant or return cheapest one
  const defaultVariant = product.variants.find(v => v.isDefault);
  if (defaultVariant) return defaultVariant;
  
  // Return cheapest variant as default
  return product.variants.reduce((cheapest, current) => 
    current.price < cheapest.price ? current : cheapest
  );
}

function calculateVariantStock(product, variantId) {
  if (!product.hasVariants) {
    return product.stock;
  }
  
  const variant = getVariantById(product, variantId);
  return variant ? variant.stock : 0;
}

function getVariantPrice(product, variantId) {
  if (!product.hasVariants) {
    return product.price;
  }
  
  const variant = getVariantById(product, variantId);
  return variant ? variant.price : product.price;
}

// Create product
export const createProduct = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      price, 
      category, 
      stock, 
      hasVariants, 
      variants,
      // Batch related fields (always processed now)
      batchData
    } = req.body;
    
    // Validate required fields
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Product name is required.' });
    }
    
    if (!description || description.trim().length === 0) {
      return res.status(400).json({ message: 'Product description is required.' });
    }
    
    if (!price || parseFloat(price) <= 0) {
      return res.status(400).json({ message: 'Valid price is required.' });
    }
    
    if (!category || category.trim().length === 0) {
      return res.status(400).json({ message: 'Product category is required.' });
    }
    
    if (stock === undefined || parseInt(stock) < 0) {
      return res.status(400).json({ message: 'Valid stock quantity is required.' });
    }
    
    // Handle images with robust error handling and default fallback
    let images = [];
    
    if (req.files && req.files.length > 0) {
      console.log(`[CREATE PRODUCT] Processing ${req.files.length} image uploads for product ${name}`);
      
      try {
        for (const file of req.files) {
          // Validate file before upload
          if (!file.buffer || !file.originalname) {
            console.warn('[CREATE PRODUCT] Skipping invalid file:', file);
            continue;
          }
          
          const url = await uploadImageToS3(file.buffer, file.originalname, name);
          if (url) {
            images.push(url);
            console.log('[CREATE PRODUCT] Successfully uploaded image:', url);
          }
        }
      } catch (uploadError) {
        console.error('[CREATE PRODUCT] Image upload error:', uploadError);
        return res.status(500).json({ 
          message: 'Failed to upload images. Please try again.',
          error: uploadError.message 
        });
      }
    }
    
    // Use default image if no images were uploaded
    if (images.length === 0) {
      images.push(DEFAULT_PRODUCT_IMAGE);
      console.log(`[CREATE PRODUCT] No images uploaded for ${name}, using default image: ${DEFAULT_PRODUCT_IMAGE}`);
    }
    
    // Parse variants if they exist with robust error handling
    let parsedVariants = [];
    if (hasVariants === 'true' && variants) {
      try {
        parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
        
        // Validate that parsedVariants is an array
        if (!Array.isArray(parsedVariants)) {
          console.error('[CREATE PRODUCT] Variants is not an array:', typeof parsedVariants);
          return res.status(400).json({ message: 'Invalid variants data format. Expected array.' });
        }
        
        // Generate unique IDs for variants and validate data
        parsedVariants = parsedVariants.map((variant, index) => {
          try {
            if (!variant.name || !variant.price) {
              throw new Error(`Variant ${index + 1} missing required fields (name, price)`);
            }
            
            return {
              ...variant,
              id: variant.id || new Date().getTime().toString() + Math.random().toString(36).substr(2, 9),
              price: parseFloat(variant.price),
              stock: parseInt(variant.stock) || 0,
              name: variant.name.trim(),
              label: variant.label || variant.name.trim()
            };
          } catch (variantError) {
            console.error('[CREATE PRODUCT] Error processing variant:', variant, variantError);
            throw new Error(`Invalid variant data at position ${index + 1}: ${variantError.message}`);
          }
        });
        
        console.log(`[CREATE PRODUCT] Successfully parsed ${parsedVariants.length} variants`);
        
      } catch (variantParseError) {
        console.error('[CREATE PRODUCT] Variant parsing error:', variantParseError);
        return res.status(400).json({ 
          message: 'Invalid variants data format. Please check your variant data.',
          error: variantParseError.message 
        });
      }
    }
    
    const productData = {
      name: name.trim(),
      description: description.trim(),
      price: parseFloat(price),
      category: category.trim(),
      stock: parseInt(stock),
      images,
      hasVariants: hasVariants === 'true',
      variants: parsedVariants
    };
    
    console.log(`[CREATE PRODUCT] Creating product with data:`, {
      name: productData.name,
      price: productData.price,
      stock: productData.stock,
      hasVariants: productData.hasVariants,
      variantCount: productData.variants.length,
      images: images,
      imageCount: productData.images
    });
    
    const product = new Product(productData);
    await product.save();
    
    console.log(`[CREATE PRODUCT] Successfully created product ${product._id}`);
    
    // Create batch group entry for this product using new system
    try {
      let parsedBatchData = {};
      
      // Parse batch data if provided, otherwise use defaults
      if (batchData) {
        parsedBatchData = typeof batchData === 'string' ? JSON.parse(batchData) : batchData;
      }
      
      // Set default dates if not provided
      const defaultManufacturingDate = parsedBatchData.manufacturingDate || new Date();
      const defaultSupplierInfo = {
        supplierName: parsedBatchData.supplierName || 'Indiraa Foods Pvt Ltd',
        purchaseOrderNumber: parsedBatchData.purchaseOrderNumber || '',
        receivedDate: parsedBatchData.receivedDate || new Date(),
        contactInfo: parsedBatchData.contactInfo || 'info@indiraafoods.com'
      };
      
      const batchGroupService = await import('../services/batchGroupService.js');
      
      const productForBatching = {
        productId: product._id,
        hasVariants: product.hasVariants,
        variants: product.variants,
        stock: product.stock,
        manufacturingDate: parsedBatchData.manufacturingDate,
        expiryDate: parsedBatchData.expiryDate,
        bestBeforeDate: parsedBatchData.bestBeforeDate,
        supplierInfo: defaultSupplierInfo,
        location: parsedBatchData.location || 'Main Warehouse'
      };
      
      const batchResult = await batchGroupService.addProductToBatch(
        productForBatching,
        req.user.id || req.user._id
      );
      
      console.log(`[CREATE PRODUCT] ${batchResult.action === 'ADDED_TO_EXISTING' ? 'Added to existing' : 'Created new'} batch group: ${batchResult.batchGroup.batchGroupNumber}`);
      
    } catch (batchError) {
      console.error('[CREATE PRODUCT] Error creating batch group:', batchError);
      // Don't fail product creation if batch creation fails
    }
    
    res.status(201).json({ 
      success: true,
      product: addIdField(product),
      message: `Product created successfully and added to batch group`
    });
  } catch (error) {
    console.error('[CREATE PRODUCT] Unexpected error:', error);
    res.status(500).json({ 
      message: 'Failed to create product. Please try again.',
      error: error.message 
    });
  }
};

// Get all products
export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json({ products: products.map(addIdField) });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to fetch products.' });
  }
};

// Get featured products
export const getFeaturedProducts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const products = await Product.find({ featured: true })
      .sort({ createdAt: -1, viewCount: -1, purchaseCount: -1 })
      .limit(limit);
    
    res.json({ 
      success: true, 
      products: products.map(addIdField),
      total: products.length 
    });
  } catch (error) {
    console.error('[GET FEATURED PRODUCTS]', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch featured products.' 
    });
  }
};

// Get product by id
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('reviews.userId', 'name email');
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    
    // Increment view count
    await Product.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
    
    // Ensure user names are available in reviews
    const productObj = product.toObject();
    productObj.reviews = productObj.reviews.map(review => ({
      ...review,
      user: review.user || review.userId?.name || review.userId?.email || 'Anonymous'
    }));
    
    res.json({ product: addIdField(productObj) });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Failed to fetch product.' });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock, hasVariants, variants } = req.body;
    let product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    
    // Handle images with robust error handling and default fallback
    let images = product.images || []; // Ensure images is always an array
    
    if (req.files && req.files.length > 0) {
      console.log(`[UPDATE PRODUCT] Processing ${req.files.length} image uploads for product ${product.name}`);
      
      try {
        for (const file of req.files) {
          // Validate file before upload
          if (!file.buffer || !file.originalname) {
            console.warn('[UPDATE PRODUCT] Skipping invalid file:', file);
            continue;
          }
          
          const url = await uploadImageToS3(file.buffer, file.originalname, name || product.name);
          if (url) {
            images.push(url);
            console.log('[UPDATE PRODUCT] Successfully uploaded image:', url);
          }
        }
      } catch (uploadError) {
        console.error('[UPDATE PRODUCT] Image upload error:', uploadError);
        return res.status(500).json({ 
          message: 'Failed to upload images. Please try again.',
          error: uploadError.message 
        });
      }
    }
    
    // Ensure product always has at least one image (use default if empty)
    if (images.length === 0) {
      images.push(DEFAULT_PRODUCT_IMAGE);
      console.log(`[UPDATE PRODUCT] No images available for ${product.name}, using default image: ${DEFAULT_PRODUCT_IMAGE}`);
    }
    
    // Parse variants if they exist with robust error handling
    let parsedVariants = product.variants || [];
    if (hasVariants === 'true' && variants) {
      try {
        parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
        
        // Validate that parsedVariants is an array
        if (!Array.isArray(parsedVariants)) {
          console.error('[UPDATE PRODUCT] Variants is not an array:', typeof parsedVariants);
          return res.status(400).json({ message: 'Invalid variants data format. Expected array.' });
        }
        
        // Ensure variants have proper data types and IDs
        parsedVariants = parsedVariants.map((variant, index) => {
          try {
            return {
              ...variant,
              id: variant.id || new Date().getTime().toString() + Math.random().toString(36).substr(2, 9),
              price: parseFloat(variant.price) || 0,
              stock: parseInt(variant.stock) || 0,
              name: variant.name || `Variant ${index + 1}`,
              label: variant.label || variant.name || `Variant ${index + 1}`
            };
          } catch (variantError) {
            console.error('[UPDATE PRODUCT] Error processing variant:', variant, variantError);
            throw new Error(`Invalid variant data at position ${index}`);
          }
        });
        
        console.log(`[UPDATE PRODUCT] Successfully parsed ${parsedVariants.length} variants`);
        
      } catch (variantParseError) {
        console.error('[UPDATE PRODUCT] Variant parsing error:', variantParseError);
        return res.status(400).json({ 
          message: 'Invalid variants data format. Please check your variant data.',
          error: variantParseError.message 
        });
      }
    } else if (hasVariants === 'false') {
      parsedVariants = [];
      console.log('[UPDATE PRODUCT] Variants disabled, clearing existing variants');
    }
    
    // Validate required fields with safe defaults
    const updateData = {
      name: name || product.name,
      description: description || product.description,
      price: parseFloat(price) || product.price || 0,
      category: category || product.category,
      stock: parseInt(stock) || product.stock || 0,
      images: images,
      hasVariants: hasVariants === 'true',
      variants: parsedVariants
    };
    
    // Additional validation
    if (updateData.price < 0) {
      return res.status(400).json({ message: 'Price cannot be negative.' });
    }
    
    if (updateData.stock < 0) {
      return res.status(400).json({ message: 'Stock cannot be negative.' });
    }
    
    if (!updateData.name || updateData.name.trim().length === 0) {
      return res.status(400).json({ message: 'Product name is required.' });
    }
    
    console.log(`[UPDATE PRODUCT] Updating product ${product._id} with data:`, {
      name: updateData.name,
      price: updateData.price,
      stock: updateData.stock,
      hasVariants: updateData.hasVariants,
      variantCount: updateData.variants.length,
      imageCount: updateData.images.length
    });
    
    product.set(updateData);
    await product.save();
    
    console.log(`[UPDATE PRODUCT] Successfully updated product ${product._id}`);
    res.json({ 
      success: true,
      product: addIdField(product),
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('[UPDATE PRODUCT] Unexpected error:', error);
    res.status(500).json({ 
      message: 'Failed to update product. Please try again.',
      error: error.message 
    });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    console.log(`[DELETE PRODUCT] Attempting to delete product: ${productId}`);

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      console.log(`[DELETE PRODUCT] Product not found: ${productId}`);
      return res.status(404).json({ message: 'Product not found.' });
    }

    console.log(`[DELETE PRODUCT] Found product: ${product.name}`);

    // Delete from old Batch model (legacy cleanup)
    try {
      const Batch = (await import('../models/Batch.js')).default;
      const deletedBatches = await Batch.deleteMany({ productId: productId });
      console.log(`[DELETE PRODUCT] Deleted ${deletedBatches.deletedCount} legacy batches`);
    } catch (batchError) {
      console.log(`[DELETE PRODUCT] Warning: Could not delete legacy batches - ${batchError.message}`);
    }

    // Remove product from BatchGroups (new system)
    try {
      const BatchGroup = (await import('../models/BatchGroup.js')).default;
      
      // Find all batch groups containing this product
      const batchGroups = await BatchGroup.find({ 'products.productId': productId });
      
      for (const batchGroup of batchGroups) {
        // Remove the product from the batch group
        batchGroup.products = batchGroup.products.filter(
          p => p.productId.toString() !== productId.toString()
        );
        
        // If batch group has no products left, delete it
        if (batchGroup.products.length === 0) {
          await BatchGroup.findByIdAndDelete(batchGroup._id);
          console.log(`[DELETE PRODUCT] Deleted empty batch group: ${batchGroup.batchGroupNumber}`);
        } else {
          // Save the updated batch group
          await batchGroup.save();
          console.log(`[DELETE PRODUCT] Removed product from batch group: ${batchGroup.batchGroupNumber}`);
        }
      }
      
      console.log(`[DELETE PRODUCT] Processed ${batchGroups.length} batch groups`);
    } catch (batchGroupError) {
      console.log(`[DELETE PRODUCT] Warning: Could not update batch groups - ${batchGroupError.message}`);
    }

    // Remove product from user wishlists
    try {
      const User = (await import('../models/User.js')).default;
      const updatedUsers = await User.updateMany(
        { wishlist: productId },
        { $pull: { wishlist: productId } }
      );
      console.log(`[DELETE PRODUCT] Removed from ${updatedUsers.modifiedCount} user wishlists`);
    } catch (wishlistError) {
      console.log(`[DELETE PRODUCT] Warning: Could not update wishlists - ${wishlistError.message}`);
    }

    // Remove product from user carts
    try {
      const User = (await import('../models/User.js')).default;
      const updatedCarts = await User.updateMany(
        { 'cart.product': productId },
        { $pull: { cart: { product: productId } } }
      );
      console.log(`[DELETE PRODUCT] Removed from ${updatedCarts.modifiedCount} user carts`);
    } catch (cartError) {
      console.log(`[DELETE PRODUCT] Warning: Could not update carts - ${cartError.message}`);
    }

    // Delete the product
    const deletedProduct = await Product.findByIdAndDelete(productId);
    if (!deletedProduct) {
      console.log(`[DELETE PRODUCT] Failed to delete product: ${productId}`);
      return res.status(500).json({ message: 'Failed to delete product from database.' });
    }

    console.log(`[DELETE PRODUCT] Successfully deleted product: ${product.name} (${productId})`);
    res.json({ 
      message: 'Product deleted successfully.',
      productName: product.name,
      deletedBatches: true
    });
  } catch (error) {
    console.error(`[DELETE PRODUCT] Error deleting product:`, error);
    res.status(500).json({ 
      message: 'Failed to delete product.',
      error: error.message 
    });
  }
};

// Add or update review
export const addOrUpdateReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    
    // Validation
    if (!rating || !comment) {
      return res.status(400).json({ message: 'Rating and comment are required.' });
    }
    
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }
    
    if (comment.trim().length < 10) {
      return res.status(400).json({ message: 'Comment must be at least 10 characters long.' });
    }
    
    const userId = req.user.id;
    
    // Get user information
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    
    // Remove existing review by this user
    product.reviews = product.reviews.filter(r => r.userId.toString() !== userId);
    
    // Add new review
    const newReview = {
      userId,
      user: user.name || user.email, // Include user name
      rating: Number(rating),
      comment: comment.trim(),
      date: new Date(),
      createdAt: new Date()
    };
    
    product.reviews.push(newReview);
    await product.save();
    
    // Populate the reviews with user information
    await product.populate('reviews.userId', 'name email');
    
    res.json({ 
      message: 'Review added successfully',
      review: newReview,
      reviews: product.reviews 
    });
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ message: 'Failed to add review.' });
  }
};

// Get reviews
export const getReviews = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    res.json({ reviews: product.reviews });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to fetch reviews.' });
  }
};

// Create order
export const createOrder = async (req, res) => {
  try {
    console.log('=== CREATE ORDER STARTED ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { 
      items, 
      shipping, 
      subtotal,
      totalAmount, 
      paymentMethod, 
      coupon, 
      coinDiscount, // New: coin redemption data
      upiTransactionId, 
      paymentStatus 
    } = req.body;
    
    console.log('[CREATE ORDER] Received coin discount data:', coinDiscount);
    console.log('[CREATE ORDER] Items to process:', items.length);
    
    const userId = req.user.id;
    console.log('[CREATE ORDER] User ID:', userId);
      // Validate required fields
    if (!items || !items.length) {
      return res.status(400).json({ message: 'Items are required' });
    }
    if (!shipping) {
      return res.status(400).json({ message: 'Shipping address is required' });
    }
    if (!totalAmount) {
      return res.status(400).json({ message: 'Total amount is required' });
    }    // Validate stock availability and prepare stock updates with batch allocation
    const stockUpdates = [];
    const batchOrderItems = []; // Items for batch allocation
    
    for (const item of items) {
      if (item.type === 'combo') {
        // Handle combo pack stock validation
        const ComboPack = (await import('../models/ComboPack.js')).default;
        const comboPack = await ComboPack.findById(item.id);
        if (!comboPack) {
          return res.status(400).json({ message: `Combo pack ${item.name} not found` });
        }

        // Check combo pack stock
        const availableStock = await comboPack.calculateAvailableStock();
        if (availableStock < item.qty) {
          return res.status(400).json({ 
            message: `Insufficient stock for combo pack ${item.name}. Available: ${availableStock}, Required: ${item.qty}` 
          });
        }

        // Track combo pack stock update
        stockUpdates.push({
          id: item.id,
          quantity: item.qty,
          type: 'combo',
          comboPack: comboPack
        });

        // Also prepare individual product batch allocations within the combo
        for (const comboProduct of comboPack.products) {
          const product = await Product.findById(comboProduct.productId);
          if (product) {
            batchOrderItems.push({
              productId: comboProduct.productId,
              variantId: comboProduct.variantId || null,
              quantity: comboProduct.quantity * item.qty, // Multiply by combo quantity
              type: 'combo-item',
              parentComboId: item.id
            });
          }
        }

      } else {
        // Handle regular product stock validation with batch checking
        const product = await Product.findById(item.id);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.name} not found` });
        }

        if (item.hasVariant && item.variantId) {
          // Check batch availability for variant
          console.log(`[CREATE ORDER] Checking variant stock for product ${item.id}, variant ${item.variantId}, quantity ${item.qty}`);
          const stockCheck = await batchStockUtils.checkStockAvailability(
            item.id, 
            item.variantId, 
            item.qty
          );
          
          console.log(`[CREATE ORDER] Variant stock check result:`, stockCheck);
          
          if (!stockCheck.available) {
            console.log(`[CREATE ORDER] Insufficient variant stock - Available: ${stockCheck.availableQuantity}, Required: ${item.qty}`);
            return res.status(400).json({ 
              message: `Insufficient batch stock for ${item.name} - ${item.variantName}. Available: ${stockCheck.availableQuantity}, Required: ${item.qty}` 
            });
          }
          
          batchOrderItems.push({
            productId: item.id,
            variantId: item.variantId,
            quantity: item.qty,
            type: 'variant'
          });
        } else {
          // Check batch availability for main product
          console.log(`[CREATE ORDER] Checking product stock for product ${item.id}, quantity ${item.qty}`);
          const stockCheck = await batchStockUtils.checkStockAvailability(
            item.id, 
            null, 
            item.qty
          );
          
          console.log(`[CREATE ORDER] Product stock check result:`, stockCheck);
          
          if (!stockCheck.available) {
            console.log(`[CREATE ORDER] Insufficient product stock - Available: ${stockCheck.availableQuantity}, Required: ${item.qty}`);
            return res.status(400).json({ 
              message: `Insufficient batch stock for ${item.name}. Available: ${stockCheck.availableQuantity}, Required: ${item.qty}` 
            });
          }
          
          batchOrderItems.push({
            productId: item.id,
            variantId: null,
            quantity: item.qty,
            type: 'product'
          });
        }
      }
    }

    let couponObjId = null;
    if (coupon) {
      couponObjId = coupon; // expects ObjectId from frontend
    }

    // Set payment status based on method and provided status
    let orderPaymentStatus = 'Pending';
    if (paymentMethod === 'UPI' && paymentStatus === 'paid') {
      orderPaymentStatus = 'UnderReview'; // UPI payments need admin verification
    } else if (paymentMethod === 'COD') {
      orderPaymentStatus = 'Pending';
    }    // Handle coin redemption if provided
    let coinRedemptionTransaction = null;
    if (coinDiscount && coinDiscount.coinsUsed > 0) {
      console.log('[CREATE ORDER] Processing coin redemption:', coinDiscount);
      
      try {
        // Import the redeem coins function
        const { redeemCoinsForOrder } = await import('./walletController.js');
        
        // Create a temporary order ID for the redemption
        const tempOrderId = new mongoose.Types.ObjectId();
        
        // Process the coin redemption
        const redemptionResult = await redeemCoinsForOrder(
          userId, 
          subtotal || totalAmount, 
          coinDiscount.coinsUsed, 
          tempOrderId
        );
        
        if (!redemptionResult.success) {
          return res.status(400).json({
            success: false,
            message: `Coin redemption failed: ${redemptionResult.message}`
          });
        }
        
        coinRedemptionTransaction = redemptionResult.transactionId;
        console.log('[CREATE ORDER] Coin redemption successful, transaction:', coinRedemptionTransaction);
        
      } catch (redemptionError) {
        console.error('[CREATE ORDER] Coin redemption error:', redemptionError);
        return res.status(500).json({
          success: false,
          message: 'Failed to process coin redemption'
        });
      }
    }

    // Calculate discount breakdown
    const calculatedSubtotal = subtotal || totalAmount;
    const couponDiscountAmount = 0; // Will be calculated if coupon exists
    const coinDiscountAmount = coinDiscount ? coinDiscount.discountAmount || 0 : 0;
    const shippingFee = calculatedSubtotal >= 500 ? 0 : 100; // Free shipping over ₹500

    // Create order with proper breakdown
    const order = new Order({
      userId,
      items,
      shipping,
      subtotal: calculatedSubtotal,
      couponDiscount: couponDiscountAmount,
      coinDiscount: {
        amount: coinDiscountAmount,
        coinsUsed: coinDiscount ? coinDiscount.coinsUsed || 0 : 0,
        transactionId: coinRedemptionTransaction
      },
      shippingFee: shippingFee,
      totalAmount,
      paymentMethod: paymentMethod.toUpperCase(),
      paymentStatus: orderPaymentStatus,
      coupon: couponObjId,
      upiTransactionId: upiTransactionId || null,
      deliveryOtp: createDeliveryOTPData()
    });
    
    await order.save();
    
    // Update the coin redemption transaction with the actual order ID
    if (coinRedemptionTransaction) {
      try {
        const Transaction = (await import('../models/Transaction.js')).default;
        await Transaction.findByIdAndUpdate(coinRedemptionTransaction, {
          orderId: order._id,
          $set: {
            'metadata.orderId': order._id.toString(),
            'metadata.orderNumber': order._id.toString().slice(-8).toUpperCase()
          }
        });
        console.log('[CREATE ORDER] Updated transaction with order ID:', order._id);
      } catch (updateError) {
        console.error('[CREATE ORDER] Failed to update transaction with order ID:', updateError);
      }
    }    // Allocate batches using FEFO after successful order creation
    let batchAllocationResult = null;
    if (batchOrderItems.length > 0) {
      try {
        batchAllocationResult = await batchStockUtils.allocateStockForOrder(batchOrderItems, order._id);
        
        if (!batchAllocationResult.success) {
          // If batch allocation fails, we need to handle it carefully
          console.error('[CREATE ORDER] Batch allocation failed:', batchAllocationResult.errors);
          
          // Optionally, you could still allow the order but mark it as needing manual review
          // For now, we'll fail the order creation
          await Order.findByIdAndDelete(order._id);
          
          return res.status(400).json({
            success: false,
            message: 'Failed to allocate stock from batches',
            errors: batchAllocationResult.errors
          });
        }
        
        console.log(`[CREATE ORDER] Successfully allocated batches for order ${order._id}`);
      } catch (allocationError) {
        console.error('[CREATE ORDER] Batch allocation error:', allocationError);
        
        // Delete the order if batch allocation fails
        await Order.findByIdAndDelete(order._id);
        
        return res.status(500).json({
          success: false,
          message: 'Failed to allocate stock from batches',
          error: allocationError.message
        });
      }
    }

    // Reduce combo pack stock for combo items (non-batch tracked items)
    for (const update of stockUpdates) {
      if (update.type === 'combo') {
        // Reduce combo pack stock
        const ComboPack = (await import('../models/ComboPack.js')).default;
        await ComboPack.updateOne(
          { _id: update.id },
          { 
            $inc: { 
              stock: -update.quantity,
              purchaseCount: update.quantity // Track purchase count for analytics
            } 
          }
        );
      }
    }// Notify all admins of new order
    try {
      const admins = await Admin.find({ pushToken: { $exists: true, $ne: null } });
      const user = await User.findById(userId);
      if (admins.length > 0 && user) {
        await notifications.notifyAdminsNewOrder(admins, order._id, user.name);
      } else {
        console.log('[ORDER] No push notifications sent - missing admins or user');
      }

      // Send order placed email using your Brevo service
      if (user && user.email) {
        try {
          await sendOrderPlacedEmail(user.email, user.name, order);
          console.log(`[EMAIL] Order placed email sent to ${user.email} for order ${order._id}`);
        } catch (emailError) {
          console.error('[EMAIL] Order placed email error:', emailError);
          // Don't fail order creation if email fails
        }
      }

      // Send order confirmation via other channels (SMS, WhatsApp)
      if (user && user.phone) {
        try {
          const confirmationResult = await sendOrderConfirmationNotification(user, order, ['sms', 'whatsapp']);
          console.log(`[ORDER] SMS/WhatsApp confirmation sent for order ${order._id}:`, confirmationResult.summary);
        } catch (confirmError) {
          console.error('[ORDER] SMS/WhatsApp confirmation error:', confirmError);
          // Don't fail order creation if confirmation fails
        }
      }
    } catch (notifError) {
      console.error('[ORDER] Notification error:', notifError);
      // Don't fail order creation if notifications fail
    }

    res.status(201).json({ order });
  } catch (error) {
    console.error('[CREATE ORDER] Error:', error);
    res.status(500).json({ message: 'Failed to create order.', error: error.message });
  }
};

// Get orders for user
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await Order.find({ userId }).sort({ placedAt: -1 });
    res.json({ orders });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to fetch orders.' });
  }
};

// Get all orders (admin)
export const getAllOrders = async (req, res) => {
  try {
    // Only log user if present (route is public for now)
    if (req.user && req.user.adminId) {
      console.log('Fetching all orders for admin:');
    } else {
      console.log('Fetching all orders (no user attached to request)');
    }
    
    // Build query based on query parameters for drill-down functionality
    let query = {};
    const { status, payment, paymentStatus, limit, page } = req.query;
    
    // Filter by status if provided
    if (status) {
      query.status = status.toLowerCase();
    }
    
    // Filter by payment method if provided
    if (payment) {
      const paymentMethodUpper = payment.toUpperCase();
      if (paymentMethodUpper === 'UPI') {
        // For UPI, match UPI or ONLINE
        query.paymentMethod = { $in: ['UPI', 'ONLINE'] };
      } else if (paymentMethodUpper === 'CASH' || paymentMethodUpper === 'COD') {
        // For CASH/COD, match anything that's not UPI or ONLINE
        query.paymentMethod = { $nin: ['UPI', 'ONLINE'] };
      } else {
        query.paymentMethod = paymentMethodUpper;
      }
    }
    
    // Filter by payment status if provided
    if (paymentStatus) {
      query.paymentStatus = paymentStatus.toUpperCase();
    }
    
    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50; // Default limit
    const skip = (pageNum - 1) * limitNum;
    
    console.log('Orders query filter:', query);
    
    // Get orders with filters and pagination
    const orders = await Order.find(query)
      .sort({ placedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('userId', 'name email phone')
      .lean();
    
    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);
    
    // Add id field for frontend compatibility
    console.log('Orders fetched:', orders.length, 'of', totalOrders, 'total');
    
    res.json({ 
      orders: orders.map(order => ({ ...order, id: order._id })),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalOrders / limitNum),
        totalOrders,
        limit: limitNum
      }
    });
  } catch (_err) {
    console.error('[GET ALL ORDERS]', _err);
    res.status(500).json({ message: 'Failed to fetch orders.' });
  }
};

// Update order status (admin)
export const updateOrderStatus = async (req, res) => {
  try {
    const { status, deliveryOtp } = req.body;
    const order = await Order.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    // Check if OTP validation is required for this status update
    if (requiresOTPValidation(order.status, status)) {
      // Validate OTP when updating to "Delivered"
      if (!deliveryOtp) {
        return res.status(400).json({ 
          message: 'Delivery verification code is required to mark order as delivered.',
          requiresOtp: true
        });
      }

      // Validate OTP format
      if (!isValidOTPFormat(deliveryOtp)) {
        return res.status(400).json({ 
          message: 'Invalid verification code format. Please enter a 6-digit code.',
          requiresOtp: true
        });
      }

      // Check if order is locked out
      if (isOrderLocked(order)) {
        const remainingTime = getRemainingLockoutTime(order.deliveryOtp.lockoutUntil);
        return res.status(429).json({ 
          message: `Too many failed attempts. Please try again in ${remainingTime} minutes.`,
          requiresOtp: true,
          lockoutMinutes: remainingTime
        });
      }

      // Check if OTP has already been used
      if (order.deliveryOtp.isUsed) {
        return res.status(400).json({ 
          message: 'This delivery verification code has already been used.',
          requiresOtp: true
        });
      }

      // Validate the OTP
      if (order.deliveryOtp.code !== deliveryOtp) {
        // Record failed attempt
        const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
        const failedAttempt = createFailedAttemptRecord(deliveryOtp, clientIP);
        order.deliveryOtp.failedAttempts.push(failedAttempt);

        // Check if should lock out (3 failed attempts in 10 minutes)
        const recentFailures = getRecentFailedAttempts(order);
        if (recentFailures >= 3) {
          order.deliveryOtp.lockoutUntil = calculateLockoutExpiry();
          await order.save();
          
          return res.status(429).json({ 
            message: 'Too many failed attempts. Account locked for 30 minutes.',
            requiresOtp: true,
            lockoutMinutes: 30
          });
        }

        await order.save();
        
        return res.status(400).json({ 
          message: `Invalid verification code. ${3 - recentFailures} attempts remaining.`,
          requiresOtp: true,
          attemptsRemaining: 3 - recentFailures
        });
      }

      // OTP is valid - mark as used and add delivered timestamp
      order.deliveryOtp.isUsed = true;
      order.deliveredAt = new Date();
    }    // Update order status
    order.status = status;

    // If admin marks UPI order as paid, also update paymentStatus
    if (order.paymentMethod === 'UPI' && status === 'Paid') {
      order.paymentStatus = 'Paid';
    }

    await order.save();

    // Handle batch group allocation updates when order is delivered
    if (status === 'Delivered') {
      try {
        console.log(`[ORDER STATUS] Order ${order._id} marked as delivered, updating batch allocations`);
        
        // Import batch group service
        const batchGroupService = await import('../services/batchGroupService.js');
        
        // Move allocated items to used items in batch groups
        const batchUpdateResult = await batchGroupService.moveAllocatedToUsed(order._id);
        
        if (batchUpdateResult.success) {
          console.log(`[ORDER STATUS] Successfully updated batch allocations for order ${order._id}:`, batchUpdateResult);
        } else {
          console.error(`[ORDER STATUS] Failed to update batch allocations for order ${order._id}:`, batchUpdateResult.errors);
        }
      } catch (batchError) {
        console.error('[ORDER STATUS] Error updating batch allocations:', batchError);
        // Don't fail order status update if batch update fails
      }
    }

    // Get user for notifications
    const user = await User.findById(order.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found for order notifications.' });
    }    // Handle special status-based notifications
    try {
      // Send OTP when order is shipped - using your Brevo email service
      if (status === 'Shipped' && order.deliveryOtp && order.deliveryOtp.code) {
        // Send OTP via your Brevo email service
        if (user.email) {
          try {
            await sendOrderOtpEmail(user.email, user.name, order.deliveryOtp.code, order._id.toString());
            console.log(`[EMAIL] OTP email sent to ${user.email} for shipped order ${order._id}`);
          } catch (otpEmailError) {
            console.error('[EMAIL] OTP email error:', otpEmailError);
          }
        }

        // Send OTP via SMS and WhatsApp as backup
        if (user.phone) {
          try {
            const otpResult = await sendOTPNotification(
              user, 
              order.deliveryOtp.code, 
              order._id.toString(),
              ['sms', 'whatsapp'] // Only SMS and WhatsApp, email handled above
            );
            console.log(`[ORDER] OTP sent via SMS/WhatsApp for shipped order ${order._id}:`, otpResult.summary);
          } catch (otpError) {
            console.error('[ORDER] SMS/WhatsApp OTP notification error:', otpError);
          }
        }
      }

      // Send delivery confirmation email when order is delivered
      if (status === 'Delivered' && user.email) {
        try {
          await sendOrderDeliveredEmail(user.email, user.name, order._id.toString());
          console.log(`[EMAIL] Delivery confirmation email sent to ${user.email} for order ${order._id}`);
        } catch (deliveryEmailError) {
          console.error('[EMAIL] Delivery confirmation email error:', deliveryEmailError);
        }
      }

      // Send status update via SMS and WhatsApp for other status changes
      if (user.phone && status !== 'Shipped') // Skip shipped since we handle it above
      {
        try {
          const statusResult = await sendStatusUpdateNotification(user, order._id.toString(), status, ['sms', 'whatsapp']);
          console.log(`[ORDER] Status update sent for ${order._id}:`, statusResult.summary);
        } catch (statusError) {
          console.error('[ORDER] Status update notification error:', statusError);
          // Don't fail status update if notifications fail
        }
      }

      // Legacy push notification (keep for compatibility)
      await notifications.notifyOrderStatus(user, order._id, status);

      // Special handling for UPI payment confirmation
      if (order.paymentMethod === 'UPI' && status === 'Paid') {
        await notifications.sendPushNotification(
          user.pushToken,
          'Payment Received',
          `Your UPI payment for order #${order._id} has been verified and marked as paid.`,
          { orderId: order._id, status: 'Paid' }
        );
      }
    } catch (notificationError) {
      console.error('[ORDER] Notification error:', notificationError);
      // Don't fail status update if notifications fail
    }

    // Process order rewards if status is "Delivered"
    if (status === 'Delivered') {
      try {
        console.log(`[ORDER REWARDS] Starting reward processing for order ${order._id}`);
        const rewardResult = await processOrderRewards(order);
        if (rewardResult) {
          console.log(`[ORDER REWARDS] SUCCESS: Awarded ${rewardResult.coinsAwarded} Indira Coins to user ${order.userId} for order ${order._id}`);
        } else {
          console.log(`[ORDER REWARDS] No rewards awarded for order ${order._id} (amount: ₹${order.totalAmount})`);
        }
      } catch (rewardError) {
        console.error('[ORDER REWARDS] FAILED to process rewards:', rewardError);
        console.error('[ORDER REWARDS] Stack trace:', rewardError.stack);
        // Don't fail order update if reward processing fails, but log extensively
      }
    }

    res.json({ 
      order,
      message: status === 'Delivered' ? 'Order delivered successfully!' : 'Order status updated successfully!'
    });
  } catch (error) {
    console.error('[UPDATE ORDER STATUS] Error:', error);
    res.status(500).json({ message: 'Failed to update order status.' });
  }
};

// Cancel order (user)
export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (order.status !== 'Pending') return res.status(400).json({ message: 'Cannot cancel order after it is shipped.' });
    
    // Restore stock when order is cancelled
    for (const item of order.items) {
      if (item.hasVariant && item.variantId) {
        // Restore variant stock
        await Product.updateOne(
          { _id: item.id, 'variants.id': item.variantId },
          { $inc: { 'variants.$.stock': item.qty } }
        );
      } else {
        // Restore regular product stock
        await Product.updateOne(
          { _id: item.id },
          { $inc: { stock: item.qty } }
        );
      }
    }
    
    order.status = 'Cancelled';
    await order.save();
    res.json({ order });
  } catch (error) {
    console.error('[CANCEL ORDER] Error:', error);
    res.status(500).json({ message: 'Failed to cancel order.' });
  }
};

// Get order by ID (user or admin)
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('coupon');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    // Fetch user details for admin view
    let userDetails = null;
    if (req.user.isAdmin) {
      const user = await import('../models/User.js').then(m => m.default.findById(order.userId));
      if (user) {
        userDetails = {
          id: user._id,
          name: user.name,
          phone: user.phone
        };
      }
    }
    // Ensure deliveryRating and deliveryReview are always present in response
    const orderObj = order.toObject();
    orderObj.deliveryRating = order.deliveryRating || null;
    orderObj.deliveryReview = order.deliveryReview || null;
    res.json({ order: orderObj, user: userDetails });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to fetch order.' });
  }
};

// Get order by ID (user access - only their own orders)
export const getUserOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('coupon');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    
    // Ensure user can only access their own orders
    if (order.userId.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only view your own orders.' });
    }
    
    // Ensure deliveryRating and deliveryReview are always present in response
    const orderObj = order.toObject();
    orderObj.deliveryRating = order.deliveryRating || null;
    orderObj.deliveryReview = order.deliveryReview || null;
    res.json({ order: orderObj });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to fetch order.' });
  }
};

//   Wishlist  
export const getWishlist = async (req, res) => {
  try {

    const user = await import('../models/User.js').then(m => m.default.findById(req.user.id));
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ wishlist: user.wishlist.map(p => p.toObject ? { ...p.toObject(), id: p._id } : p) });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to fetch wishlist.' });
  }
};

export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await import('../models/User.js').then(m => m.default.findById(req.user.id));
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (!user.wishlist.map(id => id.toString()).includes(productId)) {
      user.wishlist.push(productId);
      await user.save();
    }
    res.json({ wishlist: user.wishlist });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to add to wishlist.' });
  }
};

export const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await import('../models/User.js').then(m => m.default.findById(req.user.id));
    if (!user) return res.status(404).json({ message: 'User not found.' });
    user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
    await user.save();
    res.json({ wishlist: user.wishlist });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to remove from wishlist.' });
  }
};

export const clearWishlist = async (req, res) => {
  try {
    const user = await import('../models/User.js').then(m => m.default.findById(req.user.id));
    if (!user) return res.status(404).json({ message: 'User not found.' });
    user.wishlist = [];
    await user.save();
    res.json({ wishlist: [] });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to clear wishlist.' });
  }
};

// New endpoint: getWishlistByUserId (fetches user, then fetches products by ID)
export const getWishlistByUserId = async (req, res) => {
  try {
    const user = await import('../models/User.js').then(m => m.default.findById(req.user.id));
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (!user.wishlist || user.wishlist.length === 0) return res.json({ wishlist: [] });
    // Fetch products by IDs in wishlist
    const products = await import('../models/Product.js').then(m => m.default.find({ _id: { $in: user.wishlist } }));
    // Add id field for frontend compatibility
    const wishlist = products.map(p => ({ ...p.toObject(), id: p._id }));
    res.json({ wishlist });
  } catch (err) {
    console.error('[GET WISHLIST BY USER]', err);
    res.status(500).json({ message: 'Failed to fetch wishlist.' });
  }
};

//   Cart  
// Enhanced getCart: fetch user, then fetch product and combo pack details for all cart items
export const getCart = async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    const ComboPack = (await import('../models/ComboPack.js')).default;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (!user.cart || user.cart.length === 0) return res.json({ cart: [] });
    
    const cart = [];
    
    // Process each cart item
    for (const item of user.cart) {
      if (item.type === 'product') {
        // Handle product items
        const product = await Product.findById(item.product);
        if (!product) continue; // Skip if product not found
        
        const cartItem = {
          ...product.toObject(),
          id: product._id,
          type: 'product',
          qty: item.quantity,
          addedAt: item.addedAt
        };
        
        // Add variant information if present
        if (item.variantId && product.hasVariants) {
          const variant = getVariantById(product, item.variantId);
          if (variant) {
            cartItem.selectedVariant = {
              id: item.variantId,
              name: item.variantName || variant.name,
              label: variant.label,
              price: item.variantPrice || variant.price,
              originalPrice: variant.originalPrice,
              stock: variant.stock,
              images: variant.images
            };
            // Override main product price with variant price for cart calculations
            cartItem.price = item.variantPrice || variant.price;
          }
        }
        
        cart.push(cartItem);
        
      } else if (item.type === 'combo') {
        // Handle combo pack items
        const comboPack = await ComboPack.findById(item.comboPackId).populate('products.productId', 'name images');
        if (!comboPack) continue; // Skip if combo pack not found
        
        const cartItem = {
          ...comboPack.toObject(),
          id: comboPack._id,
          type: 'combo',
          qty: item.quantity,
          addedAt: item.addedAt,
          price: comboPack.comboPrice // Use combo price for calculations
        };
        
        cart.push(cartItem);
      }
    }

    res.json({ cart });
  } catch (err) {
    console.error('[GET CART]', err);
    res.status(500).json({ message: 'Failed to fetch cart.' });
  }
};

export const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, variantId } = req.body;
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    
    // Get product to validate variant
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found.' });
    
    let variantInfo = null;
    let itemPrice = product.price;
    let stockToCheck = product.stock;
    
    // Handle variant validation and pricing
    if (product.hasVariants) {
      if (!variantId) {
        // Auto-select default/cheapest variant if none provided
        const defaultVariant = getDefaultVariant(product);
        if (!defaultVariant) {
          return res.status(400).json({ message: 'No variants available for this product.' });
        }
        variantInfo = defaultVariant;
      } else {
        variantInfo = getVariantById(product, variantId);
        if (!variantInfo) {
          return res.status(400).json({ message: 'Invalid variant selected.' });
        }
      }
      
      itemPrice = variantInfo.price;
      stockToCheck = variantInfo.stock;
      
      // Check variant stock
      if (stockToCheck < quantity) {
        return res.status(400).json({ message: `Only ${stockToCheck} items available for this variant.` });
      }
    } else {
      // Regular product stock check
      if (stockToCheck < quantity) {
        return res.status(400).json({ message: `Only ${stockToCheck} items available.` });
      }
    }
      // Check if item with same variant already exists in cart
    const cartKey = variantInfo ? `${productId}-${variantInfo.id}` : productId;
    const idx = user.cart.findIndex(item => {
      if (item.type !== 'product') return false; // Only match product items
      if (variantInfo) {
        return item.product.toString() === productId && item.variantId === variantInfo.id;
      }
      return item.product.toString() === productId && !item.variantId;
    });
    
    if (idx > -1) {
      // Update existing cart item
      user.cart[idx].quantity += quantity;
      if (variantInfo) {
        user.cart[idx].variantPrice = itemPrice; // Update price in case it changed
      }
    } else {
      // Add new cart item
      const cartItem = {
        type: 'product',
        product: productId,
        quantity: quantity
      };
      
      if (variantInfo) {
        cartItem.variantId = variantInfo.id;
        cartItem.variantName = variantInfo.name;
        cartItem.variantPrice = itemPrice;
      }
      
      user.cart.push(cartItem);
    }
    
    await user.save();
    res.json({ cart: user.cart, message: 'Added to cart successfully' });
  } catch (err) {
    console.error('[ADD TO CART]', err);
    res.status(500).json({ message: 'Failed to add to cart.' });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const { productId, variantId, comboPackId, type } = req.body;
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    
    if (type === 'combo' && comboPackId) {
      // Remove combo pack from cart
      user.cart = user.cart.filter(item => 
        !(item.type === 'combo' && item.comboPackId.toString() === comboPackId)
      );
    } else if (productId) {
      // Remove product from cart (with optional variant)
      user.cart = user.cart.filter(item => {
        if (item.type !== 'product') return true; // Keep non-product items
        
        if (variantId) {
          // Remove specific variant
          return !(item.product.toString() === productId && item.variantId === variantId);
        } else {
          // Remove all variants of this product
          return item.product.toString() !== productId;
        }
      });
    } else {
      return res.status(400).json({ message: 'Invalid request parameters.' });
    }
    
    await user.save();
    res.json({ cart: user.cart, message: 'Removed from cart successfully' });
  } catch (err) {
    console.error('[REMOVE FROM CART]', err);
    res.status(500).json({ message: 'Failed to remove from cart.' });
  }
};

export const clearCart = async (req, res) => {
  try {
    console.log('[CLEAR CART] Request received for user:', req.user.id);
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log('[CLEAR CART] User not found:', req.user.id);
      return res.status(404).json({ message: 'User not found.' });
    }
    
    console.log('[CLEAR CART] Current cart length:', user.cart.length);
    user.cart = [];
    await user.save();
    console.log('[CLEAR CART] Cart cleared successfully for user:', req.user.id);
    res.json({ message: 'Cart cleared successfully', cart: [] });
  } catch (err) {
    console.error('[CLEAR CART] Error:', err);
    res.status(500).json({ message: 'Failed to clear cart.' });
  }
};

// Update cart item quantity
export const updateCartItem = async (req, res) => {
  try {
    console.log('Updating cart item for user:', req.user.id);
    console.log('Request body:', req.body);
    const { productId, quantity: qty, variantId, comboPackId, type, qty:quantity } = req.body;
    if (!qty || qty < 1) {
      console.error('Invalid quantity:', qty);
      return res.status(400).json({ message: 'Invalid quantity.' });
    }
    
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    if (!user) { 
      console.error('User not found:', req.user.id);
      return res.status(404).json({ message: 'User not found.' });
    }
      console.log('User cart before update:', user.cart);
    
    let idx = -1;
    
    if (type === 'combo' && comboPackId) {
      // Find combo pack item
      idx = user.cart.findIndex(item => 
        item.type === 'combo' && item.comboPackId.toString() === comboPackId
      );
      
      if (idx === -1) {
        return res.status(404).json({ message: 'Combo pack not found in cart.' });
      }
      
      // Validate combo pack stock
      const ComboPack = (await import('../models/ComboPack.js')).default;
      const comboPack = await ComboPack.findById(comboPackId);
      if (comboPack) {
        const availableStock = await comboPack.calculateAvailableStock();
        if (qty > availableStock) {
          return res.status(400).json({ message: `Only ${availableStock} combo packs available.` });
        }
      }
      
    } else if (productId) {
      // Find product item by product and variant
      idx = user.cart.findIndex(item => {
        if (item.type !== 'product') return false;
        if (variantId) {
          return item.product.toString() === productId && item.variantId === variantId;
        }
        return item.product.toString() === productId && !item.variantId;
      });
      
      if (idx === -1) {
        return res.status(404).json({ message: 'Product not found in cart.' });
      }
      
      // Validate product stock
      const product = await Product.findById(productId);
      if (product) {
        let stockToCheck = product.stock;
        if (product.hasVariants && variantId) {
          const variant = getVariantById(product, variantId);
          stockToCheck = variant ? variant.stock : 0;
        }
        
        if (qty > stockToCheck) {
          return res.status(400).json({ message: `Only ${stockToCheck} items available.` });
        }
      }
    } else {
      return res.status(400).json({ message: 'Invalid request parameters.' });
    }
    
    // Update quantity
    user.cart[idx].quantity = parseInt(qty);
    
    await user.save();
    
    // Return updated cart with product details
    if (!user.cart || user.cart.length === 0) return res.json({ cart: [] });
    
    const productIds = user.cart.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } });
    
    const cart = user.cart.map(item => {
      const prod = products.find(p => p._id.toString() === item.product.toString());
      if (!prod) return null;
      
      const cartItem = {
        ...prod.toObject(),
        id: prod._id,
        qty: item.quantity,
      };
      
      // Add variant information if present
      if (item.variantId) {
        cartItem.selectedVariant = {
          id: item.variantId,
          name: item.variantName,
          price: item.variantPrice
        };
      }
      
      return cartItem;
    }).filter(Boolean);
      res.json({ cart });
  } catch (err) {
    console.error('[UPDATE CART ITEM]', err);
    res.status(500).json({ message: 'Failed to update cart item.' });
  }
};

// Add address to user profile
export const addUserAddress = async (req, res) => {
  try {
    const { name, address, phone } = req.body;
    if (!name || !address || !phone) {
      return res.status(400).json({ message: 'All address fields are required.' });
    }
    const user = await import('../models/User.js').then(m => m.default.findById(req.user.id));
    if (!user) return res.status(404).json({ message: 'User not found.' });
    user.addresses.push({ name, address, phone });
    await user.save();
    res.json({ addresses: user.addresses });
  } catch (err) {
    console.error('[ADD USER ADDRESS]', err);
    res.status(500).json({ message: 'Failed to add address.' });
  }
};

// Admin marks order as paid after reviewing UPI transaction
export const markOrderAsPaid = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    order.paymentStatus = 'Paid';
    await order.save();
    // Notify user when order is marked as paid
    const user = await User.findById(order.userId);
    if (user && user.pushToken) {
      await notifications.sendPushNotification(
        user.pushToken,
        'Payment Received',
        `Your payment for order #${order._id} has been verified and marked as paid.`,
        { orderId: order._id, status: 'Paid' }
      );
    }
    res.json({ success: true, order });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to mark order as paid.' });
  }
};

// Get all users (admin)
export const getAllUsers = async (req, res) => {
  try {
    const users = await import('../models/User.js').then(m => m.default.find({}, '-password'));
    // Add id field for frontend compatibility
    res.json({ users: users.map(u => ({ ...u.toObject(), id: u._id, userId: u._id })) });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
};

// Get all orders for a user (admin)
export const getOrdersByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;
    const orders = await Order.find({ userId }).sort({ placedAt: -1 });
    res.json({ orders: orders.map(order => ({ ...order.toObject(), id: order._id })) });
  } catch (_err) {
    res.status(500).json({ message: 'Failed to fetch user orders.' });
  }
};

// Toggle product featured status (admin)
export const toggleProductFeatured = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    
    // Toggle featured status
    product.featured = !product.featured;
    await product.save();
    
    res.json({ 
      success: true, 
      product: addIdField(product),
      message: `Product ${product.featured ? 'marked as featured' : 'removed from featured'}.`
    });
  } catch (error) {
    console.error('[TOGGLE PRODUCT FEATURED]', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to toggle product featured status.' 
    });
  }
};

// ======================
// DELIVERY SLOT MANAGEMENT
// ======================

// Time slots configuration
const TIME_SLOTS = [
  { id: 'morning', label: '9:00 AM - 12:00 PM', value: '9:00 AM - 12:00 PM' },
  { id: 'afternoon', label: '12:00 PM - 3:00 PM', value: '12:00 PM - 3:00 PM' },
  { id: 'evening', label: '3:00 PM - 6:00 PM', value: '3:00 PM - 6:00 PM' },
  { id: 'night', label: '6:00 PM - 9:00 PM', value: '6:00 PM - 9:00 PM' }
];

// Get available time slots
export const getTimeSlots = async (req, res) => {
  try {
    res.json({
      success: true,
      timeSlots: TIME_SLOTS
    });
  } catch (error) {
    console.error('[GET TIME SLOTS]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch time slots.'
    });
  }
};

// Get available delivery dates (starting 2 days from today)
export const getAvailableDeliveryDates = async (req, res) => {
  try {
    const dates = [];
    const today = new Date();
    
    // Generate dates starting from 2 days ahead, for next 30 days
    for (let i = 2; i <= 32; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push({
        date: date.toISOString().split('T')[0], // YYYY-MM-DD format
        label: date.toLocaleDateString('en-IN', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      });
    }
    
    res.json({
      success: true,
      availableDates: dates
    });
  } catch (error) {
    console.error('[GET AVAILABLE DELIVERY DATES]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available delivery dates.'
    });
  }
};

// Update delivery slot for an order
export const updateDeliverySlot = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { date, timeSlot } = req.body;
    
    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }
    
    // Check if user owns the order (for user requests)
    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to modify this order.'
      });
    }
    
    // Check if delivery slot can be modified
    if (!order.canModifyDeliverySlot()) {
      return res.status(400).json({
        success: false,
        message: `Delivery slot cannot be modified. Order status: ${order.status}`
      });
    }
    
    // Validate date (must be at least 2 days from today)
    if (date) {
      const selectedDate = new Date(date);
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 2);
      minDate.setHours(0, 0, 0, 0);
      
      if (selectedDate < minDate) {
        return res.status(400).json({
          success: false,
          message: 'Delivery date must be at least 2 days from today.'
        });
      }
    }
    
    // Validate time slot
    if (timeSlot && !TIME_SLOTS.some(slot => slot.value === timeSlot)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time slot selected.'
      });
    }
    
    // Update delivery slot
    if (date) order.deliverySlot.date = new Date(date);
    if (timeSlot) order.deliverySlot.timeSlot = timeSlot;
    order.deliverySlot.lastModified = new Date();
    
    await order.save();
    
    res.json({
      success: true,
      message: 'Delivery slot updated successfully.',
      deliverySlot: {
        date: order.deliverySlot.date,
        timeSlot: order.deliverySlot.timeSlot,
        lastModified: order.deliverySlot.lastModified
      }
    });
  } catch (error) {
    console.error('[UPDATE DELIVERY SLOT]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update delivery slot.'
    });
  }
};

// Get delivery slot for an order
export const getDeliverySlot = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }
    
    // Check if user owns the order (for user requests)
    if (req.user.role !== 'admin' && order.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to view this order.'
      });
    }
    
    res.json({
      success: true,
      deliverySlot: {
        date: order.deliverySlot.date,
        timeSlot: order.deliverySlot.timeSlot,
        isModifiable: order.deliverySlot.isModifiable,
        lastModified: order.deliverySlot.lastModified
      },
      canModify: order.canModifyDeliverySlot()
    });
  } catch (error) {
    console.error('[GET DELIVERY SLOT]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery slot.'
    });
  }
};

// Bulk create products from parsed CSV/Excel data
export const bulkCreateProducts = async (req, res) => {
  try {
    console.log('[BULK UPLOAD] Starting bulk product creation...');

    console.log('[BULK UPLOAD] Request body:', { userId: req.user.id || req.user._id || req.user.userId || 'Admin' });

    // Parse products data from request body with robust error handling
    let products;
    try {
      if (!req.body.products) {
        return res.status(400).json({
          success: false,
          message: 'No products data provided. Expected products array in request body.',
          error: 'Missing products field'
        });
      }
      
      products = typeof req.body.products === 'string' 
        ? JSON.parse(req.body.products) 
        : req.body.products;
        
      if (!Array.isArray(products)) {
        return res.status(400).json({
          success: false,
          message: 'Products data must be an array.',
          error: 'Invalid data type'
        });
      }
      
      if (products.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Products array is empty. Please provide at least one product.',
          error: 'Empty products array'
        });
      }
      
    } catch (parseError) {
      console.error('[BULK UPLOAD] Failed to parse products data:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid products data format. Expected JSON array.',
        error: parseError.message
      });
    }
    
    // Parse batch configuration from request body
    let batchConfig = null;
    try {
      if (req.body.batchConfig) {
        batchConfig = typeof req.body.batchConfig === 'string' 
          ? JSON.parse(req.body.batchConfig) 
          : req.body.batchConfig;
        console.log('[BULK UPLOAD] Batch configuration:', batchConfig);
      }
    } catch (batchParseError) {
      console.error('[BULK UPLOAD] Failed to parse batch configuration:', batchParseError);
      // Continue without batch config if parsing fails
      batchConfig = null;
    }
    
    // Handle image files with safe fallback
    const imageFiles = req.files || [];
    
    console.log(`[BULK UPLOAD] Received ${products.length} products and ${imageFiles.length} images`);
    
    // Import validation functions from s3Service with error handling
    let validateBulkUploadData, matchImagesToProducts;
    try {
      const s3Service = await import('../services/s3Service.js');
      validateBulkUploadData = s3Service.validateBulkUploadData;
      matchImagesToProducts = s3Service.matchImagesToProducts;
      
      if (!validateBulkUploadData || !matchImagesToProducts) {
        throw new Error('Required functions not found in s3Service');
      }
    } catch (importError) {
      console.error('[BULK UPLOAD] Failed to import s3Service functions:', importError);
      return res.status(500).json({
        success: false,
        message: 'Server configuration error. Please try again later.',
        error: 'S3Service import failed'
      });
    }
    
    // Validate input data with robust error handling
    let validation;
    try {
      validation = validateBulkUploadData(products, imageFiles);
      if (!validation || typeof validation.isValid === 'undefined') {
        throw new Error('Invalid validation response');
      }
    } catch (validationError) {
      console.error('[BULK UPLOAD] Validation function error:', validationError);
      // Continue with basic validation
      validation = { isValid: true, errors: [], warnings: [] };
    }
    
    if (!validation.isValid) {
      console.error('[BULK UPLOAD] Validation failed:', validation.errors);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validation.errors || [],
        warnings: validation.warnings || []
      });
    }
    
    if (validation.warnings && validation.warnings.length > 0) {
      console.warn('[BULK UPLOAD] Validation warnings:', validation.warnings);
    }
    
    // Match images to products with robust error handling
    let matchedProducts, unmatchedImages;
    try {
      const matchResult = matchImagesToProducts(products, imageFiles);
      
      // Handle different response formats
      if (matchResult && matchResult.matched && matchResult.unmatched) {
        matchedProducts = matchResult.matched;
        unmatchedImages = matchResult.unmatched;
      } else if (matchResult && matchResult.matchedProducts && matchResult.unmatchedImages) {
        matchedProducts = matchResult.matchedProducts;
        unmatchedImages = matchResult.unmatchedImages;
      } else {
        // Fallback: if matching fails, process without images
        console.warn('[BULK UPLOAD] Image matching failed, processing products without images');
        matchedProducts = products.map(product => ({
          ...product,
          matchedImages: [],
          variantImages: {}
        }));
        unmatchedImages = imageFiles || [];
      }
      
      if (!Array.isArray(matchedProducts)) {
        throw new Error('matchedProducts is not an array');
      }
      
    } catch (matchError) {
      console.error('[BULK UPLOAD] Image matching error:', matchError);
      // Fallback: process products without images
      matchedProducts = products.map(product => ({
        ...product,
        matchedImages: [],
        variantImages: {}
      }));
      unmatchedImages = imageFiles || [];
    }
    
    // Initialize results tracking with safe defaults
    const results = {
      successful: [],
      failed: [],
      unmatchedImages: unmatchedImages || [],
      summary: {
        totalProducts: products.length || 0,
        totalImages: imageFiles.length || 0,
        created: 0,
        failed: 0,
        imagesUploaded: 0,
        variantsCreated: 0,
        processingTimeMs: 0
      }
    };
    
    const startTime = Date.now();
    
    // Process each product with comprehensive error handling
    for (let i = 0; i < matchedProducts.length; i++) {
      const productData = matchedProducts[i];
      
      // Validate product data
      if (!productData || typeof productData !== 'object') {
        console.error(`[BULK UPLOAD] Invalid product data at index ${i}:`, productData);
        results.failed.push({
          name: `Product ${i + 1}`,
          error: 'Invalid product data format',
          index: i + 1
        });
        results.summary.failed++;
        continue;
      }
      
      const productName = productData.name || `Product_${i + 1}`;
      
      // Validate required fields
      const requiredFields = ['name', 'description', 'price', 'category'];
      const missingFields = requiredFields.filter(field => !productData[field]);
      
      if (missingFields.length > 0) {
        console.error(`[BULK UPLOAD] Missing required fields for ${productName}:`, missingFields);
        results.failed.push({
          name: productName,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          index: i + 1
        });
        results.summary.failed++;
        continue;
      }
      
      // Validate data types
      const priceValue = parseFloat(productData.price);
      if (isNaN(priceValue) || priceValue < 0) {
        console.error(`[BULK UPLOAD] Invalid price for ${productName}:`, productData.price);
        results.failed.push({
          name: productName,
          error: 'Invalid price value. Must be a positive number.',
          index: i + 1
        });
        results.summary.failed++;
        continue;
      }
      
      const stockValue = parseInt(productData.stock) || 0;
      if (stockValue < 0) {
        console.error(`[BULK UPLOAD] Invalid stock for ${productName}:`, productData.stock);
        results.failed.push({
          name: productName,
          error: 'Invalid stock value. Must be a non-negative number.',
          index: i + 1
        });
        results.summary.failed++;
        continue;
      }
      
      try {
        console.log(`[BULK UPLOAD] Processing product ${i + 1}/${matchedProducts.length}: ${productName}`);
        
        // Upload main product images with robust error handling and default fallback
        let uploadedImages = [];
        const productImages = productData.matchedImages || [];
        
        if (Array.isArray(productImages) && productImages.length > 0) {
          console.log(`[BULK UPLOAD] Uploading ${productImages.length} main images for ${productName}`);
          
          for (const imageFile of productImages) {
            try {
              // Validate image file
              if (!imageFile || !imageFile.buffer || !imageFile.originalname) {
                console.warn(`[BULK UPLOAD] Invalid image file for ${productName}:`, imageFile);
                continue;
              }
              
              const imageUrl = await uploadImageToS3(imageFile.buffer, imageFile.originalname, productName);
              if (imageUrl) {
                uploadedImages.push(imageUrl);
                results.summary.imagesUploaded++;
                console.log(`[BULK UPLOAD] Uploaded main image: ${imageFile.originalname} -> ${imageUrl}`);
              }
            } catch (imageError) {
              console.error(`[BULK UPLOAD] Failed to upload image ${imageFile.originalname}:`, imageError);
              // Continue with other images instead of failing the entire product
            }
          }
        }
        
        // Use default image if no images were uploaded
        if (uploadedImages.length === 0) {
          uploadedImages.push(DEFAULT_PRODUCT_IMAGE);
          console.log(`[BULK UPLOAD] No images uploaded for ${productName}, using default image: ${DEFAULT_PRODUCT_IMAGE}`);
        }
        
        // Process variants and their images with robust error handling
        let processedVariants = [];
        if (productData.hasVariants && productData.variants && Array.isArray(productData.variants)) {
          console.log(`[BULK UPLOAD] Processing ${productData.variants.length} variants for ${productName}`);
          
          for (const variant of productData.variants) {
            try {
              // Validate variant data
              if (!variant || typeof variant !== 'object') {
                console.warn(`[BULK UPLOAD] Invalid variant data for ${productName}:`, variant);
                continue;
              }
              
              if (!variant.name || !variant.price) {
                console.warn(`[BULK UPLOAD] Missing required variant fields for ${productName}:`, variant);
                continue;
              }
              
              const variantPrice = parseFloat(variant.price);
              if (isNaN(variantPrice) || variantPrice < 0) {
                console.warn(`[BULK UPLOAD] Invalid variant price for ${productName} - ${variant.name}:`, variant.price);
                continue;
              }
              
              let variantImages = [];
              
              // Upload variant-specific images with error handling
              const variantImageFiles = (productData.variantImages && productData.variantImages[variant.name]) || 
                                      (productData.variantMatches && productData.variantMatches[variant.name]) || [];
              
              if (Array.isArray(variantImageFiles) && variantImageFiles.length > 0) {
                console.log(`[BULK UPLOAD] Uploading ${variantImageFiles.length} images for variant ${variant.name}`);
                
                for (const imageFile of variantImageFiles) {
                  try {
                    // Validate variant image file
                    if (!imageFile || !imageFile.buffer || !imageFile.originalname) {
                      console.warn(`[BULK UPLOAD] Invalid variant image file for ${productName} - ${variant.name}:`, imageFile);
                      continue;
                    }
                    
                    // Use product name + variant name for folder organization
                    const folderName = `${productName}_${variant.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                    const imageUrl = await uploadImageToS3(imageFile.buffer, imageFile.originalname, folderName);
                    if (imageUrl) {
                      variantImages.push(imageUrl);
                      results.summary.imagesUploaded++;
                      console.log(`[BULK UPLOAD] Uploaded variant image: ${imageFile.originalname} -> ${imageUrl}`);
                    }
                  } catch (imageError) {
                    console.error(`[BULK UPLOAD] Failed to upload variant image ${imageFile.originalname}:`, imageError);
                    // Continue with other images
                  }
                }
              }
              
              // Create variant object with safe defaults
              const variantObj = {
                id: variant.id || `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: variant.name,
                label: variant.label || variant.name,
                price: variantPrice,
                originalPrice: variant.originalPrice ? parseFloat(variant.originalPrice) : null,
                stock: parseInt(variant.stock) || 0,
                sku: variant.sku || null,
                isDefault: Boolean(variant.isDefault),
                images: variantImages
              };
              
              processedVariants.push(variantObj);
              results.summary.variantsCreated++;
              
            } catch (variantError) {
              console.error(`[BULK UPLOAD] Error processing variant for ${productName}:`, variantError);
              // Continue with other variants
            }
          }
          
          // Auto-set cheapest variant as default if none specified
          if (processedVariants.length > 0) {
            const hasDefaultVariant = processedVariants.some(v => v.isDefault);
            if (!hasDefaultVariant) {
              const cheapestVariant = processedVariants.reduce((min, current) => 
                current.price < min.price ? current : min
              );
              cheapestVariant.isDefault = true;
              console.log(`[BULK UPLOAD] Auto-selected cheapest variant "${cheapestVariant.name}" as default for ${productName}`);
            }
          }
        }
        
        // Check if product already exists
        const existingProduct = await Product.findOne({ name: productName });
        if (existingProduct) {
          console.warn(`[BULK UPLOAD] Product "${productName}" already exists, skipping...`);
          results.failed.push({
            name: productName,
            error: 'Product with this name already exists',
            index: i + 1
          });
          results.summary.failed++;
          continue;
        }
        
        // Create product in database with robust validation
        const productDocument = {
          name: productData.name.trim(),
          description: productData.description.trim(),
          price: priceValue,
          originalPrice: productData.originalPrice ? parseFloat(productData.originalPrice) : null,
          category: productData.category.trim(),
          stock: stockValue,
          images: uploadedImages,
          hasVariants: Boolean(productData.hasVariants) && processedVariants.length > 0,
          variants: processedVariants,
          featured: Boolean(productData.featured),
          viewCount: 0,
          purchaseCount: 0
        };
        
        // Additional validation for product document
        if (!productDocument.name || productDocument.name.length < 2) {
          throw new Error('Product name must be at least 2 characters long');
        }
        
        if (!productDocument.description || productDocument.description.length < 10) {
          throw new Error('Product description must be at least 10 characters long');
        }
        
        if (!productDocument.category || productDocument.category.length < 2) {
          throw new Error('Product category must be at least 2 characters long');
        }
        
        const newProduct = new Product(productDocument);
        await newProduct.save();
        
        console.log(`[BULK UPLOAD] Successfully created product: ${productName} (ID: ${newProduct._id})`);
        
        // Define supplier info for batch creation using batch config or defaults
        let supplierInfo;
        if (batchConfig) {
          if (!batchConfig.differentSuppliers && batchConfig.globalSupplier && batchConfig.globalSupplier.name) {
            supplierInfo = {
              supplierName: batchConfig.globalSupplier.name,
              purchaseOrderNumber: productData.purchaseOrderNumber || '',
              receivedDate: productData.receivedDate ? new Date(productData.receivedDate) : new Date(),
              contactInfo: batchConfig.globalSupplier.contactInfo || 'info@indiraafoods.com'
            };
          } else {
            supplierInfo = {
              supplierName: productData.supplierName || 'Indiraa Foods Pvt Ltd',
              purchaseOrderNumber: productData.purchaseOrderNumber || '',
              receivedDate: productData.receivedDate ? new Date(productData.receivedDate) : new Date(),
              contactInfo: productData.supplierContact || 'info@indiraafoods.com'
            };
          }
        } else {
          supplierInfo = {
            supplierName: productData.supplierName || 'Indiraa Foods Pvt Ltd',
            purchaseOrderNumber: productData.purchaseOrderNumber || '',
            receivedDate: productData.receivedDate ? new Date(productData.receivedDate) : new Date(),
            contactInfo: productData.supplierContact || 'info@indiraafoods.com'
          };
        }
        
        // Store product for bulk batch creation (we'll process all at once later)
        const productForBatching = {
          productId: newProduct._id,
          hasVariants: newProduct.hasVariants,
          variants: newProduct.variants,
          stock: newProduct.stock,
          manufacturingDate: productData.manufacturingDate,
          expiryDate: productData.expiryDate,
          bestBeforeDate: productData.bestBeforeDate,
          supplierInfo: supplierInfo,
          location: productData.location || 'Main Warehouse'
        };
        
        // Store product for bulk batch creation (we'll process all at once later)
        if (!req.bulkProducts) {
          req.bulkProducts = [];
        }
        req.bulkProducts.push(productForBatching);
        
        results.successful.push({
          name: productName,
          id: newProduct._id,
          imagesUploaded: uploadedImages.length,
          variantsCreated: processedVariants.length,
          totalVariantImages: processedVariants.reduce((sum, v) => sum + (v.images?.length || 0), 0),
          index: i + 1
        });
        
        results.summary.created++;
        
      } catch (error) {
        console.error(`[BULK UPLOAD] Failed to create product "${productName}":`, error);
        results.failed.push({
          name: productName,
          error: error.message || 'Unknown error occurred',
          index: i + 1
        });
        results.summary.failed++;
      }
    }
    
    // Create bulk batch group for all products
    let bulkBatchResults = null;
    if (req.bulkProducts && req.bulkProducts.length > 0) {
      try {
        console.log(`[BULK UPLOAD] Creating bulk batch group for ${req.bulkProducts.length} products...`);
        
        const groupIdentifier = `BULK-${Date.now()}`;
        const { createBulkBatchGroup } = await import('../services/batchGroupService.js');
        
        bulkBatchResults = await createBulkBatchGroup({
          products: req.bulkProducts,
          batchConfig,
          groupIdentifier
        }, req.user.id || req.user._id || req.user.userId || '6846fc321c27a991b995164f');
        
        console.log(`[BULK UPLOAD] Created batch group: ${bulkBatchResults.batchGroupNumber} with ${bulkBatchResults.totalProducts} products`);
        
        // Add batch info to results
        results.batchGroup = {
          batchGroupNumber: bulkBatchResults.batchGroupNumber,
          totalProducts: bulkBatchResults.totalProducts,
          totalItems: bulkBatchResults.totalItems
        };
        results.summary.batchGroupsCreated = 1;
        
      } catch (batchError) {
        console.error('[BULK UPLOAD] Bulk batch group creation error:', batchError);
        results.batchError = batchError.message;
        // Don't fail the entire upload if batch creation fails
      }
    }
    
    results.summary.processingTimeMs = Date.now() - startTime;
    
    console.log(`[BULK UPLOAD] Completed: ${results.summary.created} created, ${results.summary.failed} failed in ${results.summary.processingTimeMs}ms`);
    
    // Return comprehensive results
    const response = {
      success: true,
      message: `Bulk upload completed: ${results.summary.created} products created, ${results.summary.failed} failed`,
      results,
      processingTime: `${(results.summary.processingTimeMs / 1000).toFixed(2)}s`
    };
    
    // If there were failures but some successes, return 207 (Multi-Status)
    const statusCode = results.summary.failed > 0 && results.summary.created > 0 ? 207 : 200;
    
    res.status(statusCode).json(response);
    
  } catch (error) {
    console.error('[BULK UPLOAD] Critical error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk upload failed due to server error',
      error: error.message
    });
  }
};

// ======================
// DELIVERY RATINGS & REVIEWS ENDPOINTS
// ======================

// Add or update delivery rating/review for an order
export const addOrderReview = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { rating, review } = req.body;
    const userId = req.user.id;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }
    if (!review || review.trim().length < 5) {
      return res.status(400).json({ message: 'Review must be at least 5 characters.' });
    }

    // Find order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    // Only allow the user who placed the order to review
    if (order.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You can only review your own orders.' });
    }

    // Only allow review if order is delivered
    if (order.status !== 'Delivered') {
      return res.status(400).json({ message: 'You can only review delivered orders.' });
    }

    // Only one review per order
    order.deliveryRating = rating;
    order.deliveryReview = review.trim();
    await order.save();

    res.json({ success: true, message: 'Review added successfully.', deliveryRating: order.deliveryRating, deliveryReview: order.deliveryReview });
  } catch (error) {
    console.error('[ADD ORDER REVIEW] Error:', error);
    res.status(500).json({ message: 'Failed to add review.' });
  }
};

// Get average delivery rating and total reviews
export const getAverageOrderRating = async (req, res) => {
  try {
    // Only consider orders with a rating
    const ratedOrders = await Order.find({ deliveryRating: { $exists: true, $ne: null } });
    const totalReviews = ratedOrders.length;
    const avgRating = totalReviews > 0 ? (ratedOrders.reduce((sum, o) => sum + o.deliveryRating, 0) / totalReviews).toFixed(2) : null;
    res.json({ averageRating: avgRating, totalReviews });
  } catch (error) {
    console.error('[GET AVERAGE ORDER RATING] Error:', error);
    res.status(500).json({ message: 'Failed to fetch average rating.' });
  }
};

// Get all categories
export const getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct('category');
    
    // Remove empty or null categories and sort alphabetically
    const validCategories = categories
      .filter(category => category && category.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
    
    res.json({ 
      success: true, 
      categories: validCategories,
      count: validCategories.length 
    });
  } catch (error) {
    console.error('[GET CATEGORIES] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch categories' 
    });
  }
};

// Get products by category
export const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      sort = 'name',
      minPrice,
      maxPrice,
      search 
    } = req.query;

    if (!category) {
      return res.status(400).json({ 
        success: false, 
        message: 'Category parameter is required' 
      });
    }

    // Build query
    let query = { 
      category: { $regex: new RegExp(category, 'i') },
      isActive: true 
    };

    // Add price filters if provided
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Add search filter if provided
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { description: searchRegex }
      ];
    }

    // Build sort object
    let sortObject = {};
    switch (sort) {
      case 'price-asc':
        sortObject = { price: 1 };
        break;
      case 'price-desc':
        sortObject = { price: -1 };
        break;
      case 'rating':
        sortObject = { 'ratings.average': -1 };
        break;
      case 'newest':
        sortObject = { createdAt: -1 };
        break;
      default:
        sortObject = { name: 1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [products, totalProducts] = await Promise.all([
      Product.find(query)
        .select('name description price category images image stock ratings')
        .sort(sortObject)
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalProducts,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      },
      filters: {
        category,
        sort,
        minPrice,
        maxPrice,
        search
      }
    });
  } catch (error) {
    console.error('[GET PRODUCTS BY CATEGORY] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch products by category' 
    });
  }
};
