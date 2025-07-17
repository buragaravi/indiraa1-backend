import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Banner title is required'],
    trim: true,
    maxLength: [100, 'Title cannot exceed 100 characters']
  },
  subtitle: {
    type: String,
    trim: true,
    maxLength: [200, 'Subtitle cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxLength: [500, 'Description cannot exceed 500 characters']
  },
  ctaText: {
    type: String,
    trim: true,
    maxLength: [50, 'CTA text cannot exceed 50 characters']
  },
  ctaLink: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // CTA link is optional
        return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(v);
      },
      message: 'Please provide a valid URL for CTA link'
    }
  },
  // Updated image fields for S3 integration
  image: {
    type: String,
    required: [true, 'Banner image is required']
  },
  imageKey: {
    type: String,
    required: [true, 'Banner image key is required for S3 management']
  },
  textPosition: {
    type: String,
    enum: [
      'top-left', 'top-center', 'top-right',
      'center-left', 'center', 'center-right',
      'bottom-left', 'bottom-center', 'bottom-right'
    ],
    default: 'center',
    required: [true, 'Text position is required']
  },
  textColor: {
    type: String,
    default: '#ffffff',
    validate: {
      validator: function(v) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
      },
      message: 'Text color must be a valid hex color code'
    }
  },
  textShadow: {
    type: Boolean,
    default: true
  },
  // Enhanced overlay options
  overlay: {
    enabled: {
      type: Boolean,
      default: true
    },
    color: {
      type: String,
      default: '#000000',
      validate: {
        validator: function(v) {
          return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
        },
        message: 'Overlay color must be a valid hex color code'
      }
    },
    opacity: {
      type: Number,
      default: 0.3,
      min: 0,
      max: 1
    }
  },
  // Simplified button structure - keeping backward compatibility but adding CTA
  buttons: [{
    text: {
      type: String,
      required: true,
      maxLength: [30, 'Button text cannot exceed 30 characters']
    },
    link: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(v);
        },
        message: 'Please provide a valid URL for button link'
      }
    },
    type: {
      type: String,
      enum: ['primary', 'secondary'],
      default: 'primary'
    }
  }],
  isActive: {
    type: Boolean,
    default: false,
    index: true
  },
  priority: {
    type: Number,
    default: 0,
    min: [0, 'Priority cannot be negative']
  },
  startDate: {
    type: Date,
    // Removed past date validation - allow any date
  },
  endDate: {
    type: Date,
    validate: {
      validator: function(v) {
        if (!v || !this.startDate) return true; // End date is optional
        return v > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  // Analytics fields
  viewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  clickCount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Admin reference
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Enhanced indexes for better performance
bannerSchema.index({ isActive: 1, priority: -1 });
bannerSchema.index({ startDate: 1, endDate: 1 });
bannerSchema.index({ createdBy: 1 });
bannerSchema.index({ priority: 1 });

// Virtual for checking if banner is currently schedulable
bannerSchema.virtual('isScheduled').get(function() {
  if (!this.startDate && !this.endDate) return false;
  const now = new Date();
  
  if (this.startDate && this.endDate) {
    return now >= this.startDate && now <= this.endDate;
  } else if (this.startDate) {
    return now >= this.startDate;
  } else if (this.endDate) {
    return now <= this.endDate;
  }
  
  return false;
});

// Virtual for calculating click-through rate
bannerSchema.virtual('clickThroughRate').get(function() {
  if (this.viewCount === 0) return 0;
  return ((this.clickCount / this.viewCount) * 100).toFixed(2);
});

// Virtual for full image URL (backward compatibility)
bannerSchema.virtual('imageUrl').get(function() {
  return this.image;
});

// Method to check if banner should be displayed
bannerSchema.methods.shouldDisplay = function() {
  if (!this.isActive) return false;
  
  const now = new Date();
  
  // Check start date
  if (this.startDate && now < this.startDate) return false;
  
  // Check end date
  if (this.endDate && now > this.endDate) return false;
  
  return true;
};

// Method to increment view count
bannerSchema.methods.incrementViewCount = function() {
  this.viewCount += 1;
  return this.save();
};

// Method to increment click count
bannerSchema.methods.incrementClickCount = function() {
  this.clickCount += 1;
  return this.save();
};

// Static method to get active banners in priority order
bannerSchema.statics.getActiveBanners = function() {
  return this.find({ isActive: true })
    .sort({ priority: -1, createdAt: -1 })
    .populate('createdBy', 'name email');
};

// Static method to get banners that should be displayed (considering schedule)
bannerSchema.statics.getDisplayableBanners = async function() {
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000));
  
  try {
    // First, handle expired banners
    await this.handleExpiredBanners();
    
    // Get banners that should be displayed
    const query = {
      isActive: true,
      $or: [
        // No dates specified - always active
        { startDate: { $exists: false }, endDate: { $exists: false } },
        // Only start date, no end date - active after start
        { startDate: { $lte: now }, endDate: { $exists: false } },
        // Only end date, no start date - active until end
        { startDate: { $exists: false }, endDate: { $gte: now } },
        // Both dates - active between dates
        { startDate: { $lte: now }, endDate: { $gte: now } }
      ]
    };
    
    return await this.find(query).sort({ priority: -1, createdAt: -1 });
  } catch (error) {
    console.error('Error in getDisplayableBanners:', error);
    // Return empty array on error to prevent breaking the frontend
    return [];
  }
};

// Static method to handle expired banners
bannerSchema.statics.handleExpiredBanners = async function() {
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - (5 * 24 * 60 * 60 * 1000));
  
  try {
    // Mark banners as inactive if end date has passed
    await this.updateMany(
      { 
        endDate: { $lt: now },
        isActive: true 
      },
      { isActive: false }
    );
    
    // Find banners to delete (end date is 5+ days past)
    const bannersToDelete = await this.find({
      endDate: { $lt: fiveDaysAgo }
    });
    
    // Delete old banners and their S3 images
    if (bannersToDelete.length > 0) {
      // Import AWS S3 here to avoid circular dependency
      const AWS = await import('aws-sdk');
      const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
        region: process.env.AWS_REGION
      });
      
      // Delete images from S3
      const deletePromises = bannersToDelete.map(async (banner) => {
        if (banner.imageKey) {
          try {
            await s3.deleteObject({
              Bucket: process.env.AWS_S3_BUCKET,
              Key: banner.imageKey
            }).promise();
            console.log(`Deleted S3 image: ${banner.imageKey}`);
          } catch (s3Error) {
            console.error(`Failed to delete S3 image ${banner.imageKey}:`, s3Error);
          }
        }
      });
      
      await Promise.all(deletePromises);
      
      // Delete banners from database
      const result = await this.deleteMany({
        _id: { $in: bannersToDelete.map(b => b._id) }
      });
      
      console.log(`Deleted ${result.deletedCount} expired banners`);
    }
    
  } catch (error) {
    console.error('Error handling expired banners:', error);
    // Don't throw error - just log it to prevent breaking the main flow
  }
};

// Pre-save middleware to auto-deactivate expired banners
bannerSchema.pre('save', function(next) {
  const now = new Date();
  
  // Auto-deactivate if end date has passed
  if (this.endDate && this.endDate < now && this.isActive) {
    this.isActive = false;
    console.log(`Auto-deactivating expired banner: ${this.title}`);
  }
  
  // Auto-activate if banner is scheduled to start and no end date or end date is in future
  if (this.startDate && this.startDate <= now && (!this.endDate || this.endDate >= now) && !this.isActive) {
    // Only auto-activate if explicitly set to inactive due to scheduling
    if (this.isNew || this.isModified('startDate') || this.isModified('endDate')) {
      this.isActive = true;
      console.log(`Auto-activating scheduled banner: ${this.title}`);
    }
  }
  
  next();
});

// Post-save middleware to ensure only reasonable number of active banners
bannerSchema.post('save', async function(doc) {
  if (doc.isActive) {
    // Limit to maximum 5 active banners for performance
    const activeBanners = await this.constructor.find({ isActive: true }).sort({ priority: -1 });
    
    if (activeBanners.length > 5) {
      // Deactivate the lowest priority banners
      const bannersToDeactivate = activeBanners.slice(5);
      await this.constructor.updateMany(
        { _id: { $in: bannersToDeactivate.map(b => b._id) } },
        { isActive: false }
      );
    }
  }
});

export default mongoose.model('Banner', bannerSchema);
