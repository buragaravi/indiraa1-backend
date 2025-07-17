import jwt from 'jsonwebtoken';
import SubAdmin from '../models/SubAdmin.js';

// Sub admin authentication middleware
export const authenticateSubAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided or invalid format.',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'indiraa-ecommerce',
        audience: 'sub-admin'
      });
    } catch (jwtError) {
      console.error('[SUB ADMIN AUTH] JWT verification failed:', jwtError.message);
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please login again.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. Please login again.',
          code: 'INVALID_TOKEN'
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Token verification failed. Please login again.',
        code: 'TOKEN_ERROR'
      });
    }

    // Validate token type
    if (decoded.type !== 'sub_admin') {
      return res.status(403).json({
        success: false,
        message: 'Invalid token type. Sub admin access required.',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    // Check if sub admin still exists and is active
    const subAdmin = await SubAdmin.findById(decoded.id);
    
    if (!subAdmin) {
      return res.status(401).json({
        success: false,
        message: 'Sub admin account no longer exists.',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }

    if (!subAdmin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Sub admin account has been deactivated.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Check if account is locked
    if (subAdmin.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Please contact administrator.',
        code: 'ACCOUNT_LOCKED'
      });
    }

    // Add sub admin info to request
    req.subAdmin = {
      id: subAdmin._id,
      email: subAdmin.email,
      name: subAdmin.name,
      role: subAdmin.role,
      permissions: subAdmin.permissions,
      roleDisplayName: subAdmin.roleDisplayName,
      permissionsDisplayName: subAdmin.permissionsDisplayName
    };

    console.log(`[SUB ADMIN AUTH] Authenticated: ${subAdmin.email} (${subAdmin.role})`);
    next();

  } catch (error) {
    console.error('[SUB ADMIN AUTH] Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed. Please try again.',
      code: 'AUTH_ERROR'
    });
  }
};

// Role-based access control middleware
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.subAdmin) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
          code: 'NOT_AUTHENTICATED'
        });
      }

      if (!allowedRoles.includes(req.subAdmin.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.subAdmin.roleDisplayName}`,
          code: 'INSUFFICIENT_ROLE',
          requiredRoles: allowedRoles,
          userRole: req.subAdmin.role
        });
      }

      next();
    } catch (error) {
      console.error('[ROLE CHECK] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Role verification failed.',
        code: 'ROLE_CHECK_ERROR'
      });
    }
  };
};

// Permission-based access control middleware
export const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    try {
      if (!req.subAdmin) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
          code: 'NOT_AUTHENTICATED'
        });
      }

      // Check write permission
      if (requiredPermission === 'write' && req.subAdmin.permissions !== 'read_write') {
        return res.status(403).json({
          success: false,
          message: `Write access denied. Your permissions: ${req.subAdmin.permissionsDisplayName}`,
          code: 'INSUFFICIENT_PERMISSIONS',
          requiredPermission: 'read_write',
          userPermission: req.subAdmin.permissions
        });
      }

      // Read permission is allowed for both 'read' and 'read_write'
      if (requiredPermission === 'read' && !['read', 'read_write'].includes(req.subAdmin.permissions)) {
        return res.status(403).json({
          success: false,
          message: 'Read access denied.',
          code: 'INSUFFICIENT_PERMISSIONS',
          requiredPermission: 'read',
          userPermission: req.subAdmin.permissions
        });
      }

      next();
    } catch (error) {
      console.error('[PERMISSION CHECK] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission verification failed.',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
};

// Feature-based access control middleware
export const requireFeatureAccess = (feature) => {
  return (req, res, next) => {
    try {
      if (!req.subAdmin) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
          code: 'NOT_AUTHENTICATED'
        });
      }

      // Get role-based permissions
      const rolePermissions = SubAdmin.getRolePermissions(req.subAdmin.role);
      
      // Check if user has access to this feature
      const hasFeatureAccess = rolePermissions.some(permission => 
        permission.startsWith(feature)
      );

      if (!hasFeatureAccess) {
        return res.status(403).json({
          success: false,
          message: `Access denied to ${feature}. Not available for your role: ${req.subAdmin.roleDisplayName}`,
          code: 'FEATURE_ACCESS_DENIED',
          feature,
          userRole: req.subAdmin.role,
          availableFeatures: rolePermissions
        });
      }

      // Check specific feature permission (read/write)
      const method = req.method.toLowerCase();
      const isWriteOperation = ['post', 'put', 'patch', 'delete'].includes(method);
      
      if (isWriteOperation) {
        const hasWriteAccess = rolePermissions.includes(`${feature}.write`);
        
        if (!hasWriteAccess || req.subAdmin.permissions !== 'read_write') {
          return res.status(403).json({
            success: false,
            message: `Write access denied to ${feature}. Required: read_write permissions`,
            code: 'WRITE_ACCESS_DENIED',
            feature,
            userPermission: req.subAdmin.permissions,
            requiredPermission: 'read_write'
          });
        }
      } else {
        // Read operation
        const hasReadAccess = rolePermissions.some(permission => 
          permission === `${feature}.read` || permission === `${feature}.write`
        );
        
        if (!hasReadAccess) {
          return res.status(403).json({
            success: false,
            message: `Read access denied to ${feature}.`,
            code: 'READ_ACCESS_DENIED',
            feature,
            userRole: req.subAdmin.role
          });
        }
      }

      // Add feature permissions to request for further use
      req.featurePermissions = {
        feature,
        canRead: rolePermissions.some(p => p === `${feature}.read` || p === `${feature}.write`),
        canWrite: rolePermissions.includes(`${feature}.write`) && req.subAdmin.permissions === 'read_write'
      };

      next();
    } catch (error) {
      console.error('[FEATURE ACCESS] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Feature access verification failed.',
        code: 'FEATURE_ACCESS_ERROR'
      });
    }
  };
};

// Combined authentication and authorization middleware
export const authorizeSubAdmin = (options = {}) => {
  const { roles = [], permission = 'read', feature = null } = options;
  
  return [
    authenticateSubAdmin,
    ...(roles.length > 0 ? [requireRole(...roles)] : []),
    ...(permission ? [requirePermission(permission)] : []),
    ...(feature ? [requireFeatureAccess(feature)] : [])
  ];
};

// Middleware to add sub admin info to logs
export const addSubAdminToLogs = (req, res, next) => {
  if (req.subAdmin) {
    req.logContext = {
      subAdminId: req.subAdmin.id,
      subAdminEmail: req.subAdmin.email,
      subAdminRole: req.subAdmin.role,
      timestamp: new Date().toISOString()
    };
  }
  next();
};

export default {
  authenticateSubAdmin,
  requireRole,
  requirePermission,
  requireFeatureAccess,
  authorizeSubAdmin,
  addSubAdminToLogs
};
