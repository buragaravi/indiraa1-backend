import ComboPack from '../models/ComboPack.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import User from '../models/User.js';

/**
 * Smart Image Collection Helper
 * Collects up to 2 images from product or its variants
 */
const collectProductImages = async (productId, variantId = null) => {
  try {
    const product = await Product.findById(productId);
    if (!product) return [];
    
    const images = [];
    
    if (variantId) {
      // Get images from specific variant first
      const variant = product.variants.find(v => v.id === variantId);
      if (variant && variant.images && variant.images.length > 0) {
        // Add up to 2 variant images
        for (let i = 0; i < Math.min(2, variant.images.length); i++) {
          images.push({
            url: variant.images[i],
            source: 'variant',
            alt: `${product.name} - ${variant.name || 'Variant'} ${i + 1}`
          });
        }
      }
      
      // If variant has less than 2 images, fill from main product
      if (images.length < 2 && product.images && product.images.length > 0) {
        const remainingSlots = 2 - images.length;
        for (let i = 0; i < Math.min(remainingSlots, product.images.length); i++) {
          images.push({
            url: product.images[i],
            source: 'product',
            alt: `${product.name} ${i + 1}`
          });
        }
      }
    } else {
      // Get images from main product
      if (product.images && product.images.length > 0) {
        for (let i = 0; i < Math.min(2, product.images.length); i++) {
          images.push({
            url: product.images[i],
            source: 'product',
            alt: `${product.name} ${i + 1}`
          });
        }
      }
    }
    
    return images;
  } catch (error) {
    console.error('Error collecting product images:', error);
    return [];
  }
};

/**
 * Create new combo pack
 */
export const createComboPack = async (req, res) => {
  try {
    const {
      name,
      description,
      mainImage,
      products, // Array of {productId, variantId?, quantity}
      comboPrice,
      stock,
      category,
      tags,
      featured,
      badgeText
    } = req.body;

    // Validate required fields
    if (!name || !description || !products || products.length === 0 || !comboPrice) {
      return res.status(400).json({ 
        message: 'Name, description, products, and combo price are required.' 
      });
    }

    // Validate and collect product details with images
    const comboProducts = [];
    let originalTotalPrice = 0;

    for (const productData of products) {
      const product = await Product.findById(productData.productId);
      if (!product) {
        return res.status(404).json({ 
          message: `Product with ID ${productData.productId} not found.` 
        });
      }

      let productPrice = 0;
      let productName = product.name;
      let variantName = null;

      // Check if variant is specified
      if (productData.variantId) {
        const variant = product.variants.find(v => v.id === productData.variantId);
        if (!variant) {
          return res.status(404).json({ 
            message: `Variant ${productData.variantId} not found in product ${product.name}.` 
          });
        }
        productPrice = variant.price;
        variantName = variant.name;
      } else {
        productPrice = product.price;
      }

      // Collect smart images (max 2 per product)
      const productImages = await collectProductImages(productData.productId, productData.variantId);

      comboProducts.push({
        productId: productData.productId,
        variantId: productData.variantId || null,
        quantity: productData.quantity || 1,
        productName,
        variantName,
        originalPrice: productPrice,
        images: productImages,
        isAvailable: true
      });

      originalTotalPrice += productPrice * (productData.quantity || 1);
    }

    // Calculate discount
    const discountAmount = originalTotalPrice - comboPrice;
    const discountPercentage = Math.round((discountAmount / originalTotalPrice) * 100);

    // Validate discount (combo should be cheaper)
    if (discountAmount <= 0) {
      return res.status(400).json({ 
        message: 'Combo price must be less than the total original price.' 
      });
    }

    // Create combo pack
    const comboPack = new ComboPack({
      name,
      description,
      mainImage,
      products: comboProducts,
      originalTotalPrice,
      comboPrice,
      discountAmount,
      discountPercentage,
      stock: stock || 0,
      category: category || 'Combo Pack',
      tags: tags || [],
      featured: featured || false,
      badgeText,
      createdBy: req.user?.adminId || req.user?.id // Support both admin and user creation
    });

    await comboPack.save();

    res.status(201).json({
      success: true,
      message: 'Combo pack created successfully.',
      comboPack: {
        ...comboPack.toObject(),
        id: comboPack._id
      }
    });

  } catch (error) {
    console.error('Error creating combo pack:', error);
    res.status(500).json({ 
      message: 'Failed to create combo pack.', 
      error: error.message 
    });
  }
};

/**
 * Get all combo packs (with filtering and pagination)
 */
export const getAllComboPacks = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      featured,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      active = false
    } = req.query;

    // Build filter query
    const filter = {};
    
    if (active) {
      filter.isActive = true;
      filter.isVisible = true;
    }
    
    if (category) filter.category = category;
    if (featured !== undefined) filter.featured = featured === 'true';
    
    if (minPrice || maxPrice) {
      filter.comboPrice = {};
      if (minPrice) filter.comboPrice.$gte = parseFloat(minPrice);
      if (maxPrice) filter.comboPrice.$lte = parseFloat(maxPrice);
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Build sort query
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const comboPacks = await ComboPack.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('products.productId', 'name price images stock')
      .lean();

    const total = await ComboPack.countDocuments(filter);

    // Add id field for frontend compatibility
    const formattedComboPacks = comboPacks.map(combo => ({
      ...combo,
      id: combo._id.toString()
    }));

    res.json({
      success: true,
      comboPacks: formattedComboPacks,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        count: formattedComboPacks.length,
        totalItems: total
      }
    });

  } catch (error) {
    console.error('Error fetching combo packs:', error);
    res.status(500).json({ 
      message: 'Failed to fetch combo packs.', 
      error: error.message 
    });
  }
};

/**
 * Get combo pack by ID (for detail page)
 */
export const getComboPackById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const comboPack = await ComboPack.findById(id)
      .populate('products.productId', 'name price images stock variants description')
      .populate('createdBy', 'username name');

    if (!comboPack) {
      return res.status(404).json({ message: 'Combo pack not found.' });
    }

    // Increment view count
    comboPack.viewCount += 1;
    await comboPack.save();

    // Calculate real-time stock availability
    const availableStock = await comboPack.calculateAvailableStock();

    res.json({
      success: true,
      comboPack: {
        ...comboPack.toObject(),
        id: comboPack._id,
        availableStock
      }
    });

  } catch (error) {
    console.error('Error fetching combo pack:', error);
    res.status(500).json({ 
      message: 'Failed to fetch combo pack.', 
      error: error.message 
    });
  }
};

/**
 * Get combo pack by slug (SEO-friendly URL)
 */
export const getComboPackBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    
    const comboPack = await ComboPack.findOne({ slug, isActive: true, isVisible: true })
      .populate('products.productId', 'name price images stock variants description')
      .populate('createdBy', 'username name');

    if (!comboPack) {
      return res.status(404).json({ message: 'Combo pack not found.' });
    }

    // Increment view count
    comboPack.viewCount += 1;
    await comboPack.save();

    // Calculate real-time stock availability
    const availableStock = await comboPack.calculateAvailableStock();

    res.json({
      success: true,
      comboPack: {
        ...comboPack.toObject(),
        id: comboPack._id,
        availableStock
      }
    });

  } catch (error) {
    console.error('Error fetching combo pack by slug:', error);
    res.status(500).json({ 
      message: 'Failed to fetch combo pack.', 
      error: error.message 
    });
  }
};

/**
 * Update combo pack
 */
export const updateComboPack = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // If products are being updated, recalculate images and pricing
    if (updates.products) {
      const comboProducts = [];
      let originalTotalPrice = 0;

      for (const productData of updates.products) {
        const product = await Product.findById(productData.productId);
        if (!product) {
          return res.status(404).json({ 
            message: `Product with ID ${productData.productId} not found.` 
          });
        }

        let productPrice = 0;
        let productName = product.name;
        let variantName = null;

        if (productData.variantId) {
          const variant = product.variants.find(v => v.id === productData.variantId);
          if (!variant) {
            return res.status(404).json({ 
              message: `Variant ${productData.variantId} not found in product ${product.name}.` 
            });
          }
          productPrice = variant.price;
          variantName = variant.name;
        } else {
          productPrice = product.price;
        }

        // Collect fresh images
        const productImages = await collectProductImages(productData.productId, productData.variantId);

        comboProducts.push({
          productId: productData.productId,
          variantId: productData.variantId || null,
          quantity: productData.quantity || 1,
          productName,
          variantName,
          originalPrice: productPrice,
          images: productImages,
          isAvailable: true
        });

        originalTotalPrice += productPrice * (productData.quantity || 1);
      }

      updates.products = comboProducts;
      updates.originalTotalPrice = originalTotalPrice;

      // Recalculate discount if combo price is provided
      if (updates.comboPrice) {
        updates.discountAmount = originalTotalPrice - updates.comboPrice;
        updates.discountPercentage = Math.round((updates.discountAmount / originalTotalPrice) * 100);
      }
    }

    updates.lastModifiedBy = req.user?.adminId || req.user?.id;

    const comboPack = await ComboPack.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate('products.productId', 'name price images stock variants');

    if (!comboPack) {
      return res.status(404).json({ message: 'Combo pack not found.' });
    }

    res.json({
      success: true,
      message: 'Combo pack updated successfully.',
      comboPack: {
        ...comboPack.toObject(),
        id: comboPack._id
      }
    });

  } catch (error) {
    console.error('Error updating combo pack:', error);
    res.status(500).json({ 
      message: 'Failed to update combo pack.', 
      error: error.message 
    });
  }
};

/**
 * Delete combo pack
 */
export const deleteComboPack = async (req, res) => {
  try {
    const { id } = req.params;

    const comboPack = await ComboPack.findByIdAndDelete(id);
    if (!comboPack) {
      return res.status(404).json({ message: 'Combo pack not found.' });
    }

    res.json({
      success: true,
      message: 'Combo pack deleted successfully.'
    });

  } catch (error) {
    console.error('Error deleting combo pack:', error);
    res.status(500).json({ 
      message: 'Failed to delete combo pack.', 
      error: error.message 
    });
  }
};

/**
 * Add review to combo pack
 */
export const addComboPackReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }

    const comboPack = await ComboPack.findById(id);
    if (!comboPack) {
      return res.status(404).json({ message: 'Combo pack not found.' });
    }

    // Check if user has already reviewed this combo pack
    const existingReview = comboPack.reviews.find(
      review => review.userId.toString() === userId
    );

    if (existingReview) {
      // Update existing review
      existingReview.rating = rating;
      existingReview.comment = comment;
      existingReview.date = new Date();
    } else {
      // Add new review
      comboPack.reviews.push({
        userId,
        rating,
        comment,
        date: new Date()
      });
    }

    // Update average rating
    comboPack.updateRating();
    await comboPack.save();

    res.json({
      success: true,
      message: 'Review added successfully.',
      averageRating: comboPack.averageRating,
      totalReviews: comboPack.totalReviews
    });

  } catch (error) {
    console.error('Error adding combo pack review:', error);
    res.status(500).json({ 
      message: 'Failed to add review.', 
      error: error.message 
    });
  }
};

/**
 * Get featured combo packs
 */
export const getFeaturedComboPacks = async (req, res) => {
  try {
    const { limit = 6 } = req.query;

    const comboPacks = await ComboPack.find({
      isActive: true,
      isVisible: true,
      featured: true
    })
    .sort({ purchaseCount: -1, createdAt: -1 })
    .limit(parseInt(limit))
    .populate('products.productId', 'name price images')
    .lean();

    const formattedComboPacks = comboPacks.map(combo => ({
      ...combo,
      id: combo._id.toString()
    }));

    res.json({
      success: true,
      comboPacks: formattedComboPacks
    });

  } catch (error) {
    console.error('Error fetching featured combo packs:', error);
    res.status(500).json({ 
      message: 'Failed to fetch featured combo packs.', 
      error: error.message 
    });
  }
};

/**
 * Add combo pack to cart
 */
export const addComboPackToCart = async (req, res) => {
  try {
    const { comboPackId, quantity = 1 } = req.body;
    const userId = req.user.id;

    // Validate combo pack
    const comboPack = await ComboPack.findById(comboPackId);
    if (!comboPack) {
      return res.status(404).json({ message: 'Combo pack not found.' });
    }

    if (!comboPack.isActive || !comboPack.isVisible) {
      return res.status(400).json({ message: 'Combo pack is not available.' });
    }

    // Check stock
    const availableStock = await comboPack.calculateAvailableStock();
    if (availableStock < quantity) {
      return res.status(400).json({ 
        message: `Only ${availableStock} units available in stock.` 
      });
    }

    // Get user and update cart
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Initialize cart if it doesn't exist
    if (!user.cart) {
      user.cart = [];
    }

    // Check if combo pack already exists in cart
    const existingCartItem = user.cart.find(item => 
      item.type === 'combo' && item.comboPackId?.toString() === comboPackId
    );

    if (existingCartItem) {
      // Update quantity
      const newQuantity = existingCartItem.quantity + quantity;
      if (newQuantity > availableStock) {
        return res.status(400).json({ 
          message: `Cannot add more. Maximum ${availableStock} units available.` 
        });
      }
      existingCartItem.quantity = newQuantity;
    } else {
      // Add new cart item
      user.cart.push({
        type: 'combo',
        comboPackId: comboPack._id,
        quantity: quantity,
        addedAt: new Date()
      });
    }

    await user.save();

    res.json({
      success: true,
      message: 'Combo pack added to cart successfully.',
      cartCount: user.cart.length
    });

  } catch (error) {
    console.error('Error adding combo pack to cart:', error);
    res.status(500).json({ 
      message: 'Failed to add combo pack to cart.', 
      error: error.message 
    });
  }
};

/**
 * Remove combo pack from cart
 */
export const removeComboPackFromCart = async (req, res) => {
  try {
    const { comboPackId } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!user.cart) {
      return res.status(400).json({ message: 'Cart is empty.' });
    }

    // Remove combo pack from cart
    user.cart = user.cart.filter(item => 
      !(item.type === 'combo' && item.comboPackId?.toString() === comboPackId)
    );

    await user.save();

    res.json({
      success: true,
      message: 'Combo pack removed from cart successfully.',
      cartCount: user.cart.length
    });

  } catch (error) {
    console.error('Error removing combo pack from cart:', error);
    res.status(500).json({ 
      message: 'Failed to remove combo pack from cart.', 
      error: error.message 
    });
  }
};

/**
 * Update combo pack quantity in cart
 */
export const updateComboPackCartQuantity = async (req, res) => {
  try {
    const { comboPackId, quantity } = req.body;
    const userId = req.user.id;

    if (quantity < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1.' });
    }

    // Validate combo pack
    const comboPack = await ComboPack.findById(comboPackId);
    if (!comboPack) {
      return res.status(404).json({ message: 'Combo pack not found.' });
    }

    // Check stock
    const availableStock = await comboPack.calculateAvailableStock();
    if (availableStock < quantity) {
      return res.status(400).json({ 
        message: `Only ${availableStock} units available in stock.` 
      });
    }

    // Get user and update cart
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!user.cart) {
      return res.status(400).json({ message: 'Cart is empty.' });
    }

    // Find and update cart item
    const cartItem = user.cart.find(item => 
      item.type === 'combo' && item.comboPackId?.toString() === comboPackId
    );

    if (!cartItem) {
      return res.status(404).json({ message: 'Combo pack not found in cart.' });
    }

    cartItem.quantity = quantity;
    await user.save();

    res.json({
      success: true,
      message: 'Cart updated successfully.'
    });

  } catch (error) {
    console.error('Error updating combo pack cart quantity:', error);
    res.status(500).json({ 
      message: 'Failed to update cart.', 
      error: error.message 
    });
  }
};

/**
 * Get user's combo pack wishlist
 */
export const getComboPackWishlist = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).populate({
      path: 'wishlist.comboPackId',
      model: 'ComboPack',
      select: 'name slug mainImage comboPrice originalTotalPrice discountPercentage stock isActive isVisible'
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Filter combo pack wishlist items
    const comboPackWishlist = user.wishlist
      ?.filter(item => item.type === 'combo' && item.comboPackId)
      ?.map(item => item.comboPackId) || [];

    res.json({
      success: true,
      wishlist: comboPackWishlist
    });

  } catch (error) {
    console.error('Error fetching combo pack wishlist:', error);
    res.status(500).json({ 
      message: 'Failed to fetch wishlist.', 
      error: error.message 
    });
  }
};

/**
 * Add combo pack to wishlist
 */
export const addComboPackToWishlist = async (req, res) => {
  try {
    const { comboPackId } = req.body;
    const userId = req.user.id;

    // Validate combo pack
    const comboPack = await ComboPack.findById(comboPackId);
    if (!comboPack) {
      return res.status(404).json({ message: 'Combo pack not found.' });
    }

    // Get user and update wishlist
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Initialize wishlist if it doesn't exist
    if (!user.wishlist) {
      user.wishlist = [];
    }

    // Check if combo pack already exists in wishlist
    const existingWishlistItem = user.wishlist.find(item => 
      item.type === 'combo' && item.comboPackId?.toString() === comboPackId
    );

    if (existingWishlistItem) {
      return res.status(400).json({ message: 'Combo pack already in wishlist.' });
    }

    // Add to wishlist
    user.wishlist.push({
      type: 'combo',
      comboPackId: comboPack._id,
      addedAt: new Date()
    });

    await user.save();

    res.json({
      success: true,
      message: 'Combo pack added to wishlist successfully.'
    });

  } catch (error) {
    console.error('Error adding combo pack to wishlist:', error);
    res.status(500).json({ 
      message: 'Failed to add combo pack to wishlist.', 
      error: error.message 
    });
  }
};

/**
 * Remove combo pack from wishlist
 */
export const removeComboPackFromWishlist = async (req, res) => {
  try {
    const { comboPackId } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (!user.wishlist) {
      return res.status(400).json({ message: 'Wishlist is empty.' });
    }

    // Remove combo pack from wishlist
    user.wishlist = user.wishlist.filter(item => 
      !(item.type === 'combo' && item.comboPackId?.toString() === comboPackId)
    );

    await user.save();

    res.json({
      success: true,
      message: 'Combo pack removed from wishlist successfully.'
    });

  } catch (error) {
    console.error('Error removing combo pack from wishlist:', error);
    res.status(500).json({ 
      message: 'Failed to remove combo pack from wishlist.', 
      error: error.message 
    });
  }
};
