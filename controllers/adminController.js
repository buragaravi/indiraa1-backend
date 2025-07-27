// Admin Controller for Multi-Admin Management
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import AdminActivityLog from '../models/AdminActivityLog.js';

const JWT_SECRET = process.env.JWT_SECRET || 'RaviBuraga';

// Helper function to log admin activities
const logAdminActivity = async (adminId, action, details = {}) => {
  try {
    await AdminActivityLog.create({
      adminId,
      action,
      details,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to log admin activity:', error);
  }
};

// Get current admin data with permissions
export const getCurrentAdmin = async (req, res) => {
  try {
    // req.user is set by authenticateAdminOrSubAdmin middleware
    const adminId = req.user.adminId;
    
    if (!adminId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin ID not found in token' 
      });
    }

    const admin = await Admin.findById(adminId).select('-password');
    
    if (!admin) {
      return res.status(404).json({ 
        success: false, 
        message: 'Admin not found' 
      });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Log activity
    await logAdminActivity(adminId, 'permission_check', {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      admin: {
        _id: admin._id,
        username: admin.username,
        name: admin.name,
        email: admin.email,
        isActive: admin.isActive,
        isSuperAdmin: admin.isSuperAdmin,
        permissions: admin.permissions,
        createdBy: admin.createdBy,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching current admin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// Create new admin (Super Admin only)
export const createAdmin = async (req, res) => {
  try {
    const { username, password, name, email, permissions, isSuperAdmin = false } = req.body;
    
    // Validate input
    if (!username || !password || !name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Username, password, name, and email are required'
      });
    }

    // Check if requesting admin exists
    const requestingAdmin = await Admin.findById(req.user.adminId);
    if (!requestingAdmin || !requestingAdmin.isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only super admins can create new admins' 
      });
    }

    // Check if username or email already exists
    const existingAdmin = await Admin.findOne({
      $or: [{ username }, { email }]
    });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: existingAdmin.username === username 
          ? 'Username already exists' 
          : 'Email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create new admin
    const newAdmin = new Admin({
      username,
      password: hashedPassword,
      name,
      email,
      permissions: permissions || getDefaultLimitedPermissions(),
      isSuperAdmin,
      isActive: true,
      createdBy: req.user.adminId
    });

    await newAdmin.save();
    
    // Log activity
    await logAdminActivity(req.user.adminId, 'admin_created', {
      targetAdminId: newAdmin._id,
      adminName: name,
      adminUsername: username,
      isSuperAdmin
    });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      admin: {
        _id: newAdmin._id,
        username: newAdmin.username,
        name: newAdmin.name,
        email: newAdmin.email,
        isActive: newAdmin.isActive,
        isSuperAdmin: newAdmin.isSuperAdmin,
        createdAt: newAdmin.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
  }
};

// List all admins (Super Admin only)
export const listAdmins = async (req, res) => {
  try {
    // Check if requesting admin is super admin
    const requestingAdmin = await Admin.findById(req.user.adminId);
    if (!requestingAdmin || !requestingAdmin.isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only super admins can view admin list' 
      });
    }

    const admins = await Admin.find({})
      .select('-password')
      .populate('createdBy', 'name username')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      admins
    });
  } catch (error) {
    console.error('Error fetching admins:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// Update admin details (Super Admin only)
export const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, name, email, isSuperAdmin, isActive, permissions } = req.body;
    
    // Check if requesting admin is super admin
    const requestingAdmin = await Admin.findById(req.user.adminId);
    if (!requestingAdmin || !requestingAdmin.isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only super admins can update admin details' 
      });
    }

    // Prevent self-demotion from super admin
    if (id === req.user.adminId && isSuperAdmin === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove super admin privileges from yourself'
      });
    }

    // Check if username or email already exists (excluding current admin)
    if (username) {
      const existingUsername = await Admin.findOne({ 
        username, 
        _id: { $ne: id } 
      });
      if (existingUsername) {
        return res.status(400).json({
          success: false,
          message: 'Username already exists'
        });
      }
    }

    if (email) {
      const existingEmail = await Admin.findOne({ 
        email, 
        _id: { $ne: id } 
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    // Prepare update data
    const updateData = {};
    if (username) updateData.username = username;
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (typeof isSuperAdmin === 'boolean') updateData.isSuperAdmin = isSuperAdmin;
    if (typeof isActive === 'boolean') updateData.isActive = isActive;
    if (permissions) updateData.permissions = permissions;

    const admin = await Admin.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).select('-password');
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    
    // Log activity
    await logAdminActivity(req.user.adminId, 'admin_updated', {
      targetAdminId: id,
      targetAdminName: admin.name,
      changes: updateData
    });

    res.json({
      success: true,
      message: 'Admin updated successfully',
      admin
    });
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// Update admin permissions (Super Admin only)
export const updateAdminPermissions = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { permissions, isActive, isSuperAdmin } = req.body;
    
    // Check if requesting admin is super admin
    const requestingAdmin = await Admin.findById(req.user.adminId);
    if (!requestingAdmin || !requestingAdmin.isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only super admins can update permissions' 
      });
    }

    // Prevent self-demotion
    if (adminId === req.user.adminId && isSuperAdmin === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove super admin privileges from yourself'
      });
    }

    const admin = await Admin.findByIdAndUpdate(
      adminId,
      { 
        permissions, 
        isActive,
        ...(isSuperAdmin !== undefined && { isSuperAdmin })
      },
      { new: true }
    ).select('-password');
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }
    
    // Log activity
    await logAdminActivity(req.user.adminId, 'permissions_updated', {
      targetAdminId: adminId,
      changes: { permissions, isActive, isSuperAdmin }
    });

    res.json({
      success: true,
      message: 'Admin updated successfully',
      admin
    });
  } catch (error) {
    console.error('Error updating admin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// Delete admin (Super Admin only)
export const deleteAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    
    // Check if requesting admin is super admin
    const requestingAdmin = await Admin.findById(req.user.adminId);
    if (!requestingAdmin || !requestingAdmin.isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only super admins can delete admins' 
      });
    }

    // Prevent self-deletion
    if (adminId === req.user.adminId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete yourself'
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    await Admin.findByIdAndDelete(adminId);
    
    // Log activity
    await logAdminActivity(req.user.adminId, 'admin_deleted', {
      targetAdminId: adminId,
      adminName: admin.name,
      adminUsername: admin.username
    });

    res.json({
      success: true,
      message: 'Admin deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting admin:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// Get admin activity logs (Super Admin only)
export const getAdminActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, adminId } = req.query;
    
    // Check if requesting admin is super admin
    const requestingAdmin = await Admin.findById(req.user.adminId);
    if (!requestingAdmin || !requestingAdmin.isSuperAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only super admins can view activity logs' 
      });
    }

    const filter = adminId ? { adminId } : {};
    
    const logs = await AdminActivityLog.find(filter)
      .populate('adminId', 'name username')
      .populate('details.targetAdminId', 'name username')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AdminActivityLog.countDocuments(filter);
    
    res.json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
};

// Helper function to get default limited permissions
const getDefaultLimitedPermissions = () => {
  return {
    products: {
      enabled: true,
      actions: {
        view: true,
        create: false,
        edit: false,
        delete: false,
        bulk_upload: false,
        activate: false,
        deactivate: false,
        export: false
      }
    },
    orders: {
      enabled: true,
      actions: {
        view: true,
        create: false,
        edit: false,
        delete: false,
        export: false,
        mark_paid: false,
        update_status: false,
        cancel: false,
        refund: false
      }
    },
    users: {
      enabled: false,
      actions: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        export: false,
        activate: false,
        deactivate: false
      }
    },
    banners: {
      enabled: false,
      actions: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        activate: false,
        deactivate: false,
        reorder: false,
        schedule: false
      }
    },
    coupons: {
      enabled: false,
      actions: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        activate: false,
        deactivate: false,
        export: false
      }
    },
    categories: {
      enabled: false,
      actions: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        reorder: false
      }
    },
    inventory: {
      enabled: false,
      actions: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        batch_create: false,
        batch_edit: false,
        export: false
      }
    },
    returns: {
      enabled: false,
      actions: {
        view: false,
        process: false,
        approve: false,
        reject: false,
        refund: false,
        export: false
      }
    },
    analytics: {
      enabled: false,
      actions: {
        view: false,
        export: false,
        revenue: false,
        sales: false,
        users: false,
        products: false
      }
    },
    sub_admins: {
      enabled: false,
      actions: {
        view: false,
        create: false,
        edit: false,
        delete: false,
        activate: false,
        deactivate: false
      }
    }
  };
};

export default {
  getCurrentAdmin,
  createAdmin,
  listAdmins,
  updateAdmin,
  updateAdminPermissions,
  deleteAdmin,
  getAdminActivityLogs
};
