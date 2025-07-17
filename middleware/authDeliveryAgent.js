import jwt from 'jsonwebtoken';
import DeliveryAgent from '../models/DeliveryAgent.js';

// Middleware to authenticate delivery agents
export const authenticateDeliveryAgent = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if it's a delivery agent token
    if (decoded.type !== 'delivery_agent') {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. Invalid token type.' 
      });
    }

    // Find the delivery agent
    const agent = await DeliveryAgent.findById(decoded.id).select('-password');
    
    if (!agent) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. Agent not found.' 
      });
    }

    if (!agent.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. Agent account is deactivated.' 
      });
    }

    // Update last active timestamp
    agent.updateLastActive();

    // Add agent to request object
    req.agent = agent;
    req.agentId = agent._id;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. Invalid token.' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. Token expired.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Authentication failed.' 
    });
  }
};

// Middleware to optionally authenticate delivery agent (doesn't fail if no token)
export const optionalDeliveryAgentAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type === 'delivery_agent') {
      const agent = await DeliveryAgent.findById(decoded.id).select('-password');
      
      if (agent && agent.isActive) {
        req.agent = agent;
        req.agentId = agent._id;
        agent.updateLastActive();
      }
    }
    
    next();
  } catch (error) {
    // Silently continue if optional auth fails
    next();
  }
};

// Middleware to check if agent is assigned to specific areas
export const checkAgentArea = (req, res, next) => {
  try {
    const agent = req.agent;
    const { area, pincode } = req.body;
    
    if (!agent) {
      return res.status(401).json({ 
        success: false, 
        message: 'Agent authentication required.' 
      });
    }

    // If no areas assigned, agent can work anywhere
    if (!agent.assignedAreas || agent.assignedAreas.length === 0) {
      return next();
    }

    const targetArea = area || pincode;
    
    if (!targetArea) {
      return next(); // No area specified in request
    }

    // Check if agent is assigned to this area
    const isAssigned = agent.assignedAreas.some(assignedArea => 
      assignedArea.toLowerCase().includes(targetArea.toLowerCase()) ||
      targetArea.toLowerCase().includes(assignedArea.toLowerCase())
    );

    if (!isAssigned) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Agent not assigned to this area.' 
      });
    }

    next();
  } catch (error) {
    console.error('Area check error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Area validation failed.' 
    });
  }
};

// Middleware to check working hours
export const checkWorkingHours = (req, res, next) => {
  try {
    const agent = req.agent;
    
    if (!agent) {
      return res.status(401).json({ 
        success: false, 
        message: 'Agent authentication required.' 
      });
    }

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // "HH:MM" format
    
    const startTime = agent.workingHours.start;
    const endTime = agent.workingHours.end;

    // Convert times to minutes for comparison
    const timeToMinutes = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const currentMinutes = timeToMinutes(currentTime);
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    // Handle overnight shifts (e.g., 22:00 - 06:00)
    let isWithinHours;
    if (startMinutes <= endMinutes) {
      // Same day shift
      isWithinHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Overnight shift
      isWithinHours = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    if (!isWithinHours) {
      return res.status(403).json({ 
        success: false, 
        message: `Outside working hours. Working hours: ${startTime} - ${endTime}`,
        workingHours: {
          start: startTime,
          end: endTime,
          current: currentTime
        }
      });
    }

    next();
  } catch (error) {
    console.error('Working hours check error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Working hours validation failed.' 
    });
  }
};

export default {
  authenticateDeliveryAgent,
  optionalDeliveryAgentAuth,
  checkAgentArea,
  checkWorkingHours
};
