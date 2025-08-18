import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { sendPushNotification } from '../services/pushNotificationService.js';
import { sendEmail } from '../services/emailService.js';
import { sendSMS } from '../services/smsService.js';

// Send notification to specific users
export const sendNotificationToUsers = async (req, res) => {
  const {
    userIds,
    title,
    message,
    type = 'general', // 'general', 'promotional', 'order', 'offer'
    channels = ['push'], // 'push', 'email', 'sms'
    scheduledFor = null,
    expiresAt = null,
    imageUrl = null,
    actionUrl = null,
    actionText = null,
    priority = 'normal', // 'low', 'normal', 'high'
    adminId
  } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'User IDs array is required'
    });
  }

  if (!title || !message) {
    return res.status(400).json({
      success: false,
      message: 'Title and message are required'
    });
  }

  try {
    // Validate users exist
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id name email phone notificationPreferences pushTokens');

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid users found'
      });
    }

    const results = {
      total: users.length,
      sent: 0,
      failed: 0,
      details: []
    };

    // Check if this is a scheduled notification
    const isScheduled = scheduledFor && new Date(scheduledFor) > new Date();

    for (const user of users) {
      try {
        // Check user's notification preferences
        const canSendNotification = user.notificationPreferences?.[type] !== false;
        
        if (!canSendNotification) {
          results.details.push({
            userId: user._id,
            name: user.name,
            success: false,
            reason: 'User has disabled this type of notification'
          });
          results.failed++;
          continue;
        }

        // Create notification record
        const notification = new Notification({
          userId: user._id,
          title,
          message,
          type,
          imageUrl,
          actionUrl,
          actionText,
          priority,
          scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          adminId,
          isRead: false,
          sentChannels: [],
          status: isScheduled ? 'scheduled' : 'pending'
        });

        await notification.save();

        // Send notifications immediately if not scheduled
        if (!isScheduled) {
          const channelResults = {};

          // Send push notification
          if (channels.includes('push') && user.pushTokens && user.pushTokens.length > 0) {
            try {
              await sendPushNotification(user.pushTokens, {
                title,
                body: message,
                data: {
                  notificationId: notification._id.toString(),
                  type,
                  actionUrl,
                  actionText,
                  imageUrl
                }
              });
              channelResults.push = true;
              notification.sentChannels.push('push');
            } catch (pushError) {
              console.error('Push notification failed:', pushError);
              channelResults.push = false;
            }
          }

          // Send email notification
          if (channels.includes('email') && user.email) {
            try {
              await sendEmail(user.email, {
                subject: title,
                template: 'notification',
                data: {
                  userName: user.name,
                  title,
                  message,
                  actionUrl,
                  actionText,
                  imageUrl
                }
              });
              channelResults.email = true;
              notification.sentChannels.push('email');
            } catch (emailError) {
              console.error('Email notification failed:', emailError);
              channelResults.email = false;
            }
          }

          // Send SMS notification
          if (channels.includes('sms') && user.phone) {
            try {
              await sendSMS(user.phone, message);
              channelResults.sms = true;
              notification.sentChannels.push('sms');
            } catch (smsError) {
              console.error('SMS notification failed:', smsError);
              channelResults.sms = false;
            }
          }

          // Update notification status
          notification.status = notification.sentChannels.length > 0 ? 'sent' : 'failed';
          notification.sentAt = new Date();
          await notification.save();
        }

        results.details.push({
          userId: user._id,
          name: user.name,
          success: true,
          notificationId: notification._id,
          scheduledFor: notification.scheduledFor,
          channels: isScheduled ? channels : notification.sentChannels
        });
        results.sent++;

      } catch (userError) {
        console.error(`Error sending notification to user ${user._id}:`, userError);
        results.details.push({
          userId: user._id,
          name: user.name,
          success: false,
          reason: userError.message
        });
        results.failed++;
      }
    }

    res.json({
      success: true,
      message: isScheduled 
        ? `${results.sent} notifications scheduled successfully`
        : `${results.sent} notifications sent successfully`,
      results
    });

  } catch (error) {
    console.error('Error sending notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notifications'
    });
  }
};

// Send broadcast notification to all users
export const sendBroadcastNotification = async (req, res) => {
  const {
    title,
    message,
    type = 'general',
    channels = ['push'],
    userFilter = {}, // Additional filters like role, isActive, etc.
    scheduledFor = null,
    expiresAt = null,
    imageUrl = null,
    actionUrl = null,
    actionText = null,
    priority = 'normal',
    adminId
  } = req.body;

  if (!title || !message) {
    return res.status(400).json({
      success: false,
      message: 'Title and message are required'
    });
  }

  try {
    // Build user query
    const query = { ...userFilter };
    
    // By default, only send to active users unless specified
    if (query.isActive === undefined) {
      query.isActive = true;
    }

    // Get all users matching the filter
    const users = await User.find(query)
      .select('_id name email phone notificationPreferences pushTokens');

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No users found matching the criteria'
      });
    }

    // Extract user IDs
    const userIds = users.map(user => user._id);

    // Use the existing sendNotificationToUsers function
    req.body.userIds = userIds;
    await sendNotificationToUsers(req, res);

  } catch (error) {
    console.error('Error sending broadcast notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send broadcast notification'
    });
  }
};

// Get notification templates
export const getNotificationTemplates = async (req, res) => {
  const templates = [
    {
      id: 'welcome',
      name: 'Welcome Message',
      type: 'general',
      title: 'Welcome to Indiraa!',
      message: 'Thank you for joining us! Start exploring our amazing products and enjoy special offers.',
      category: 'onboarding'
    },
    {
      id: 'order_confirmed',
      name: 'Order Confirmation',
      type: 'order',
      title: 'Order Confirmed!',
      message: 'Your order #{orderNumber} has been confirmed and is being processed.',
      category: 'order_updates'
    },
    {
      id: 'order_shipped',
      name: 'Order Shipped',
      type: 'order',
      title: 'Your order is on its way!',
      message: 'Great news! Your order #{orderNumber} has been shipped and will arrive soon.',
      category: 'order_updates'
    },
    {
      id: 'order_delivered',
      name: 'Order Delivered',
      type: 'order',
      title: 'Order Delivered Successfully',
      message: 'Your order #{orderNumber} has been delivered. Hope you love your purchase!',
      category: 'order_updates'
    },
    {
      id: 'new_offer',
      name: 'New Offer Alert',
      type: 'promotional',
      title: 'Special Offer Just for You!',
      message: 'Don\'t miss out on our exclusive offer - {offerDetails}. Shop now!',
      category: 'promotions'
    },
    {
      id: 'wallet_credited',
      name: 'Wallet Credit',
      type: 'general',
      title: 'Wallet Updated',
      message: 'Your wallet has been credited with {amount} coins. Happy shopping!',
      category: 'wallet'
    },
    {
      id: 'low_stock',
      name: 'Low Stock Alert',
      type: 'offer',
      title: 'Hurry! Limited Stock',
      message: 'Your favorite item is running low on stock. Order now before it\'s gone!',
      category: 'inventory'
    },
    {
      id: 'referral_bonus',
      name: 'Referral Bonus',
      type: 'general',
      title: 'Referral Bonus Earned!',
      message: 'Congratulations! You\'ve earned {amount} coins for referring a friend.',
      category: 'referral'
    },
    {
      id: 'birthday_wish',
      name: 'Birthday Special',
      type: 'promotional',
      title: 'Happy Birthday! 🎉',
      message: 'Wishing you a wonderful birthday! Enjoy a special discount just for you.',
      category: 'special_occasions'
    },
    {
      id: 'cart_abandoned',
      name: 'Cart Reminder',
      type: 'promotional',
      title: 'Items waiting in your cart',
      message: 'You left some great items in your cart. Complete your purchase now!',
      category: 'retargeting'
    }
  ];

  res.json({
    success: true,
    templates
  });
};

// Get notification statistics
export const getNotificationStatistics = async (req, res) => {
  const { period = '30d' } = req.query;

  // Calculate date range
  const now = new Date();
  let startDate;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  try {
    // Overall statistics
    const overallStats = await Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalSent: { $sum: 1 },
          totalRead: { $sum: { $cond: ['$isRead', 1, 0] } },
          byType: {
            $push: {
              type: '$type',
              status: '$status',
              isRead: '$isRead'
            }
          }
        }
      }
    ]);

    // Statistics by type
    const statsByType = await Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          read: { $sum: { $cond: ['$isRead', 1, 0] } },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      }
    ]);

    // Daily notification trends
    const dailyTrends = await Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
    ]);

    // Recent notifications
    const recentNotifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'name email')
      .populate('adminId', 'name email', 'Admin')
      .select('title message type status sentChannels createdAt isRead')
      .lean();

    const stats = overallStats[0] || { totalSent: 0, totalRead: 0 };
    const readRate = stats.totalSent > 0 ? (stats.totalRead / stats.totalSent) * 100 : 0;

    res.json({
      success: true,
      statistics: {
        total: stats.totalSent,
        read: stats.totalRead,
        readRate: Math.round(readRate),
        byType: statsByType,
        dailyTrends,
        recentNotifications
      }
    });

  } catch (error) {
    console.error('Error fetching notification statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification statistics'
    });
  }
};

// Get scheduled notifications
export const getScheduledNotifications = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [notifications, total] = await Promise.all([
      Notification.find({ 
        status: 'scheduled',
        scheduledFor: { $gt: new Date() }
      })
        .sort({ scheduledFor: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'name email')
        .populate('adminId', 'name email', 'Admin')
        .lean(),
      Notification.countDocuments({ 
        status: 'scheduled',
        scheduledFor: { $gt: new Date() }
      })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      notifications,
      total,
      page: parseInt(page),
      totalPages,
      hasMore: parseInt(page) < totalPages
    });

  } catch (error) {
    console.error('Error fetching scheduled notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch scheduled notifications'
    });
  }
};

// Cancel scheduled notification
export const cancelScheduledNotification = async (req, res) => {
  const { notificationId } = req.params;

  try {
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: notificationId, 
        status: 'scheduled',
        scheduledFor: { $gt: new Date() }
      },
      { 
        status: 'cancelled',
        cancelledAt: new Date()
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled notification not found or cannot be cancelled'
      });
    }

    res.json({
      success: true,
      message: 'Notification cancelled successfully',
      notification
    });

  } catch (error) {
    console.error('Error cancelling notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel notification'
    });
  }
};

export default {
  sendNotificationToUsers,
  sendBroadcastNotification,
  getNotificationTemplates,
  getNotificationStatistics,
  getScheduledNotifications,
  cancelScheduledNotification
};
