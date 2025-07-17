import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import DeliveryAgent from '../models/DeliveryAgent.js';

// Generate JWT token for delivery agent
const generateToken = (agentId) => {
  return jwt.sign(
    { 
      id: agentId, 
      type: 'delivery_agent' 
    }, 
    process.env.JWT_SECRET, 
    { expiresIn: '24h' }
  );
};

// Generate refresh token
const generateRefreshToken = (agentId) => {
  return jwt.sign(
    { 
      id: agentId, 
      type: 'delivery_agent_refresh' 
    }, 
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, 
    { expiresIn: '7d' }
  );
};

// @desc    Login delivery agent
// @route   POST /api/delivery-auth/login
// @access  Public
export const loginDeliveryAgent = async (req, res) => {
  try {
    const { email, employeeId, password } = req.body;

    // Validation
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    if (!email && !employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Email or Employee ID is required'
      });
    }

    // Find agent by email or employee ID
    let query = {};
    if (email) {
      query.email = email.toLowerCase();
    } else {
      query.employeeId = employeeId;
    }

    const agent = await DeliveryAgent.findOne(query);

    if (!agent) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if agent is active
    if (!agent.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact admin.'
      });
    }

    // Verify password
    const isPasswordValid = await agent.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate tokens
    const token = generateToken(agent._id);
    const refreshToken = generateRefreshToken(agent._id);

    // Update last active
    agent.updateLastActive();

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        agent: {
          id: agent._id,
          employeeId: agent.employeeId,
          name: agent.name,
          email: agent.email,
          phone: agent.phone,
          assignedAreas: agent.assignedAreas,
          vehicleInfo: agent.vehicleInfo,
          workingHours: agent.workingHours,
          deliveryStats: agent.deliveryStats
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

// @desc    Refresh delivery agent token
// @route   POST /api/delivery-auth/refresh
// @access  Public
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken, 
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );

    if (decoded.type !== 'delivery_agent_refresh') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Find agent
    const agent = await DeliveryAgent.findById(decoded.id);

    if (!agent || !agent.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Agent not found or inactive'
      });
    }

    // Generate new tokens
    const newToken = generateToken(agent._id);
    const newRefreshToken = generateRefreshToken(agent._id);

    // Update last active
    agent.updateLastActive();

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Token refresh failed'
    });
  }
};

// @desc    Logout delivery agent
// @route   POST /api/delivery-auth/logout
// @access  Private (Delivery Agent)
export const logoutDeliveryAgent = async (req, res) => {
  try {
    // In a more advanced implementation, you would blacklist the token
    // For now, we'll just return success and let frontend handle token removal
    
    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

// @desc    Change delivery agent password
// @route   PUT /api/delivery-auth/change-password
// @access  Private (Delivery Agent)
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const agentId = req.agentId;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    // Find agent
    const agent = await DeliveryAgent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await agent.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    agent.password = newPassword; // Will be hashed by pre-save middleware
    await agent.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password change failed'
    });
  }
};

// @desc    Get delivery agent profile
// @route   GET /api/delivery-auth/profile
// @access  Private (Delivery Agent)
export const getProfile = async (req, res) => {
  try {
    const agent = req.agent;

    res.json({
      success: true,
      data: {
        id: agent._id,
        employeeId: agent.employeeId,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        assignedAreas: agent.assignedAreas,
        vehicleInfo: agent.vehicleInfo,
        workingHours: agent.workingHours,
        deliveryStats: agent.deliveryStats,
        lastActiveAt: agent.lastActiveAt,
        createdAt: agent.createdAt
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

// @desc    Update delivery agent profile
// @route   PUT /api/delivery-auth/profile
// @access  Private (Delivery Agent)
export const updateProfile = async (req, res) => {
  try {
    const agentId = req.agentId;
    const { name, phone, vehicleInfo } = req.body;

    // Find and update agent
    const agent = await DeliveryAgent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Update allowed fields
    if (name) agent.name = name;
    if (phone) agent.phone = phone;
    if (vehicleInfo) {
      agent.vehicleInfo = {
        ...agent.vehicleInfo,
        ...vehicleInfo
      };
    }

    await agent.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: agent._id,
        name: agent.name,
        phone: agent.phone,
        vehicleInfo: agent.vehicleInfo
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Profile update failed'
    });
  }
};

export default {
  loginDeliveryAgent,
  refreshToken,
  logoutDeliveryAgent,
  changePassword,
  getProfile,
  updateProfile
};
