// Web Push Notification Routes
import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import {
  storeUserSubscription,
  sendTestNotification,
  notifyCartReminder,
  notifyPromotion,
  getUsersWithSubscriptions
} from '../services/webPushService.js'

const router = express.Router()

// Public endpoint to fetch VAPID public key (for PWA subscription)
router.get('/public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY || ''
  if (!key) {
    return res.status(500).json({ success: false, message: 'VAPID public key not configured' })
  }
  res.json({ success: true, publicKey: key })
})

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ message: 'Access token required' })
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' })
    }
    req.user = user
    next()
  })
}

// Subscribe to push notifications
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const { subscription, userAgent } = req.body
    const userId = req.user.id

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid subscription data' 
      })
    }

    await storeUserSubscription(userId, { ...subscription, userAgent })

    res.json({
      success: true,
      message: 'Successfully subscribed to push notifications'
    })
  } catch (error) {
    console.error('Subscribe error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to subscribe to push notifications',
      error: error.message
    })
  }
})

// Unsubscribe from push notifications
router.post('/unsubscribe', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    
    const user = await User.findById(userId)
    if (user) {
      user.webPushSubscription = undefined
      await user.save()
    }

    res.json({
      success: true,
      message: 'Successfully unsubscribed from push notifications'
    })
  } catch (error) {
    console.error('Unsubscribe error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to unsubscribe from push notifications',
      error: error.message
    })
  }
})

// Send test notification
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    
    const result = await sendTestNotification(userId)
    
    res.json({
      success: true,
      message: 'Test notification sent successfully',
      result
    })
  } catch (error) {
    console.error('Test notification error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    })
  }
})

// Admin: Send promotional notification to all users
router.post('/promo', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin (you should implement proper admin check)
    const user = await User.findById(req.user.id)
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      })
    }

    const { title, message, promoCode, url } = req.body
    
    const users = await getUsersWithSubscriptions()
    const userIds = users.map(u => u._id.toString())
    
    const promoData = {
      id: Date.now().toString(),
      title,
      message,
      code: promoCode,
      url
    }
    
    const results = []
    for (const userId of userIds) {
      try {
        await notifyPromotion(userId, promoData)
        results.push({ userId, success: true })
      } catch (error) {
        results.push({ userId, success: false, error: error.message })
      }
    }
    
    const successCount = results.filter(r => r.success).length
    
    res.json({
      success: true,
      message: `Promotional notification sent to ${successCount}/${userIds.length} users`,
      results
    })
  } catch (error) {
    console.error('Promo notification error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to send promotional notification',
      error: error.message
    })
  }
})

// Get subscription status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const user = await User.findById(userId).select('webPushSubscription')
    
    res.json({
      success: true,
      subscribed: !!(user && user.webPushSubscription && user.webPushSubscription.endpoint),
      subscription: user?.webPushSubscription ? {
        endpoint: user.webPushSubscription.endpoint,
        createdAt: user.webPushSubscription.createdAt
      } : null
    })
  } catch (error) {
    console.error('Status check error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to check subscription status',
      error: error.message
    })
  }
})

// Admin: Get notification statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      })
    }

    const totalUsers = await User.countDocuments()
    const subscribedUsers = await User.countDocuments({
      'webPushSubscription.endpoint': { $exists: true, $ne: null }
    })
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        subscribedUsers,
        subscriptionRate: totalUsers > 0 ? ((subscribedUsers / totalUsers) * 100).toFixed(2) : 0
      }
    })
  } catch (error) {
    console.error('Stats error:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get notification statistics',
      error: error.message
    })
  }
})

export default router
