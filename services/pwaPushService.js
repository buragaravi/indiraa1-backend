// Enhanced Push Notification Service for PWA
import webpush from 'web-push'
import { User } from '../models/User.js'
import { Admin } from '../models/Admin.js'

// VAPID keys configuration
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BG3Gx8HYNaOQfMnT...', // Replace with your actual VAPID public key
  privateKey: process.env.VAPID_PRIVATE_KEY || 'YOUR_VAPID_PRIVATE_KEY_HERE', // Replace with your actual VAPID private key
  subject: process.env.VAPID_EMAIL || 'mailto:admin@indiraa1.com'
}

let pwaPushConfigured = false;

// Initialize web-push
try {
  if (vapidKeys.publicKey && vapidKeys.privateKey && !vapidKeys.publicKey.includes('...')) {
    const formattedSubject = vapidKeys.subject.startsWith('mailto:') ? vapidKeys.subject : `mailto:${vapidKeys.subject}`;
    webpush.setVapidDetails(
      formattedSubject,
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
    pwaPushConfigured = true;
    console.log('✅ PWA Push VAPID configured successfully');
  } else {
    console.warn('⚠️ PWA Push VAPID keys not properly configured, skipping');
  }
} catch (error) {
  console.warn('⚠️ Failed to configure PWA Push VAPID keys:', error.message);
  pwaPushConfigured = false;
}

class PWAPushNotificationService {
  constructor() {
    this.notificationQueue = []
    this.retryAttempts = 3
    this.retryDelay = 5000 // 5 seconds
  }

  // Store push subscription for a user
  async storePushSubscription(userId, subscription) {
    try {
      await User.findByIdAndUpdate(userId, {
        $set: { 
          'pushSubscription': subscription,
          'pushSubscriptionUpdated': new Date()
        }
      })
      
      console.log(`✅ Push subscription stored for user: ${userId}`)
      return { success: true }
    } catch (error) {
      console.error('❌ Failed to store push subscription:', error)
      throw error
    }
  }

  // Send push notification to specific user
  async sendToUser(userId, notification) {
    try {
      const user = await User.findById(userId).select('pushSubscription name email')
      if (!user || !user.pushSubscription) {
        console.log(`⚠️ No push subscription found for user: ${userId}`)
        return { success: false, reason: 'No subscription' }
      }

      const personalizedNotification = this.personalizeNotification(notification, user)
      const result = await this.sendPushNotification(user.pushSubscription, personalizedNotification)
      
      if (result.success) {
        await this.logNotification(userId, personalizedNotification, 'sent')
      }
      
      return result
    } catch (error) {
      console.error(`❌ Failed to send notification to user ${userId}:`, error)
      await this.logNotification(userId, notification, 'failed', error.message)
      return { success: false, error: error.message }
    }
  }

  // Send to multiple users
  async sendToUsers(userIds, notification) {
    const results = []
    
    for (const userId of userIds) {
      const result = await this.sendToUser(userId, notification)
      results.push({ userId, ...result })
    }
    
    return results
  }

  // Send to all active users
  async sendToAllUsers(notification) {
    try {
      const users = await User.find({ 
        pushSubscription: { $exists: true, $ne: null },
        isActive: true 
      }).select('_id')
      
      const userIds = users.map(user => user._id.toString())
      return await this.sendToUsers(userIds, notification)
    } catch (error) {
      console.error('❌ Failed to send to all users:', error)
      throw error
    }
  }

  // Core push notification sending function
  async sendPushNotification(subscription, notification, attempt = 1) {
    try {
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/icon-192.png',
        badge: notification.badge || '/badge-72.png',
        image: notification.image,
        tag: notification.tag,
        data: notification.data || {},
        actions: notification.actions || [],
        requireInteraction: notification.requireInteraction || false,
        vibrate: notification.vibrate || [200, 100, 200],
        timestamp: Date.now()
      })

      const options = {
        TTL: 24 * 60 * 60, // 24 hours
        vapidDetails: {
          subject: vapidKeys.subject,
          publicKey: vapidKeys.publicKey,
          privateKey: vapidKeys.privateKey
        }
      }

      await webpush.sendNotification(subscription, payload, options)
      
      console.log('✅ Push notification sent successfully')
      return { success: true, attempt }
      
    } catch (error) {
      console.error(`❌ Push notification failed (attempt ${attempt}):`, error)
      
      // Handle specific errors
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription is no longer valid, remove it
        await this.removeInvalidSubscription(subscription)
        return { success: false, reason: 'Invalid subscription', removeSubscription: true }
      }
      
      // Retry for other errors
      if (attempt < this.retryAttempts) {
        console.log(`🔄 Retrying push notification (attempt ${attempt + 1})...`)
        await new Promise(resolve => setTimeout(resolve, this.retryDelay))
        return await this.sendPushNotification(subscription, notification, attempt + 1)
      }
      
      return { success: false, error: error.message, attempts: attempt }
    }
  }

  // Personalize notification based on user data
  personalizeNotification(notification, user) {
    const personalized = { ...notification }
    
    // Replace placeholders with user data
    if (personalized.title) {
      personalized.title = personalized.title
        .replace('{userName}', user.name || 'Valued Customer')
        .replace('{userFirstName}', (user.name || '').split(' ')[0] || 'Customer')
    }
    
    if (personalized.body) {
      personalized.body = personalized.body
        .replace('{userName}', user.name || 'Valued Customer')
        .replace('{userFirstName}', (user.name || '').split(' ')[0] || 'Customer')
    }
    
    return personalized
  }

  // Remove invalid subscription
  async removeInvalidSubscription(subscription) {
    try {
      await User.updateMany(
        { 'pushSubscription.endpoint': subscription.endpoint },
        { $unset: { pushSubscription: 1 } }
      )
      console.log('🗑️ Removed invalid push subscription')
    } catch (error) {
      console.error('❌ Failed to remove invalid subscription:', error)
    }
  }

  // Log notification for analytics
  async logNotification(userId, notification, status, error = null) {
    try {
      // You can store this in a notifications log collection
      const logEntry = {
        userId,
        title: notification.title,
        type: notification.data?.type || 'general',
        status, // 'sent', 'failed', 'delivered'
        timestamp: new Date(),
        error
      }
      
      // Store in database or analytics service
      console.log('📊 Notification log:', logEntry)
    } catch (error) {
      console.error('❌ Failed to log notification:', error)
    }
  }

  // Predefined notification templates
  getNotificationTemplates() {
    return {
      // Order notifications
      ORDER_CONFIRMED: {
        title: 'Order Confirmed! 🎉',
        body: 'Hi {userName}! Your order #{orderId} has been confirmed and is being processed.',
        icon: '/order-icon.png',
        tag: 'order-confirmed',
        actions: [
          { action: 'view-order', title: 'View Order' },
          { action: 'track', title: 'Track Package' }
        ]
      },
      
      ORDER_SHIPPED: {
        title: 'Order Shipped! 📦',
        body: 'Great news {userFirstName}! Your order #{orderId} is on its way.',
        icon: '/shipping-icon.png',
        tag: 'order-shipped',
        actions: [
          { action: 'track', title: 'Track Package' },
          { action: 'view-order', title: 'View Order' }
        ]
      },
      
      ORDER_DELIVERED: {
        title: 'Order Delivered! ✅',
        body: 'Your order #{orderId} has been delivered. Hope you love it!',
        icon: '/delivered-icon.png',
        tag: 'order-delivered',
        actions: [
          { action: 'review', title: 'Write Review' },
          { action: 'view-order', title: 'View Order' }
        ]
      },
      
      // Cart notifications
      CART_ABANDONED: {
        title: 'Don\'t Forget Your Cart! 🛒',
        body: 'Hi {userFirstName}, you have {itemCount} items waiting in your cart.',
        icon: '/cart-icon.png',
        tag: 'cart-reminder',
        actions: [
          { action: 'view-cart', title: 'View Cart' },
          { action: 'checkout', title: 'Checkout Now' }
        ]
      },
      
      // Wishlist notifications
      PRICE_DROP: {
        title: 'Price Drop Alert! 💰',
        body: '{productName} from your wishlist is now {discountPercentage}% off!',
        icon: '/price-drop-icon.png',
        tag: 'price-drop',
        actions: [
          { action: 'view-product', title: 'View Product' },
          { action: 'buy-now', title: 'Buy Now' }
        ]
      },
      
      BACK_IN_STOCK: {
        title: 'Back in Stock! 🎯',
        body: '{productName} from your wishlist is back in stock!',
        icon: '/stock-icon.png',
        tag: 'back-in-stock',
        actions: [
          { action: 'view-product', title: 'View Product' },
          { action: 'add-to-cart', title: 'Add to Cart' }
        ]
      },
      
      // Promotional notifications
      FLASH_SALE: {
        title: 'Flash Sale Alert! ⚡',
        body: 'Limited time: Up to {discountPercentage}% off on your favorite categories!',
        icon: '/flash-sale-icon.png',
        tag: 'flash-sale',
        requireInteraction: true,
        actions: [
          { action: 'shop-now', title: 'Shop Now' },
          { action: 'view-deals', title: 'View All Deals' }
        ]
      },
      
      PERSONALIZED_OFFER: {
        title: 'Exclusive Offer Just for You! 🎁',
        body: 'Hi {userFirstName}, enjoy {discountPercentage}% off on your next purchase!',
        icon: '/offer-icon.png',
        tag: 'personalized-offer',
        actions: [
          { action: 'claim-offer', title: 'Claim Offer' },
          { action: 'shop-now', title: 'Shop Now' }
        ]
      },
      
      // Wallet notifications
      COINS_EARNED: {
        title: 'Indira Coins Earned! 🪙',
        body: 'You\'ve earned {coinsEarned} Indira Coins from your recent purchase!',
        icon: '/coins-icon.png',
        tag: 'coins-earned',
        actions: [
          { action: 'view-wallet', title: 'View Wallet' },
          { action: 'redeem-coins', title: 'Redeem Coins' }
        ]
      },
      
      // General notifications
      WELCOME: {
        title: 'Welcome to Indiraa1! 🌟',
        body: 'Hi {userName}! Discover amazing products and exclusive offers.',
        icon: '/welcome-icon.png',
        tag: 'welcome',
        actions: [
          { action: 'browse-products', title: 'Browse Products' },
          { action: 'view-offers', title: 'View Offers' }
        ]
      }
    }
  }

  // Send specific notification types
  async sendOrderConfirmation(userId, orderId) {
    const template = this.getNotificationTemplates().ORDER_CONFIRMED
    const notification = {
      ...template,
      data: { type: 'order', orderId, url: `/orders/${orderId}` }
    }
    
    // Replace placeholders
    notification.body = notification.body.replace('{orderId}', orderId)
    
    return await this.sendToUser(userId, notification)
  }

  async sendOrderShipped(userId, orderId, trackingNumber = null) {
    const template = this.getNotificationTemplates().ORDER_SHIPPED
    const notification = {
      ...template,
      data: { 
        type: 'order', 
        orderId, 
        trackingNumber,
        url: `/orders/${orderId}/track` 
      }
    }
    
    notification.body = notification.body.replace('{orderId}', orderId)
    
    return await this.sendToUser(userId, notification)
  }

  async sendOrderDelivered(userId, orderId) {
    const template = this.getNotificationTemplates().ORDER_DELIVERED
    const notification = {
      ...template,
      data: { type: 'order', orderId, url: `/orders/${orderId}` }
    }
    
    notification.body = notification.body.replace('{orderId}', orderId)
    
    return await this.sendToUser(userId, notification)
  }

  async sendCartReminder(userId, itemCount) {
    const template = this.getNotificationTemplates().CART_ABANDONED
    const notification = {
      ...template,
      data: { type: 'cart', url: '/cart' }
    }
    
    notification.body = notification.body.replace('{itemCount}', itemCount)
    
    return await this.sendToUser(userId, notification)
  }

  async sendPriceDropAlert(userId, productId, productName, discountPercentage) {
    const template = this.getNotificationTemplates().PRICE_DROP
    const notification = {
      ...template,
      data: { 
        type: 'wishlist', 
        productId, 
        url: `/products/${productId}` 
      }
    }
    
    notification.body = notification.body
      .replace('{productName}', productName)
      .replace('{discountPercentage}', discountPercentage)
    
    return await this.sendToUser(userId, notification)
  }

  async sendFlashSaleAlert(discountPercentage) {
    const template = this.getNotificationTemplates().FLASH_SALE
    const notification = {
      ...template,
      data: { type: 'promotion', url: '/products?sale=flash' }
    }
    
    notification.body = notification.body.replace('{discountPercentage}', discountPercentage)
    
    return await this.sendToAllUsers(notification)
  }

  async sendCoinsEarned(userId, coinsEarned) {
    const template = this.getNotificationTemplates().COINS_EARNED
    const notification = {
      ...template,
      data: { type: 'wallet', coinsEarned, url: '/wallet' }
    }
    
    notification.body = notification.body.replace('{coinsEarned}', coinsEarned)
    
    return await this.sendToUser(userId, notification)
  }

  async sendWelcomeNotification(userId) {
    const template = this.getNotificationTemplates().WELCOME
    const notification = {
      ...template,
      data: { type: 'welcome', url: '/products' }
    }
    
    return await this.sendToUser(userId, notification)
  }

  // Batch notification sending
  async sendBatchNotifications(notifications) {
    const results = []
    
    for (const notificationConfig of notifications) {
      const { userIds, notification } = notificationConfig
      const batchResult = await this.sendToUsers(userIds, notification)
      results.push(batchResult)
    }
    
    return results
  }

  // Get notification analytics
  async getNotificationStats(dateRange = 7) {
    try {
      // This would query your notification logs
      // Return statistics like sent count, delivery rate, click rate, etc.
      return {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        deliveryRate: 0,
        topNotificationTypes: []
      }
    } catch (error) {
      console.error('❌ Failed to get notification stats:', error)
      return null
    }
  }
}

// Export singleton instance
export const pwaPushService = new PWAPushNotificationService()
export default pwaPushService
