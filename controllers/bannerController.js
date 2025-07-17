import Banner from '../models/Banner.js';
import AWS from 'aws-sdk';
import multer from 'multer';
import path from 'path';

// Initialize S3 client (same as product controller)
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION
});
const BUCKET = process.env.AWS_S3_BUCKET;

// Upload a banner image to S3
async function uploadBannerToS3(buffer, originalName, customName = null) {
  const ext = path.extname(originalName);
  const timestamp = Date.now();
  const baseName = customName || path.basename(originalName, ext);
  const key = `indiraa1/banners/${baseName}-${timestamp}${ext}`;
  
  const params = {
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/' + ext.replace('.', ''),
    ACL: 'public-read'
  };
  
  const data = await s3.upload(params).promise();
  return {
    url: data.Location,
    key: data.Key
  };
}

// Delete image from S3
async function deleteImageFromS3(key) {
  const params = {
    Bucket: BUCKET,
    Key: key
  };
  
  await s3.deleteObject(params).promise();
  return true;
}

// Validate image file
function validateImageFile(buffer, originalName, options = {}) {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
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
}

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only image files are allowed.'), false);
  }
};

// Configure multer upload
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Only one file at a time for banners
  }
});

/**
 * Get all banners (Admin only)
 */
export const getAllBanners = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter based on query parameters
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { subtitle: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }
    
    const banners = await Banner.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Banner.countDocuments(filter);
    
    res.json({
      success: true,
      banners,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalBanners: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banners',
      error: error.message
    });
  }
};

/**
 * Get active banners for public display
 */
export const getActiveBanners = async (req, res) => {
  try {
    // Handle expired banners first
    await Banner.handleExpiredBanners();
    
    // Get displayable banners
    const banners = await Banner.getDisplayableBanners();
    
    // Increment view count for displayed banners
    if (banners.length > 0) {
      try {
        await Promise.all(
          banners.map(banner => banner.incrementViewCount())
        );
      } catch (viewError) {
        console.error('Error incrementing view count:', viewError);
        // Don't fail the request if view count fails
      }
    }
    
    res.json({
      success: true,
      banners: banners.map(banner => ({
        _id: banner._id,
        title: banner.title,
        subtitle: banner.subtitle,
        description: banner.description,
        ctaText: banner.ctaText,
        ctaLink: banner.ctaLink,
        image: banner.image,
        textPosition: banner.textPosition,
        textColor: banner.textColor,
        textShadow: banner.textShadow,
        overlay: banner.overlay,
        buttons: banner.buttons,
        priority: banner.priority,
        viewCount: banner.viewCount,
        clickThroughRate: banner.clickThroughRate
      }))
    });
  } catch (error) {
    console.error('Error fetching active banners:', error);
    
    // Return empty banners array instead of failing
    res.json({
      success: true,
      banners: [],
      message: 'No banners available at the moment'
    });
  }
};

/**
 * Get single banner by ID
 */
export const getBannerById = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id)
      .populate('createdBy', 'name email');
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    
    res.json({
      success: true,
      banner
    });
  } catch (error) {
    console.error('Error fetching banner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banner',
      error: error.message
    });
  }
};

/**
 * Create new banner
 */
export const createBanner = async (req, res) => {
  try {
    const {
      title,
      subtitle,
      description,
      ctaText,
      ctaLink,
      textPosition,
      textColor,
      textShadow,
      overlay,
      buttons,
      priority,
      startDate,
      endDate
    } = req.body;
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Banner title is required'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Banner image is required'
      });
    }
    
    // Validate and upload image
    try {
      validateImageFile(req.file.buffer, req.file.originalname, {
        maxSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
        minWidth: 800,
        minHeight: 400
      });
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }
    
    // Upload image to S3
    const imageUpload = await uploadBannerToS3(
      req.file.buffer,
      req.file.originalname,
      title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    );
    
    // Parse overlay and buttons if they're strings
    let parsedOverlay = overlay;
    let parsedButtons = buttons;
    
    if (typeof overlay === 'string') {
      try {
        parsedOverlay = JSON.parse(overlay);
      } catch (e) {
        parsedOverlay = { enabled: true, color: '#000000', opacity: 0.3 };
      }
    }
    
    if (typeof buttons === 'string') {
      try {
        parsedButtons = JSON.parse(buttons);
      } catch (e) {
        parsedButtons = [];
      }
    }
    
    // Create banner
    const banner = new Banner({
      title,
      subtitle,
      description,
      ctaText,
      ctaLink,
      image: imageUpload.url,
      imageKey: imageUpload.key,
      textPosition: textPosition || 'center',
      textColor: textColor || '#ffffff',
      textShadow: textShadow === 'true' || textShadow === true,
      overlay: parsedOverlay || { enabled: true, color: '#000000', opacity: 0.3 },
      buttons: parsedButtons || [],
      priority: parseInt(priority) || 0,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      createdBy: req.user.adminId
    });
    
    await banner.save();
    
    // Populate created by field
    await banner.populate('createdBy', 'name email');
    
    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      banner
    });
  } catch (error) {
    console.error('Error creating banner:', error);
    
    // Clean up uploaded image if banner creation fails
    if (req.uploadedImageKey) {
      try {
        await deleteImageFromS3(req.uploadedImageKey);
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded image:', cleanupError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create banner',
      error: error.message
    });
  }
};

/**
 * Update banner
 */
export const updateBanner = async (req, res) => {
  try {
    const bannerId = req.params.id;
    const updateData = { ...req.body };
    
    const existingBanner = await Banner.findById(bannerId);
    if (!existingBanner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    
    // Handle image update if new file is provided
    if (req.file) {
      try {
        validateImageFile(req.file.buffer, req.file.originalname);
        
        // Upload new image
        const imageUpload = await uploadBannerToS3(
          req.file.buffer,
          req.file.originalname,
          updateData.title?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'banner'
        );
        
        // Delete old image
        if (existingBanner.imageKey) {
          try {
            await deleteImageFromS3(existingBanner.imageKey);
          } catch (deleteError) {
            console.error('Error deleting old banner image:', deleteError);
          }
        }
        
        updateData.image = imageUpload.url;
        updateData.imageKey = imageUpload.key;
      } catch (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError.message
        });
      }
    }
    
    // Parse JSON fields if they're strings
    if (typeof updateData.overlay === 'string') {
      try {
        updateData.overlay = JSON.parse(updateData.overlay);
      } catch (e) {
        delete updateData.overlay;
      }
    }
    
    if (typeof updateData.buttons === 'string') {
      try {
        updateData.buttons = JSON.parse(updateData.buttons);
      } catch (e) {
        delete updateData.buttons;
      }
    }
    
    // Convert string booleans
    if (updateData.textShadow !== undefined) {
      updateData.textShadow = updateData.textShadow === 'true' || updateData.textShadow === true;
    }
    
    if (updateData.isActive !== undefined) {
      updateData.isActive = updateData.isActive === 'true' || updateData.isActive === true;
    }
    
    // Convert dates
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }
    
    // Convert priority to number
    if (updateData.priority !== undefined) {
      updateData.priority = parseInt(updateData.priority) || 0;
    }
    
    const updatedBanner = await Banner.findByIdAndUpdate(
      bannerId,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');
    
    res.json({
      success: true,
      message: 'Banner updated successfully',
      banner: updatedBanner
    });
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update banner',
      error: error.message
    });
  }
};

/**
 * Delete banner
 */
export const deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    
    // Delete image from S3
    if (banner.imageKey) {
      try {
        await deleteImageFromS3(banner.imageKey);
      } catch (deleteError) {
        console.error('Error deleting banner image from S3:', deleteError);
        // Continue with banner deletion even if S3 deletion fails
      }
    }
    
    // Delete banner from database
    await Banner.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Banner deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete banner',
      error: error.message
    });
  }
};

/**
 * Toggle banner status (active/inactive)
 */
export const toggleBannerStatus = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    
    banner.isActive = !banner.isActive;
    await banner.save();
    
    res.json({
      success: true,
      message: `Banner ${banner.isActive ? 'activated' : 'deactivated'} successfully`,
      banner: {
        _id: banner._id,
        title: banner.title,
        isActive: banner.isActive
      }
    });
  } catch (error) {
    console.error('Error toggling banner status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle banner status',
      error: error.message
    });
  }
};

/**
 * Reorder banners priority
 */
export const reorderBanners = async (req, res) => {
  try {
    const { bannerIds } = req.body;
    
    if (!Array.isArray(bannerIds)) {
      return res.status(400).json({
        success: false,
        message: 'Banner IDs must be an array'
      });
    }
    
    // Update priorities based on order
    const updatePromises = bannerIds.map((bannerId, index) => 
      Banner.findByIdAndUpdate(bannerId, { priority: bannerIds.length - index })
    );
    
    await Promise.all(updatePromises);
    
    // Return updated banners
    const updatedBanners = await Banner.find({ _id: { $in: bannerIds } })
      .populate('createdBy', 'name email')
      .sort({ priority: -1 });
    
    res.json({
      success: true,
      message: 'Banner order updated successfully',
      banners: updatedBanners
    });
  } catch (error) {
    console.error('Error reordering banners:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder banners',
      error: error.message
    });
  }
};

/**
 * Track banner click (for analytics)
 */
export const trackBannerClick = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    
    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }
    
    await banner.incrementClickCount();
    
    res.json({
      success: true,
      message: 'Click tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking banner click:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track click',
      error: error.message
    });
  }
};

/**
 * Get banner analytics
 */
export const getBannerAnalytics = async (req, res) => {
  try {
    const banners = await Banner.find({})
      .select('title isActive viewCount clickCount priority createdAt')
      .sort({ priority: -1 });
    
    const analytics = banners.map(banner => ({
      _id: banner._id,
      title: banner.title,
      isActive: banner.isActive,
      viewCount: banner.viewCount,
      clickCount: banner.clickCount,
      clickThroughRate: banner.clickThroughRate,
      priority: banner.priority,
      createdAt: banner.createdAt
    }));
    
    const summary = {
      totalBanners: banners.length,
      activeBanners: banners.filter(b => b.isActive).length,
      totalViews: banners.reduce((sum, b) => sum + b.viewCount, 0),
      totalClicks: banners.reduce((sum, b) => sum + b.clickCount, 0),
      averageCTR: banners.length > 0 
        ? (banners.reduce((sum, b) => sum + parseFloat(b.clickThroughRate), 0) / banners.length).toFixed(2)
        : 0
    };
    
    res.json({
      success: true,
      analytics,
      summary
    });
  } catch (error) {
    console.error('Error fetching banner analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch banner analytics',
      error: error.message
    });
  }
};

/**
 * Bulk delete banners
 */
export const bulkDeleteBanners = async (req, res) => {
  try {
    const { bannerIds } = req.body;
    
    if (!bannerIds || !Array.isArray(bannerIds) || bannerIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Banner IDs array is required'
      });
    }
    
    // Get banners to delete their S3 images
    const bannersToDelete = await Banner.find({ _id: { $in: bannerIds } });
    
    // Delete images from S3
    for (const banner of bannersToDelete) {
      if (banner.s3Key) {
        try {
          await deleteImageFromS3(banner.s3Key);
        } catch (error) {
          console.error(`Failed to delete S3 image for banner ${banner._id}:`, error);
        }
      }
    }
    
    // Delete banners from database
    const result = await Banner.deleteMany({ _id: { $in: bannerIds } });
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} banner(s)`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error bulk deleting banners:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete banners',
      error: error.message
    });
  }
};

/**
 * Bulk update banner status
 */
export const bulkUpdateBannerStatus = async (req, res) => {
  try {
    const { bannerIds, isActive } = req.body;
    
    if (!bannerIds || !Array.isArray(bannerIds) || bannerIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Banner IDs array is required'
      });
    }
    
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive must be a boolean value'
      });
    }
    
    // Update banners
    await Banner.updateMany(
      { _id: { $in: bannerIds } },
      { 
        $set: { 
          isActive,
          updatedAt: new Date()
        }
      }
    );
    
    // Get updated banners to return
    const updatedBanners = await Banner.find({ _id: { $in: bannerIds } })
      .sort({ priority: 1 });
    
    res.json({
      success: true,
      message: `Successfully updated ${updatedBanners.length} banner(s)`,
      banners: updatedBanners
    });
  } catch (error) {
    console.error('Error bulk updating banner status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update banner status',
      error: error.message
    });
  }
};

export default {
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
};
