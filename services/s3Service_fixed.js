import AWS from 'aws-sdk';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Initialize S3 client
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION
});

const BUCKET = process.env.AWS_S3_BUCKET;

/**
 * Upload a banner image to S3
 * @param {Buffer} buffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {string} customName - Custom name for the file (optional)
 * @returns {Promise<{url: string, key: string}>} - Returns S3 URL and key
 */
export const uploadBannerToS3 = async (buffer, originalName, customName = null) => {
  try {
    const ext = path.extname(originalName);
    const timestamp = Date.now();
    const baseName = customName || path.basename(originalName, ext);
    const key = `indiraa1/banners/${baseName}-${timestamp}${ext}`;
    
    const params = {
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: getContentType(ext),
      ACL: 'public-read',
      Metadata: {
        'original-name': originalName,
        'upload-type': 'banner',
        'uploaded-at': new Date().toISOString()
      }
    };
    
    const data = await s3.upload(params).promise();
    
    return {
      url: data.Location,
      key: data.Key,
      bucket: BUCKET,
      etag: data.ETag
    };
  } catch (error) {
    console.error('Error uploading banner to S3:', error);
    throw new Error(`Failed to upload banner: ${error.message}`);
  }
};

/**
 * Upload a product image to S3 (existing functionality)
 * @param {Buffer} buffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {string} productName - Product name for folder organization
 * @returns {Promise<string>} - Returns S3 URL
 */
export const uploadProductImageToS3 = async (buffer, originalName, productName) => {
  try {
    const ext = path.extname(originalName);
    const key = `indiraa1/products/${productName}/${Date.now()}${ext}`;
    
    const params = {
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: getContentType(ext),
      ACL: 'public-read',
      Metadata: {
        'original-name': originalName,
        'upload-type': 'product',
        'product-name': productName,
        'uploaded-at': new Date().toISOString()
      }
    };
    
    const data = await s3.upload(params).promise();
    return data.Location;
  } catch (error) {
    console.error('Error uploading product image to S3:', error);
    throw new Error(`Failed to upload product image: ${error.message}`);
  }
};

/**
 * Upload a combo pack image to S3
 * @param {Buffer} buffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {string} comboPackName - Combo pack name for folder organization
 * @returns {Promise<{url: string, key: string}>} - Returns S3 URL and key
 */
export const uploadComboPackImageToS3 = async (buffer, originalName, comboPackName) => {
  try {
    const ext = path.extname(originalName);
    const timestamp = Date.now();
    const key = `indiraa1/combo-packs/${comboPackName}/${timestamp}${ext}`;
    
    const params = {
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: getContentType(ext),
      ACL: 'public-read',
      Metadata: {
        'original-name': originalName,
        'upload-type': 'combo-pack',
        'combo-pack-name': comboPackName,
        'uploaded-at': new Date().toISOString()
      }
    };
    
    const data = await s3.upload(params).promise();
    
    return {
      url: data.Location,
      key: data.Key,
      bucket: BUCKET,
      etag: data.ETag
    };
  } catch (error) {
    console.error('Error uploading combo pack image to S3:', error);
    throw new Error(`Failed to upload combo pack image: ${error.message}`);
  }
};

/**
 * Delete an image from S3
 * @param {string} key - S3 object key
 * @returns {Promise<boolean>} - Returns true if deleted successfully
 */
export const deleteImageFromS3 = async (key) => {
  try {
    const params = {
      Bucket: BUCKET,
      Key: key
    };
    
    await s3.deleteObject(params).promise();
    console.log(`Successfully deleted image: ${key}`);
    return true;
  } catch (error) {
    console.error('Error deleting image from S3:', error);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
};

/**
 * Get a signed URL for temporary access to a private image
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>} - Returns signed URL
 */
export const getSignedUrl = async (key, expiresIn = 3600) => {
  try {
    const params = {
      Bucket: BUCKET,
      Key: key,
      Expires: expiresIn
    };
    
    const url = await s3.getSignedUrlPromise('getObject', params);
    return url;
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

/**
 * List all images in a specific folder
 * @param {string} prefix - Folder prefix (e.g., 'indiraa1/banners/')
 * @param {number} maxKeys - Maximum number of keys to return (default: 1000)
 * @returns {Promise<Array>} - Returns array of object information
 */
export const listImagesInFolder = async (prefix, maxKeys = 1000) => {
  try {
    const params = {
      Bucket: BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys
    };
    
    const data = await s3.listObjectsV2(params).promise();
    
    return data.Contents.map(obj => ({
      key: obj.Key,
      lastModified: obj.LastModified,
      size: obj.Size,
      storageClass: obj.StorageClass,
      url: `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${obj.Key}`
    }));
  } catch (error) {
    console.error('Error listing images from S3:', error);
    throw new Error(`Failed to list images: ${error.message}`);
  }
};

/**
 * Check if an image exists in S3
 * @param {string} key - S3 object key
 * @returns {Promise<boolean>} - Returns true if image exists
 */
export const imageExistsInS3 = async (key) => {
  try {
    await s3.headObject({
      Bucket: BUCKET,
      Key: key
    }).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
};

/**
 * Get image metadata from S3
 * @param {string} key - S3 object key
 * @returns {Promise<Object>} - Returns image metadata
 */
export const getImageMetadata = async (key) => {
  try {
    const data = await s3.headObject({
      Bucket: BUCKET,
      Key: key
    }).promise();
    
    return {
      contentType: data.ContentType,
      contentLength: data.ContentLength,
      lastModified: data.LastModified,
      etag: data.ETag,
      metadata: data.Metadata
    };
  } catch (error) {
    console.error('Error getting image metadata from S3:', error);
    throw new Error(`Failed to get image metadata: ${error.message}`);
  }
};

/**
 * Generate multiple sizes of a banner image (for responsive design)
 * @param {Buffer} buffer - Original image buffer
 * @param {string} originalName - Original filename
 * @param {string} customName - Custom name for the file
 * @returns {Promise<Object>} - Returns URLs for different sizes
 */
export const uploadBannerWithSizes = async (buffer, originalName, customName = null) => {
  try {
    // For now, we'll upload the original image
    // In the future, you can add image resizing logic here using Sharp
    const originalUpload = await uploadBannerToS3(buffer, originalName, customName);
    
    return {
      original: originalUpload,
      // Future: Add different sizes
      // desktop: desktopUpload,
      // tablet: tabletUpload,
      // mobile: mobileUpload
    };
  } catch (error) {
    console.error('Error uploading banner with multiple sizes:', error);
    throw new Error(`Failed to upload banner with sizes: ${error.message}`);
  }
};

/**
 * Get content type based on file extension
 * @param {string} ext - File extension
 * @returns {string} - MIME type
 */
const getContentType = (ext) => {
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.ico': 'image/x-icon'
  };
  
  return contentTypes[ext.toLowerCase()] || 'application/octet-stream';
};

/**
 * Validate image file
 * @param {Buffer} buffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {Object} options - Validation options
 * @returns {boolean} - Returns true if valid
 */
export const validateImageFile = (buffer, originalName, options = {}) => {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    minWidth = 800,
    minHeight = 400
  } = options;
  
  // Check file size
  if (buffer.length > maxSize) {
    throw new Error(`File size too large. Maximum allowed: ${maxSize / 1024 / 1024}MB`);
  }
  
  // Check file extension
  const ext = path.extname(originalName).toLowerCase();
  if (!allowedTypes.includes(ext)) {
    throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
  }
  
  return true;
};

/**
 * Validate bulk upload data
 * @param {Array} products - Array of product objects
 * @param {Array} imageFiles - Array of image files
 * @returns {Object} - Validation result with isValid, errors, and warnings
 */
export const validateBulkUploadData = (products, imageFiles) => {
  const errors = [];
  const warnings = [];

  // Check if products array exists and is valid
  if (!products || !Array.isArray(products)) {
    errors.push('Products data must be an array');
    return { isValid: false, errors, warnings };
  }

  if (products.length === 0) {
    errors.push('No products provided for upload');
    return { isValid: false, errors, warnings };
  }

  if (products.length > 1000) {
    errors.push('Too many products. Maximum 1000 products allowed per batch');
    return { isValid: false, errors, warnings };
  }

  // Validate each product
  products.forEach((product, index) => {
    const productErrors = [];

    // Required fields validation
    if (!product.name || typeof product.name !== 'string' || product.name.trim().length === 0) {
      productErrors.push('Product name is required');
    }

    if (!product.description || typeof product.description !== 'string' || product.description.trim().length === 0) {
      productErrors.push('Product description is required');
    }

    if (!product.category || typeof product.category !== 'string' || product.category.trim().length === 0) {
      productErrors.push('Product category is required');
    }

    if (product.price === undefined || product.price === null || isNaN(parseFloat(product.price)) || parseFloat(product.price) <= 0) {
      productErrors.push('Valid product price is required');
    }

    if (product.stock === undefined || product.stock === null || isNaN(parseInt(product.stock)) || parseInt(product.stock) < 0) {
      productErrors.push('Valid stock quantity is required');
    }

    // Variant validation if hasVariants is true
    if (product.hasVariants === true) {
      if (!product.variants || !Array.isArray(product.variants) || product.variants.length === 0) {
        productErrors.push('Variants are required when hasVariants is true');
      } else {
        product.variants.forEach((variant, vIndex) => {
          if (!variant.name || typeof variant.name !== 'string') {
            productErrors.push(`Variant ${vIndex + 1}: name is required`);
          }
          if (variant.price === undefined || isNaN(parseFloat(variant.price)) || parseFloat(variant.price) <= 0) {
            productErrors.push(`Variant ${vIndex + 1}: valid price is required`);
          }
          if (variant.stock === undefined || isNaN(parseInt(variant.stock)) || parseInt(variant.stock) < 0) {
            productErrors.push(`Variant ${vIndex + 1}: valid stock is required`);
          }
        });

        // Check if at least one variant is marked as default
        const hasDefaultVariant = product.variants.some(v => v.isDefault === true);
        if (!hasDefaultVariant) {
          warnings.push(`Product "${product.name}": No default variant specified. The cheapest variant will be set as default.`);
        }
      }
    }

    // Add product-specific errors to main errors array
    if (productErrors.length > 0) {
      errors.push(`Product ${index + 1} ("${product.name || 'Unknown'}"): ${productErrors.join(', ')}`);
    }
  });

  // Image files validation
  if (imageFiles && imageFiles.length > 0) {
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    imageFiles.forEach((file, index) => {
      if (file.size > maxFileSize) {
        errors.push(`Image ${index + 1} ("${file.originalname}"): File size too large. Maximum 10MB allowed.`);
      }

      if (!allowedTypes.includes(file.mimetype)) {
        errors.push(`Image ${index + 1} ("${file.originalname}"): Invalid file type. Only JPEG, PNG, and WebP are allowed.`);
      }
    });

    if (imageFiles.length > 500) {
      warnings.push(`Large number of images (${imageFiles.length}). This may take longer to process.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Match images to products based on filename patterns
 * @param {Array} products - Array of product objects
 * @param {Array} imageFiles - Array of image files
 * @returns {Object} - Object with matched and unmatched images
 */
export const matchImagesToProducts = (products, imageFiles) => {
  const matched = [];
  const unmatched = [];

  if (!imageFiles || imageFiles.length === 0) {
    return { matched: products.map(p => ({ ...p, matchedImages: [] })), unmatched: [] };
  }

  products.forEach(product => {
    const productName = product.name.toLowerCase().replace(/\s+/g, '_');
    const productMatches = [];
    const variantMatches = {};

    // Match main product images
    const mainProductImages = imageFiles.filter(file => {
      const filename = file.originalname.toLowerCase();
      return (
        filename.includes(productName) &&
        !product.variants?.some(variant => 
          filename.includes(variant.name.toLowerCase().replace(/\s+/g, '_'))
        )
      ) || (
        filename.includes(product.name.toLowerCase()) &&
        !product.variants?.some(variant => 
          filename.includes(variant.name.toLowerCase())
        )
      );
    });

    productMatches.push(...mainProductImages);

    // Match variant-specific images if product has variants
    if (product.hasVariants && product.variants) {
      product.variants.forEach(variant => {
        const variantName = variant.name.toLowerCase().replace(/\s+/g, '_');
        const variantImages = imageFiles.filter(file => {
          const filename = file.originalname.toLowerCase();
          return (
            filename.includes(productName) && filename.includes(variantName)
          ) || (
            filename.includes(product.name.toLowerCase()) && 
            filename.includes(variant.name.toLowerCase())
          );
        });

        if (variantImages.length > 0) {
          variantMatches[variant.name] = variantImages;
        }
      });
    }

    matched.push({
      ...product,
      matchedImages: productMatches,
      variantMatches
    });
  });

  // Find unmatched images
  const allMatchedFiles = new Set();
  matched.forEach(product => {
    product.matchedImages?.forEach(file => allMatchedFiles.add(file.originalname));
    Object.values(product.variantMatches || {}).forEach(variantImages => {
      variantImages.forEach(file => allMatchedFiles.add(file.originalname));
    });
  });

  imageFiles.forEach(file => {
    if (!allMatchedFiles.has(file.originalname)) {
      unmatched.push(file);
    }
  });

  return { matched, unmatched };
};

export default {
  uploadBannerToS3,
  uploadProductImageToS3,
  uploadComboPackImageToS3,
  deleteImageFromS3,
  getSignedUrl,
  listImagesInFolder,
  imageExistsInS3,
  getImageMetadata,
  uploadBannerWithSizes,
  validateImageFile,
  validateBulkUploadData,
  matchImagesToProducts
};
