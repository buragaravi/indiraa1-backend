// Web Push Notification Service for Backend
import webpush from 'web-push'
import User from '../models/User.js'

// Configure web-push with VAPID keys from environment
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:support@indiraa1.com'

if (!vapidPublicKey || !vapidPrivateKey) {
  console.error('❌ VAPID keys not found in environment variables')
  console.log('Please add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to your .env file')
} else {
  try {
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)
    console.log('✅ Web Push VAPID configured successfully')
  } catch (error) {
    console.error('❌ Failed to configure VAPID keys:', error.message)
    console.log('Please check your VAPID keys in the .env file')
  }
}

// Store user subscription
export async function storeUserSubscription(userId, subscription) {
  try {
    const user = await User.findById(userId)
    if (!user) {
      throw new Error('User not found')
    }

    // Store the subscription in user profile
    user.webPushSubscription = {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      expirationTime: subscription.expirationTime,
      createdAt: new Date(),
      userAgent: subscription.userAgent || 'Unknown'
    }

    await user.save()
    console.log(`✅ Stored web push subscription for user ${userId}`)
    return true
  } catch (error) {
    console.error('❌ Failed to store subscription:', error)
    throw error
  }
}

// Send web push notification to specific user
export async function sendWebPushNotification(userId, payload) {
  try {
    const user = await User.findById(userId)
    if (!user || !user.webPushSubscription) {
      console.log(`⚠️ No web push subscription found for user ${userId}`)
      return false
    }

    const subscription = {
      endpoint: user.webPushSubscription.endpoint,
      keys: user.webPushSubscription.keys
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/badge-72.png',
      tag: payload.tag || 'default',
      data: payload.data || {},
      actions: payload.actions || [],
      requireInteraction: payload.requireInteraction || false,
      timestamp: Date.now()
    })

    const result = await webpush.sendNotification(subscription, notificationPayload)
    console.log(`✅ Web push notification sent to user ${userId}`)
    return result
  } catch (error) {
    console.error(`❌ Failed to send web push notification to user ${userId}:`, error)
    
    // Remove invalid subscription
    if (error.statusCode === 410 || error.statusCode === 404) {
      await removeUserSubscription(userId)
      console.log(`🗑️ Removed invalid subscription for user ${userId}`)
    }
    
    throw error
  }
}

// Send notification to multiple users
export async function sendBulkWebPushNotifications(userIds, payload) {
  const results = []
  
  for (const userId of userIds) {
    try {
      const result = await sendWebPushNotification(userId, payload)
      results.push({ userId, success: true, result })
    } catch (error) {
      results.push({ userId, success: false, error: error.message })
    }
  }
  
  const successCount = results.filter(r => r.success).length
  console.log(`📊 Bulk notification results: ${successCount}/${userIds.length} successful`)
  
  return results
}

// Remove user subscription
export async function removeUserSubscription(userId) {
  try {
    const user = await User.findById(userId)
    if (user) {
      user.webPushSubscription = undefined
      await user.save()
      console.log(`🗑️ Removed web push subscription for user ${userId}`)
    }
  } catch (error) {
    console.error(`❌ Failed to remove subscription for user ${userId}:`, error)
  }
}

// Predefined notification types for different operations

// 1. Order-related notifications
export async function notifyOrderPlaced(userId, orderData) {
  const payload = {
    title: 'Order Placed Successfully! 🎉',
    body: `Your order #${orderData.orderId} has been placed successfully. Total: ₹${orderData.total}`,
    tag: `order-${orderData.orderId}`,
    data: {
      type: 'order',
      orderId: orderData.orderId,
      url: `/orders/${orderData.orderId}`
    },
    actions: [
      { action: 'view', title: 'View Order', icon: '/view-icon.png' },
      { action: 'track', title: 'Track Package', icon: '/track-icon.png' }
    ]
  }
  
  return await sendWebPushNotification(userId, payload)
}

export async function notifyOrderStatusUpdate(userId, orderData) {
  const statusMessages = {
    confirmed: 'Your order has been confirmed! 📦',
    processing: 'Your order is being processed! ⚙️',
    shipped: 'Your order has been shipped! 🚚',
    delivered: 'Your order has been delivered! ✅',
    cancelled: 'Your order has been cancelled. 😔'
  }
  
  const payload = {
    title: 'Order Status Update',
    body: `Order #${orderData.orderId}: ${statusMessages[orderData.status] || `Status updated to ${orderData.status}`}`,
    tag: `order-${orderData.orderId}`,
    data: {
      type: 'order-status',
      orderId: orderData.orderId,
      status: orderData.status,
      url: `/orders/${orderData.orderId}`
    },
    actions: [
      { action: 'view', title: 'View Order', icon: '/view-icon.png' }
    ]
  }
  
  return await sendWebPushNotification(userId, payload)
}

// 2. Cart-related notifications
export async function notifyCartReminder(userId, cartData) {
  const payload = {
    title: 'Don\'t forget your cart! 🛒',
    body: `You have ${cartData.itemCount} items waiting for you. Complete your purchase now!`,
    tag: 'cart-reminder',
    data: {
      type: 'cart',
      itemCount: cartData.itemCount,
      url: '/cart'
    },
    actions: [
      { action: 'view-cart', title: 'View Cart', icon: '/cart-icon.png' },
      { action: 'checkout', title: 'Checkout Now', icon: '/checkout-icon.png' }
    ]
  }
  
  return await sendWebPushNotification(userId, payload)
}

// 3. Wishlist-related notifications
export async function notifyPriceDrop(userId, productData) {
  const payload = {
    title: 'Price Drop Alert! 💰',
    body: `${productData.name} is now ${productData.discountPercentage}% off! Limited time offer.`,
    tag: `price-drop-${productData.id}`,
    data: {
      type: 'price-drop',
      productId: productData.id,
      originalPrice: productData.originalPrice,
      salePrice: productData.salePrice,
      url: `/products/${productData.id}`
    },
    actions: [
      { action: 'view', title: 'View Product', icon: '/view-icon.png' },
      { action: 'buy', title: 'Buy Now', icon: '/cart-icon.png' }
    ]
  }
  
  return await sendWebPushNotification(userId, payload)
}

export async function notifyWishlistBackInStock(userId, productData) {
  const payload = {
    title: 'Back in Stock! 📦',
    body: `Good news! ${productData.name} from your wishlist is now available.`,
    tag: `stock-${productData.id}`,
    data: {
      type: 'back-in-stock',
      productId: productData.id,
      url: `/products/${productData.id}`
    },
    actions: [
      { action: 'view', title: 'View Product', icon: '/view-icon.png' },
      { action: 'buy', title: 'Add to Cart', icon: '/cart-icon.png' }
    ]
  }
  
  return await sendWebPushNotification(userId, payload)
}

// 4. Promotional notifications
export async function notifyPromotion(userId, promoData) {
  const payload = {
    title: promoData.title || 'Special Offer! 🎁',
    body: promoData.message,
    tag: `promo-${promoData.id}`,
    data: {
      type: 'promotion',
      promoId: promoData.id,
      code: promoData.code,
      url: promoData.url || '/products'
    },
    actions: [
      { action: 'shop', title: 'Shop Now', icon: '/shop-icon.png' },
      { action: 'save', title: 'Save Offer', icon: '/save-icon.png' }
    ]
  }
  
  return await sendWebPushNotification(userId, payload)
}

// 5. Wallet-related notifications
export async function notifyWalletUpdate(userId, walletData) {
  const payload = {
    title: 'Wallet Update 💰',
    body: `₹${walletData.amount} ${walletData.type === 'credit' ? 'added to' : 'deducted from'} your Indira Coins wallet.`,
    tag: 'wallet-update',
    data: {
      type: 'wallet',
      amount: walletData.amount,
      transactionType: walletData.type,
      url: '/wallet'
    },
    actions: [
      { action: 'view-wallet', title: 'View Wallet', icon: '/wallet-icon.png' }
    ]
  }
  
  return await sendWebPushNotification(userId, payload)
}

// 6. Referral notifications
export async function notifyReferralSuccess(userId, referralData) {
  const payload = {
    title: 'Referral Reward! 🎉',
    body: `You've earned ₹${referralData.reward} for referring ${referralData.friendName}!`,
    tag: 'referral-reward',
    data: {
      type: 'referral',
      reward: referralData.reward,
      friendName: referralData.friendName,
      url: '/wallet'
    },
    actions: [
      { action: 'view-wallet', title: 'View Wallet', icon: '/wallet-icon.png' }
    ]
  }
  
  return await sendWebPushNotification(userId, payload)
}

// Admin notifications
export async function notifyAdminNewOrder(adminUserIds, orderData) {
  const payload = {
    title: 'New Order Received! 📋',
    body: `Order #${orderData.orderId} placed by ${orderData.customerName}. Amount: ₹${orderData.total}`,
    tag: `admin-order-${orderData.orderId}`,
    data: {
      type: 'admin-order',
      orderId: orderData.orderId,
      customerName: orderData.customerName,
      total: orderData.total,
      url: `/admin/orders/${orderData.orderId}`
    },
    actions: [
      { action: 'view', title: 'View Order', icon: '/admin-icon.png' },
      { action: 'process', title: 'Process Order', icon: '/process-icon.png' }
    ]
  }
  
  return await sendBulkWebPushNotifications(adminUserIds, payload)
}

// Utility function to get all users with active subscriptions
export async function getUsersWithSubscriptions() {
  try {
    const users = await User.find({
      'webPushSubscription.endpoint': { $exists: true, $ne: null }
    }).select('_id name email webPushSubscription')
    
    return users
  } catch (error) {
    console.error('❌ Failed to get users with subscriptions:', error)
    return []
  }
}

// Test notification function
export async function sendTestNotification(userId) {
  const payload = {
    title: 'Test Notification 🔔',
    body: 'This is a test notification from Indiraa1 PWA!',
    tag: 'test',
    data: {
      type: 'test',
      timestamp: Date.now(),
      url: '/'
    }
  }
  
  return await sendWebPushNotification(userId, payload)
}
