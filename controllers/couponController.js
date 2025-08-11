import Coupon from '../models/Coupon.js';

const logError = (err, location) => {
  console.error(`[CouponController:${location}]`, err);
};

// 🔹 Create a new coupon (admin)
export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      type,
      amount,
      expiry,
      minOrder,
      maxDiscount,
      usageLimit,
      active
    } = req.body;

    // ==== FIELD-BY-FIELD VALIDATION ====
    if (!code || typeof code !== 'string' || code.trim().length < 3) {
      return res.status(400).json({
        field: 'code',
        message: 'Coupon code must be at least 3 characters long.'
      });
    }

    if (!type || !['percentage', 'flat'].includes(type.toLowerCase())) {
      return res.status(400).json({
        field: 'type',
        message: 'Coupon type must be "percentage" or "flat".'
      });
    }

    if (amount == null || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({
        field: 'amount',
        message: 'Coupon amount must be a positive number.'
      });
    }

    if (expiry) {
      const expiryDate = new Date(expiry);
      if (isNaN(expiryDate.getTime())) {
        return res.status(400).json({
          field: 'expiry',
          message: 'Invalid expiry date format.'
        });
      }
      if (expiryDate < new Date()) {
        return res.status(400).json({
          field: 'expiry',
          message: 'Expiry date must be in the future.'
        });
      }
    }

    if (minOrder != null && (isNaN(minOrder) || Number(minOrder) < 0)) {
      return res.status(400).json({
        field: 'minOrder',
        message: 'Minimum order must be a non-negative number.'
      });
    }

    if (maxDiscount != null && (isNaN(maxDiscount) || Number(maxDiscount) <= 0)) {
      return res.status(400).json({
        field: 'maxDiscount',
        message: 'Maximum discount must be a positive number.'
      });
    }

    if (usageLimit != null && (!Number.isInteger(usageLimit) || usageLimit <= 0)) {
      return res.status(400).json({
        field: 'usageLimit',
        message: 'Usage limit must be a positive integer.'
      });
    }

    if (active != null && typeof active !== 'boolean') {
      return res.status(400).json({
        field: 'active',
        message: 'Active field must be true or false.'
      });
    }

    // ==== CHECK DUPLICATE COUPON ====
    const existing = await Coupon.findOne({ code: code.trim().toUpperCase() });
    if (existing) {
      return res.status(409).json({
        field: 'code',
        message: 'Coupon code already exists.'
      });
    }

    // ==== CREATE COUPON ====
    const coupon = new Coupon({
      code: code.trim().toUpperCase(),
      type: type.toLowerCase(),
      amount: Number(amount),
      expiry: expiry ? new Date(expiry) : null,
      minOrder: minOrder != null ? Number(minOrder) : null,
      maxDiscount: maxDiscount != null ? Number(maxDiscount) : null,
      usageLimit: usageLimit != null ? Number(usageLimit) : null,
      active: active ?? true
    });

    await coupon.save();

    res.status(201).json({
      message: 'Coupon created successfully.',
      coupon
    });
  } catch (err) {
    logError(err, 'createCoupon');
    res.status(500).json({
      message: 'Internal server error while creating coupon.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};


// ✅ Get all coupons (admin)
export const getAllCoupons = async (_req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ count: coupons.length, coupons });
  } catch (err) {
    logError(err, 'getAllCoupons');
    res.status(500).json({ message: 'Failed to fetch coupons.', error: err.message });
  }
};

// ✅ Validate coupon by code (public)
export const validateCoupon = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) return res.status(400).json({ message: 'Coupon code is required.' });

    const now = new Date();
    const coupon = await Coupon.findOne({
      code: code.trim().toUpperCase(),
      active: true,
      $or: [
        { expiry: { $exists: false } },
        { expiry: { $gte: now } }
      ]
    });

    if (!coupon) {
      return res.status(404).json({ message: 'Invalid or expired coupon.' });
    }

    res.json({ valid: true, coupon });
  } catch (err) {
    logError(err, 'validateCoupon');
    res.status(500).json({ message: 'Failed to validate coupon.', error: err.message });
  }
};

// ✅ Update coupon (admin)
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.code) {
      updateData.code = updateData.code.trim().toUpperCase();
      const duplicate = await Coupon.findOne({ code: updateData.code, _id: { $ne: id } });
      if (duplicate) {
        return res.status(409).json({ message: 'Another coupon with this code already exists.' });
      }
    }

    const coupon = await Coupon.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });

    res.json({ message: 'Coupon updated successfully.', coupon });
  } catch (err) {
    logError(err, 'updateCoupon');
    res.status(500).json({ message: 'Failed to update coupon.', error: err.message });
  }
};

// ✅ Delete coupon (admin)
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Coupon.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Coupon not found.' });
    }
    res.json({ message: 'Coupon deleted successfully.' });
  } catch (err) {
    logError(err, 'deleteCoupon');
    res.status(500).json({ message: 'Failed to delete coupon.', error: err.message });
  }
};
