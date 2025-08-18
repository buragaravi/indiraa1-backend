import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Admin from '../models/Admin.js';
import { sendPushNotification } from './pushNotificationService.js';
import { sendEmail } from './emailService.js';
import { sendSMS } from './smsService.js';

class NotificationService {
  
  // Create and send notification
  async createNotification({
    title,
    message,
    type = 'general',
    recipientType = 'user',
    userId = null,
    adminId = null,
    deliveryAgentId = null,
    imageUrl = null,
    actionUrl = null,
    actionText = null,
    priority = 'normal',
    category = null,
    channels = ['in_app', 'push'],
    scheduledFor = null,
    expiresAt = null,
    relatedOrderId = null,
    relatedProductId = null,
    relatedTransactionId = null,
    data = {},
    createdBy = null
  }) {
    try {
      // Create notification document
      const notification = new Notification({
        title,
        message,
        type,
        recipientType,
        userId,
        adminId,
        deliveryAgentId,
        imageUrl,
        actionUrl,
        actionText,
        priority,
        category,
        channels,
        scheduledFor: scheduledFor || new Date(),
        expiresAt,
        relatedOrderId,
        relatedProductId,
        relatedTransactionId,
        data,
        createdBy
      });

      await notification.save();

      // Send immediately if not scheduled
      if (!scheduledFor || new Date(scheduledFor) <= new Date()) {
        await this.sendNotification(notification._id);
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Send notification through specified channels
  async sendNotification(notificationId) {
    try {
      const notification = await Notification.findById(notificationId)
        .populate('userId', 'name email phone pushToken pushTokens notificationPreferences')
        .populate('adminId', 'name email phone pushToken pushTokens')
        .populate('deliveryAgentId', 'name email phone pushToken pushTokens');

      if (!notification) {
        throw new Error('Notification not found');
      }

      const recipient = notification.userId || notification.adminId || notification.deliveryAgentId;
      if (!recipient) {
        throw new Error('Recipient not found');
      }

      const sentChannels = [];
      const failedChannels = [];

      // Send through each specified channel
      for (const channel of notification.channels) {
        try {
          switch (channel) {
            case 'push': {
              const tokens = [];
              if (Array.isArray(recipient.pushTokens) && recipient.pushTokens.length) {
                tokens.push(...recipient.pushTokens);
              }
              if (recipient.pushToken) {
                tokens.push(recipient.pushToken);
              }
              const uniqueTokens = [...new Set(tokens.filter(Boolean))];
              if (uniqueTokens.length > 0) {
                await this.sendPushNotification(notification, { ...recipient, pushTokens: uniqueTokens });
                sentChannels.push('push');
              }
              break;
            }

            case 'email':
              if (recipient.email) {
                await this.sendEmailNotification(notification, recipient);
                sentChannels.push('email');
              }
              break;

            case 'sms':
              if (recipient.phone) {
                await this.sendSMSNotification(notification, recipient);
                sentChannels.push('sms');
              }
              break;

            case 'in_app':
              // In-app notifications are stored in database by default
              sentChannels.push('in_app');
              break;
          }
        } catch (channelError) {
          console.error(`Failed to send ${channel} notification:`, channelError);
          failedChannels.push(channel);
        }
      }

      // Update notification status
      notification.sentChannels = sentChannels;
      notification.failedChannels = failedChannels;
      notification.status = sentChannels.length > 0 ? 'sent' : 'failed';
      notification.sentAt = new Date();
      
      await notification.save();

      return {
        success: true,
        sentChannels,
        failedChannels
      };
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  // Send push notification
  async sendPushNotification(notification, recipient) {
    const pushPayload = {
      title: notification.title,
      body: notification.message,
      data: {
        notificationId: notification._id.toString(),
        type: notification.type,
        actionUrl: notification.actionUrl,
        ...notification.data
      }
    };

    if (notification.imageUrl) {
      pushPayload.imageUrl = notification.imageUrl;
    }

  await sendPushNotification(recipient.pushTokens || [], pushPayload);
  }

  // Send email notification
  async sendEmailNotification(notification, recipient) {
    const emailData = {
      subject: notification.title,
      template: 'notification',
      data: {
        recipientName: recipient.name,
        title: notification.title,
        message: notification.message,
        actionUrl: notification.actionUrl,
        actionText: notification.actionText,
        imageUrl: notification.imageUrl,
        type: notification.type
      }
    };

    await sendEmail(recipient.email, emailData);
  }

  // Send SMS notification
  async sendSMSNotification(notification, recipient) {
    let smsMessage = notification.message;
    
    // Truncate message if too long for SMS
    if (smsMessage.length > 160) {
      smsMessage = smsMessage.substring(0, 157) + '...';
    }

    await sendSMS(recipient.phone, smsMessage);
  }

  // Order related notifications
  async sendOrderNotification(orderId, status, userId) {
    const statusMessages = {
      'pending': {
        title: 'Order Received!',
        message: `Your order #${orderId} has been received and is being processed.`,
        type: 'order'
      },
      'confirmed': {
        title: 'Order Confirmed!',
        message: `Your order #${orderId} has been confirmed and will be prepared soon.`,
        type: 'order'
      },
      'processing': {
        title: 'Order Being Prepared',
        message: `Your order #${orderId} is being prepared for shipment.`,
        type: 'order'
      },
      'shipped': {
        title: 'Order Shipped!',
        message: `Great news! Your order #${orderId} has been shipped and is on its way.`,
        type: 'order'
      },
      'out_for_delivery': {
        title: 'Out for Delivery',
        message: `Your order #${orderId} is out for delivery and will reach you soon.`,
        type: 'order'
      },
      'delivered': {
        title: 'Order Delivered!',
        message: `Your order #${orderId} has been delivered successfully. Enjoy your purchase!`,
        type: 'order'
      },
      'cancelled': {
        title: 'Order Cancelled',
        message: `Your order #${orderId} has been cancelled. Refund will be processed if applicable.`,
        type: 'order'
      }
    };

    const notificationData = statusMessages[status];
    if (!notificationData) return;

    return await this.createNotification({
      ...notificationData,
      userId,
      category: 'order_updates',
      relatedOrderId: orderId,
      actionUrl: `/orders/${orderId}`,
      actionText: 'View Order',
      channels: ['in_app', 'push', 'email']
    });
  }

  // Wallet related notifications
  async sendWalletNotification(userId, type, amount, description) {
    const isCredit = type === 'credit';
    
    return await this.createNotification({
      title: isCredit ? 'Wallet Credited!' : 'Wallet Debited',
      message: `₹${amount} has been ${isCredit ? 'added to' : 'deducted from'} your wallet. ${description}`,
      type: 'wallet',
      userId,
      category: 'wallet',
      actionUrl: '/wallet',
      actionText: 'View Wallet',
      channels: ['in_app', 'push'],
      data: { amount, type, description }
    });
  }

  // Referral notifications
  async sendReferralNotification(userId, type, data = {}) {
    const notifications = {
      'referral_signup': {
        title: 'Friend Joined!',
        message: `Your friend ${data.friendName} joined using your referral code. You'll earn coins when they make their first purchase!`,
        actionText: 'View Referrals'
      },
      'referral_reward': {
        title: 'Referral Bonus Earned!',
        message: `Congratulations! You've earned ₹${data.amount} coins for referring ${data.friendName}.`,
        actionText: 'View Wallet'
      }
    };

    const notificationData = notifications[type];
    if (!notificationData) return;

    return await this.createNotification({
      ...notificationData,
      type: 'referral',
      userId,
      category: 'referrals',
      actionUrl: type === 'referral_reward' ? '/wallet' : '/referrals',
      channels: ['in_app', 'push'],
      data
    });
  }

  // Admin notifications
  async sendAdminNotification(adminId, title, message, type = 'admin', data = {}) {
    return await this.createNotification({
      title,
      message,
      type,
      recipientType: 'admin',
      adminId,
      category: 'admin_alerts',
      channels: ['in_app', 'push'],
      data
    });
  }

  // Broadcast notifications
  async sendBroadcastNotification({
    title,
    message,
    type = 'general',
    recipientType = 'user',
    filters = {},
    channels = ['in_app', 'push'],
    scheduledFor = null,
    ...otherData
  }) {
    try {
      let recipients = [];

      // Get recipients based on type and filters
      if (recipientType === 'user') {
        recipients = await User.find(filters).select('_id');
      } else if (recipientType === 'admin') {
        recipients = await Admin.find(filters).select('_id');
      }

      const notifications = [];

      // Create individual notifications for each recipient
      for (const recipient of recipients) {
        const notificationData = {
          title,
          message,
          type,
          recipientType,
          channels,
          scheduledFor,
          ...otherData
        };

        if (recipientType === 'user') {
          notificationData.userId = recipient._id;
        } else if (recipientType === 'admin') {
          notificationData.adminId = recipient._id;
        }

        const notification = await this.createNotification(notificationData);
        notifications.push(notification);
      }

      return {
        success: true,
        count: notifications.length,
        notifications
      };
    } catch (error) {
      console.error('Error sending broadcast notification:', error);
      throw error;
    }
  }

  // Get user notifications with pagination
  async getUserNotifications(userId, page = 1, limit = 20, filters = {}) {
    const skip = (page - 1) * limit;
    const query = { userId, ...filters };

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('relatedOrderId', 'orderNumber totalAmount')
        .populate('relatedProductId', 'name images')
        .lean(),
      Notification.countDocuments(query)
    ]);

    return {
      notifications,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit)
    };
  }

  // Get unread count
  async getUnreadCount(userId, recipientType = 'user') {
    return await Notification.getUnreadCount(userId, recipientType);
  }

  // Mark notifications as read
  async markAsRead(notificationIds, userId) {
    return await Notification.updateMany(
      { 
        _id: { $in: notificationIds }, 
        userId,
        isRead: false 
      },
      { 
        isRead: true, 
        readAt: new Date() 
      }
    );
  }

  // Mark all as read
  async markAllAsRead(userId, recipientType = 'user') {
    return await Notification.markAllAsRead(userId, recipientType);
  }

  // Delete notifications
  async deleteNotifications(notificationIds, userId) {
    return await Notification.deleteMany({
      _id: { $in: notificationIds },
      userId
    });
  }

  // Clean up expired notifications
  async cleanupExpiredNotifications() {
    const result = await Notification.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    console.log(`Cleaned up ${result.deletedCount} expired notifications`);
    return result;
  }
}

export default new NotificationService();
