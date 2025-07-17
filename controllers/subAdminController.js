import jwt from 'jsonwebtoken';
import SubAdmin from '../models/SubAdmin.js';
import Admin from '../models/Admin.js';
import { sendEmail } from '../services/emailService.js';
import crypto from 'crypto';

// Generate JWT token with sub admin details
const generateToken = (subAdmin) => {
  try {
    const payload = {
      id: subAdmin._id,
      email: subAdmin.email,
      name: subAdmin.name,
      role: subAdmin.role,
      permissions: subAdmin.permissions,
      roleDisplayName: subAdmin.roleDisplayName,
      permissionsDisplayName: subAdmin.permissionsDisplayName,
      type: 'sub_admin'
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      issuer: 'indiraa-ecommerce',
      audience: 'sub-admin'
    });
  } catch (error) {
    console.error('[SUB ADMIN AUTH] Token generation error:', error);
    throw new Error('Failed to generate authentication token');
  }
};

// Create new sub admin (Admin only)
export const createSubAdmin = async (req, res) => {
  try {
    console.log('[CREATE SUB ADMIN] Starting sub admin creation...');
    
    const { name, email, phone, password, role, permissions } = req.body;
    const createdBy = req.user.adminId; // From admin auth middleware - using adminId from token

    // Validate required fields
    const requiredFields = { name, email, phone, password, role, permissions };
    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value || (typeof value === 'string' && value.trim().length === 0))
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields
      });
    }

    // Validate password strength
    const passwordValidation = SubAdmin.validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet security requirements',
        errors: passwordValidation.errors
      });
    }

    // Check if email already exists
    const existingSubAdmin = await SubAdmin.findOne({ 
      email: email.toLowerCase().trim() 
    });
    
    if (existingSubAdmin) {
      return res.status(409).json({
        success: false,
        message: 'Sub admin with this email already exists',
        field: 'email'
      });
    }

    // Check if phone already exists
    const existingPhone = await SubAdmin.findOne({ 
      phone: phone.trim() 
    });
    
    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: 'Sub admin with this phone number already exists',
        field: 'phone'
      });
    }

    // Validate role and permissions
    const validRoles = ['warehouse_manager', 'logistics_manager'];
    const validPermissions = ['read', 'read_write'];

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be warehouse_manager or logistics_manager',
        field: 'role'
      });
    }

    if (!validPermissions.includes(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid permissions. Must be read or read_write',
        field: 'permissions'
      });
    }

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create sub admin
    const subAdminData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password,
      role,
      permissions,
      createdBy,
      emailVerificationToken,
      emailVerificationExpires
    };

    const subAdmin = new SubAdmin(subAdminData);
    await subAdmin.save();

    console.log(`[CREATE SUB ADMIN] Successfully created sub admin: ${subAdmin.email}`);

    // Send verification email (non-blocking)
    try {
      const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/sub-admin/verify-email?token=${emailVerificationToken}&email=${encodeURIComponent(subAdmin.email)}`;
      
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2ecc71; margin: 0;">Indiraa E-commerce</h1>
            <p style="color: #666; margin: 5px 0;">Admin Panel Access</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
            <h2 style="color: #333; margin-top: 0;">Welcome to the Team!</h2>
            <p style="color: #555; line-height: 1.6;">Hello <strong>${subAdmin.name}</strong>,</p>
            <p style="color: #555; line-height: 1.6;">Your sub admin account has been successfully created with the following details:</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Role:</td>
                  <td style="padding: 8px 0; color: #333;">${subAdmin.roleDisplayName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Permissions:</td>
                  <td style="padding: 8px 0; color: #333;">${subAdmin.permissionsDisplayName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                  <td style="padding: 8px 0; color: #333;">${subAdmin.email}</td>
                </tr>
              </table>
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #555; margin-bottom: 20px;"><strong>Please verify your email address to activate your account:</strong></p>
            <a href="${verificationUrl}" 
               style="background: linear-gradient(135deg, #2ecc71, #27ae60); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      display: inline-block; 
                      font-weight: bold;
                      box-shadow: 0 4px 15px rgba(46, 204, 113, 0.3);">
              ✓ Verify Email Address
            </a>
          </div>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="color: #856404; margin: 0; font-size: 14px;">
              <strong>⏰ Important:</strong> This verification link will expire in 24 hours.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #888; font-size: 12px; margin: 0;">
              If you have any questions, please contact the administrator.<br>
              <strong>Indiraa E-commerce Team</strong>
            </p>
          </div>
        </div>
      `;

      await sendEmail(
        subAdmin.email,
        'Verify Your Sub Admin Account - Indiraa E-commerce',
        htmlContent
      );
      
      console.log(`[CREATE SUB ADMIN] Verification email sent to: ${subAdmin.email}`);
    } catch (emailError) {
      console.error('[CREATE SUB ADMIN] Failed to send verification email:', emailError);
      // Don't fail the creation if email fails
    }

    // Return success response (exclude password)
    const { password: _, ...subAdminResponse } = subAdmin.toObject();
    
    res.status(201).json({
      success: true,
      message: 'Sub admin created successfully. Verification email sent.',
      subAdmin: subAdminResponse
    });

  } catch (error) {
    console.error('[CREATE SUB ADMIN] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sub admin. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Sub admin login
export const loginSubAdmin = async (req, res) => {
  try {
    console.log('[SUB ADMIN LOGIN] Login attempt...');
    
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find sub admin by email
    const subAdmin = await SubAdmin.findByEmail(email);
    
    if (!subAdmin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is locked
    if (subAdmin.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.',
        lockUntil: subAdmin.lockUntil
      });
    }

    // Check if account is active
    if (!subAdmin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Please contact administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await subAdmin.comparePassword(password);
    
    if (!isPasswordValid) {
      // Increment login attempts
      await subAdmin.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Reset login attempts on successful login
    if (subAdmin.loginAttempts > 0) {
      await subAdmin.resetLoginAttempts();
    }

    // Update last login
    await subAdmin.updateLastLogin();

    // Generate JWT token
    const token = generateToken(subAdmin);

    console.log(`[SUB ADMIN LOGIN] Successful login: ${subAdmin.email} (${subAdmin.role})`);

    // Return success response
    const { password: _, loginAttempts, lockUntil, ...subAdminData } = subAdmin.toObject();
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      subAdmin: subAdminData,
      dashboard: `/sub-admin/${subAdmin.role}/dashboard`
    });

  } catch (error) {
    console.error('[SUB ADMIN LOGIN] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify email
export const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json({
        success: false,
        message: 'Verification token and email are required'
      });
    }

    const subAdmin = await SubAdmin.findOne({
      email: email.toLowerCase().trim(),
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!subAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    // Update sub admin as verified
    subAdmin.isEmailVerified = true;
    subAdmin.emailVerificationToken = null;
    subAdmin.emailVerificationExpires = null;
    await subAdmin.save();

    console.log(`[SUB ADMIN VERIFY] Email verified for: ${subAdmin.email}`);

    res.json({
      success: true,
      message: 'Email verified successfully. You can now login.'
    });

  } catch (error) {
    console.error('[SUB ADMIN VERIFY] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Email verification failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all sub admins (Admin only)
export const getAllSubAdmins = async (req, res) => {
  try {
    console.log('[GET SUB ADMINS] Fetching all sub admins...');

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    
    if (req.query.role) {
      filter.role = req.query.role;
    }
    
    if (req.query.permissions) {
      filter.permissions = req.query.permissions;
    }
    
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }
    
    if (req.query.isEmailVerified !== undefined) {
      filter.isEmailVerified = req.query.isEmailVerified === 'true';
    }

    // Search functionality
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ];
    }

    // Get sub admins with pagination
    const subAdmins = await SubAdmin.find(filter)
      .select('-password -emailVerificationToken -passwordResetToken')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SubAdmin.countDocuments(filter);

    res.json({
      success: true,
      subAdmins,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('[GET SUB ADMINS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sub admins',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update sub admin (Admin only)
export const updateSubAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, permissions, isActive } = req.body;

    console.log(`[UPDATE SUB ADMIN] Updating sub admin: ${id}`);

    const subAdmin = await SubAdmin.findById(id);
    
    if (!subAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Sub admin not found'
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email.toLowerCase().trim() !== subAdmin.email) {
      const existingEmail = await SubAdmin.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: id }
      });
      
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: 'Email is already taken by another sub admin'
        });
      }
    }

    // Check if phone is being changed and if it's already taken
    if (phone && phone.trim() !== subAdmin.phone) {
      const existingPhone = await SubAdmin.findOne({ 
        phone: phone.trim(),
        _id: { $ne: id }
      });
      
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: 'Phone number is already taken by another sub admin'
        });
      }
    }

    // Update fields
    const updateData = {};
    
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (phone) updateData.phone = phone.trim();
    if (role) updateData.role = role;
    if (permissions) updateData.permissions = permissions;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedSubAdmin = await SubAdmin.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    console.log(`[UPDATE SUB ADMIN] Successfully updated: ${updatedSubAdmin.email}`);

    res.json({
      success: true,
      message: 'Sub admin updated successfully',
      subAdmin: updatedSubAdmin
    });

  } catch (error) {
    console.error('[UPDATE SUB ADMIN] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update sub admin',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete sub admin (Admin only)
export const deleteSubAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[DELETE SUB ADMIN] Deleting sub admin: ${id}`);

    const subAdmin = await SubAdmin.findById(id);
    
    if (!subAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Sub admin not found'
      });
    }

    await SubAdmin.findByIdAndDelete(id);

    console.log(`[DELETE SUB ADMIN] Successfully deleted: ${subAdmin.email}`);

    res.json({
      success: true,
      message: 'Sub admin deleted successfully'
    });

  } catch (error) {
    console.error('[DELETE SUB ADMIN] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete sub admin',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get current sub admin profile
export const getSubAdminProfile = async (req, res) => {
  try {
    const subAdmin = await SubAdmin.findById(req.subAdmin.id)
      .select('-password -emailVerificationToken -passwordResetToken')
      .populate('createdBy', 'name email');

    if (!subAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Sub admin not found'
      });
    }

    res.json({
      success: true,
      subAdmin
    });

  } catch (error) {
    console.error('[GET SUB ADMIN PROFILE] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    const subAdmin = await SubAdmin.findById(req.subAdmin.id);
    
    if (!subAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Sub admin not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await subAdmin.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Validate new password
    const passwordValidation = SubAdmin.validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'New password does not meet security requirements',
        errors: passwordValidation.errors
      });
    }

    // Update password
    subAdmin.password = newPassword;
    await subAdmin.save();

    console.log(`[CHANGE PASSWORD] Password changed for: ${subAdmin.email}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('[CHANGE PASSWORD] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
