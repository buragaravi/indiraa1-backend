import mongoose from 'mongoose';

const comboPackSchema = new mongoose.Schema({
  // Basic Information
  name: { type: String, required: true },
  description: { type: String, required: true },
  mainImage: { type: String }, // Main combo pack image (uploaded by admin)
  
  // Products included in combo with their images
  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: String }, // Optional: specific variant ID
    quantity: { type: Number, required: true, default: 1 },
    
    // Store product details at time of combo creation for consistency
    productName: { type: String, required: true },
    variantName: { type: String }, // If variant selected
    originalPrice: { type: Number, required: true },
    
    // Smart image collection (max 2 images per product)
    images: [{
      url: { type: String, required: true },
      source: { type: String, required: true }, // 'product' or 'variant'
      alt: { type: String } // Description for accessibility
    }],
    
    // Product availability at time of combo creation
    isAvailable: { type: Boolean, default: true }
  }],
  
  // Pricing
  originalTotalPrice: { type: Number, required: true }, // Sum of all product prices
  comboPrice: { type: Number, required: true }, // Discounted price
  discountAmount: { type: Number, required: true },
  discountPercentage: { type: Number, required: true },
  
  // Inventory Management
  stock: { type: Number, required: true, default: 0 },
  minStock: { type: Number, default: 5 }, // Alert threshold
  maxStock: { type: Number, default: 1000 },
  
  // Availability & Status
  isActive: { type: Boolean, default: true },
  isVisible: { type: Boolean, default: true }, // For temporary hiding
  
  // SEO & Categorization
  slug: { type: String, unique: true }, // URL-friendly name
  category: { type: String, default: 'Combo Pack' },
  tags: [{ type: String }],
  keywords: [{ type: String }], // For search optimization
  
  // Marketing
  featured: { type: Boolean, default: false },
  badgeText: { type: String }, // Custom badge like "Best Seller", "Limited Time"
  
  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  
  // Analytics
  viewCount: { type: Number, default: 0 },
  purchaseCount: { type: Number, default: 0 },
  
  // Reviews (similar to products)
  reviews: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    date: { type: Date, default: Date.now },
    verified: { type: Boolean, default: false } // Verified purchase
  }],
  averageRating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 }
  
}, { 
  timestamps: true,
  // Add virtual for ID compatibility
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create URL-friendly slug from name
comboPackSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim('-'); // Remove leading/trailing hyphens
  }
  next();
});

// Virtual for compatibility with frontend expecting 'id'
comboPackSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Calculate stock based on included products
comboPackSchema.methods.calculateAvailableStock = async function() {
  const Product = mongoose.model('Product');
  let minAvailableStock = this.stock;
  
  for (const comboProduct of this.products) {
    const product = await Product.findById(comboProduct.productId);
    if (!product) {
      return 0; // Product no longer exists
    }
    
    let productStock = 0;
    if (comboProduct.variantId) {
      // Check variant stock
      const variant = product.variants.find(v => v.id === comboProduct.variantId);
      productStock = variant ? variant.stock : 0;
    } else {
      // Check main product stock
      productStock = product.stock;
    }
    
    // Calculate how many combos we can make with this product
    const possibleCombos = Math.floor(productStock / comboProduct.quantity);
    minAvailableStock = Math.min(minAvailableStock, possibleCombos);
  }
  
  return Math.max(0, minAvailableStock);
};

// Update average rating when reviews change
comboPackSchema.methods.updateRating = function() {
  if (this.reviews.length === 0) {
    this.averageRating = 0;
    this.totalReviews = 0;
  } else {
    const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
    this.averageRating = Math.round((sum / this.reviews.length) * 10) / 10; // Round to 1 decimal
    this.totalReviews = this.reviews.length;
  }
};

// Indexes for better query performance
comboPackSchema.index({ slug: 1 });
comboPackSchema.index({ isActive: 1, isVisible: 1 });
comboPackSchema.index({ category: 1 });
comboPackSchema.index({ featured: 1 });
comboPackSchema.index({ 'products.productId': 1 });
comboPackSchema.index({ createdAt: -1 });
comboPackSchema.index({ purchaseCount: -1 });
comboPackSchema.index({ averageRating: -1 });

const ComboPack = mongoose.model('ComboPack', comboPackSchema);

export default ComboPack;
