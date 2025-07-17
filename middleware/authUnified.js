import jwt from 'jsonwebtoken';
import SubAdmin from '../models/SubAdmin.js';

const JWT_SECRET = process.env.JWT_SECRET || 'RaviBuraga';

// Middleware that accepts both admin and sub-admin tokens
export function authenticateAdminOrSubAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided.' });
  }

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    console.log('[AUTH] Token decoded:', {
      isAdmin: decoded.isAdmin,
      adminId: decoded.adminId,
      type: decoded.type,
      role: decoded.role,
      id: decoded.id,
      subAdminId: decoded.subAdminId
    });

    // Check if it's an admin token
    if (decoded.isAdmin && decoded.adminId) {
      req.user = decoded;
      req.userType = 'admin';
      console.log('[AUTH] Admin access granted');
      return next();
    }

    // Check if it's a sub-admin token (has type 'sub_admin' or has role field)
    if (decoded.type === 'sub_admin' || (decoded.role && decoded.id)) {
      // Additional verification for sub-admin
      req.user = decoded;
      req.userType = 'subadmin';
      req.subAdmin = decoded;
      console.log('[AUTH] Sub-admin access granted:', decoded.role);
      return next();
    }

    console.log('[AUTH] Access denied - not admin or sub-admin');
    // If neither admin nor sub-admin, deny access
    return res.status(403).json({ 
      message: 'Access denied. Admin or Sub-Admin privileges required.' 
    });

  } catch (err) {
    console.error('[AUTH] Token verification failed:', err.message);
    return res.status(401).json({ message: 'Invalid token.' });
  }
}

// Middleware for sub-admin with role checking
export async function authenticateSubAdminWithRole(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. No token provided.',
          code: 'NO_TOKEN'
        });
      }

      const token = authHeader.substring(7);
      
      // Verify token
      let decoded;
      try {
        // Try sub-admin token first
        decoded = jwt.verify(token, JWT_SECRET, {
          issuer: 'indiraa-ecommerce',
          audience: 'sub-admin'
        });
      } catch (subAdminError) {
        // Try admin token as fallback
        try {
          decoded = jwt.verify(token, JWT_SECRET);
          if (decoded.isAdmin && decoded.adminId) {
            // Admin has access to everything
            req.user = decoded;
            req.userType = 'admin';
            return next();
          }
        } catch (adminError) {
          return res.status(401).json({
            success: false,
            message: 'Invalid token.',
            code: 'INVALID_TOKEN'
          });
        }
      }

      if (!decoded.subAdminId) {
        return res.status(401).json({
          success: false,
          message: 'Invalid sub-admin token.',
          code: 'INVALID_TOKEN'
        });
      }

      // Get sub-admin from database
      const subAdmin = await SubAdmin.findById(decoded.subAdminId);
      
      if (!subAdmin) {
        return res.status(401).json({
          success: false,
          message: 'Sub-admin not found.',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!subAdmin.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated.',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }

      // Check role if specified
      if (allowedRoles.length > 0 && !allowedRoles.includes(subAdmin.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
          code: 'INSUFFICIENT_ROLE'
        });
      }

      req.subAdmin = subAdmin;
      req.user = decoded;
      req.userType = 'subadmin';
      next();

    } catch (error) {
      console.error('[SUB ADMIN AUTH] Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authentication error.',
        code: 'AUTH_ERROR'
      });
    }
  };
}

export default {
  authenticateAdminOrSubAdmin,
  authenticateSubAdminWithRole
};
