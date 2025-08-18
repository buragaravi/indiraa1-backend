# E-Commerce Backend API Documentation

![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)
![Express.js](https://img.shields.io/badge/Express.js-v4.18+-blue.svg)
![MongoDB](https://img.shields.io/badge/MongoDB-v5.0+-green.svg)
![JWT](https://img.shields.io/badge/JWT-Authentication-orange.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

## 📋 Overview

This is a comprehensive e-commerce backend API built with Node.js, Express.js, and MongoDB. It provides a complete solution for managing products, orders, returns, user authentication, batch management, delivery tracking, and analytics.

### 🚀 Key Features

- **Multi-role Authentication**: Users, Admins, Sub-admins, Delivery Agents
- **Product Management**: CRUD operations, variants, bulk upload, reviews
- **Order Processing**: Complete order lifecycle management
- **Return & Refund System**: Comprehensive return management with warehouse integration
- **Batch Management**: Inventory tracking with FIFO/LIFO allocation
- **Delivery Management**: Real-time tracking with OTP verification
- **Analytics Dashboard**: Revenue, return, and performance analytics
- **Referral System**: User referrals with reward management
- **Wallet System**: Virtual wallet with coins and transactions
- **Notification System**: Push notifications and email integration
- **File Upload**: Image handling with compression and CDN support

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.18+
- **Database**: MongoDB 5.0+
- **Authentication**: JWT (JSON Web Tokens)
- **File Storage**: Multer + Local/Cloud Storage
- **Email**: Nodemailer
- **SMS**: Twilio
- **Push Notifications**: Web Push
- **Image Processing**: Sharp
- **Validation**: Joi/Express-validator
- **Security**: Helmet, CORS, Rate Limiting

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+ installed
- MongoDB 5.0+ running
- Git installed

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd backend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env file with your configuration
nano .env

# Start the development server
npm run dev

# Or start production server
npm start
```

### Environment Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/ecommerce

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Email Configuration (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# File Upload
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=5242880

# Twilio (SMS)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890

# Push Notifications
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=admin@yourdomain.com

# Payment Gateway (Optional)
PAYMENT_GATEWAY_KEY=your_payment_key
PAYMENT_GATEWAY_SECRET=your_payment_secret

# Redis (Caching - Optional)
REDIS_URL=redis://localhost:6379
```

## 📁 Project Structure

```
backend/
├── controllers/           # Route controllers
│   ├── authController.js
│   ├── productController.js
│   ├── orderController.js
│   ├── returnController.js
│   └── ...
├── models/               # MongoDB models
│   ├── User.js
│   ├── Product.js
│   ├── Order.js
│   └── ...
├── routes/               # API routes
│   ├── auth.js
│   ├── products.js
│   ├── orders.js
│   └── ...
├── middleware/           # Custom middleware
│   ├── auth.js
│   ├── upload.js
│   └── validation.js
├── services/             # Business logic
│   ├── emailService.js
│   ├── smsService.js
│   └── notificationService.js
├── utils/                # Utility functions
│   ├── helpers.js
│   ├── constants.js
│   └── validators.js
├── uploads/              # File uploads directory
├── tests/                # Test files
├── .env                  # Environment variables
├── package.json          # Dependencies
└── index.js              # Entry point
```

## 🚀 API Endpoints Overview

### Base URL: `http://localhost:5000/api`

| Module | Base Route | Description |
|--------|------------|-------------|
| Authentication | `/auth` | User/Admin login, registration |
| Products | `/products` | Product CRUD, reviews, search |
| Orders | `/products/orders` | Order management |
| Returns | `/returns` | Return & refund management |
| Admin | `/admin` | Admin-specific operations |
| Sub-Admin | `/sub-admin` | Sub-admin management |
| Delivery | `/delivery` | Delivery agent operations |
| Batches | `/batches` | Inventory batch management |
| Analytics | `/analytics` | Revenue & return analytics |
| Banners | `/banners` | Marketing banner management |
| Coupons | `/coupons` | Discount coupon system |
| Wallet | `/wallet` | Virtual wallet operations |
| Referrals | `/referrals` | Referral system |
| Notifications | `/notifications` | Push notifications |

## 🔐 Authentication & Authorization

### User Roles
- **Customer**: Regular users who can place orders
- **Admin**: Full system access
- **Sub-Admin**: Limited admin access (Warehouse Manager, Logistics Manager)
- **Delivery Agent**: Delivery-related operations only

### Token Format
```http
Authorization: Bearer <jwt_token>
```

### Getting Started with Authentication

1. **Register a new user**:
```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "name": "John Doe",
  "phone": "+1234567890"
}
```

2. **Login and get token**:
```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "john_doe",
  "password": "securePassword123"
}
```

3. **Use token in subsequent requests**:
```bash
GET /api/products/orders/user
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 📊 Database Schema

### Core Collections

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| users | Customer accounts | username, email, password, profile |
| admins | Admin accounts | email, password, role, permissions |
| products | Product catalog | name, price, category, stock, images |
| orders | Order management | userId, items, status, delivery |
| returns | Return requests | orderId, items, status, refund |
| batches | Inventory batches | productId, quantity, expiry |
| deliveryagents | Delivery personnel | name, phone, vehicle, zone |
| transactions | Wallet transactions | userId, amount, type, status |
| notifications | Push notifications | userId, title, body, read |

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/auth.test.js

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Structure
```
tests/
├── auth.test.js          # Authentication tests
├── products.test.js      # Product management tests
├── orders.test.js        # Order processing tests
├── returns.test.js       # Return system tests
└── helpers/
    ├── setup.js          # Test setup
    └── fixtures.js       # Test data
```

### API Testing with Postman

1. Import the Postman collection: `postman/API_Collection.json`
2. Set up environment variables in Postman
3. Run the authentication flow to get tokens
4. Test all endpoints systematically

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev          # Start with nodemon (auto-restart)
npm start           # Start production server

# Database
npm run db:seed     # Seed initial data
npm run db:reset    # Reset database
npm run db:backup   # Backup database

# Utilities
npm run lint        # Run ESLint
npm run format      # Format code with Prettier
npm run docs        # Generate API documentation
```

### Code Style

This project uses:
- **ESLint** for code linting
- **Prettier** for code formatting
- **Husky** for git hooks
- **Conventional Commits** for commit messages

## 📈 Performance & Monitoring

### Optimization Features
- Database indexing for optimal query performance
- Redis caching for frequently accessed data
- Image compression and optimization
- Rate limiting to prevent abuse
- Connection pooling for database efficiency

### Monitoring
- Request/response logging
- Error tracking and reporting
- Performance metrics collection
- Health check endpoints

## 🔒 Security Features

### Implementation
- **JWT Authentication** with secure secret rotation
- **Password Hashing** using bcrypt
- **Input Validation** and sanitization
- **Rate Limiting** per endpoint and user
- **CORS Configuration** for cross-origin requests
- **Helmet.js** for security headers
- **File Upload Security** with type validation
- **SQL Injection Prevention** through parameterized queries

### Security Headers
```javascript
// Automatically added by Helmet
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
```

## 🚀 Deployment

### Production Checklist
- [ ] Environment variables configured
- [ ] Database indexes created
- [ ] SSL certificates installed
- [ ] Rate limiting configured
- [ ] Error monitoring setup
- [ ] Backup strategy implemented
- [ ] Load balancer configured (if needed)

### Docker Deployment
```dockerfile
# Dockerfile included in project
docker build -t ecommerce-backend .
docker run -p 5000:5000 ecommerce-backend
```

### PM2 Process Management
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Restart
pm2 restart ecommerce-backend
```

## 📚 Table of Contents
1. [Authentication Module](#authentication-module)
2. [Product Management Module](#product-management-module)
3. [Order Management Module](#order-management-module)
4. [Return & Refund Module](#return--refund-module)
5. [Batch Management Module](#batch-management-module)
6. [Sub-Admin Management Module](#sub-admin-management-module)
7. [Delivery Management Module](#delivery-management-module)
8. [Analytics Module](#analytics-module)
9. [Banner Management Module](#banner-management-module)
10. [Combo Pack Module](#combo-pack-module)
11. [Coupon Management Module](#coupon-management-module)
12. [Wallet Management Module](#wallet-management-module)
13. [Notification Module](#notification-module)

---

## Authentication Module

### Base Route: `/api/auth`

#### 1. User Registration
- **Endpoint**: `POST /api/auth/register`
- **Purpose**: Register a new user with optional referral code
- **Authentication**: None required
- **Request Body**:
```json
{
  "username": "string",
  "password": "string", 
  "name": "string",
  "email": "string",
  "phone": "string",
  "referralCode": "string (optional)"
}
```
- **Response**:
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "user_id",
    "username": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "role": "user"
  },
  "token": "jwt_token"
}
```

#### 2. User Login
- **Endpoint**: `POST /api/auth/login`
- **Purpose**: Authenticate user and return JWT token
- **Authentication**: None required
- **Request Body**:
```json
{
  "username": "string",
  "password": "string"
}
```
- **Response**:
```json
{
  "message": "Login successful",
  "user": {
    "id": "user_id",
    "username": "string",
    "name": "string",
    "email": "string",
    "role": "user"
  },
  "token": "jwt_token"
}
```

#### 3. Admin Login
- **Endpoint**: `POST /api/auth/admin/login`
- **Purpose**: Authenticate admin and return JWT token
- **Authentication**: None required
- **Request Body**:
```json
{
  "email": "string",
  "password": "string"
}
```
- **Response**:
```json
{
  "message": "Admin login successful",
  "admin": {
    "id": "admin_id",
    "email": "string",
    "role": "admin"
  },
  "token": "jwt_token"
}
```

#### 4. Forgot Password
- **Endpoint**: `POST /api/auth/forgot-password`
- **Purpose**: Send password reset OTP to user's email
- **Authentication**: None required
- **Request Body**:
```json
{
  "email": "string"
}
```
- **Response**:
```json
{
  "message": "Password reset OTP sent to your email",
  "otpId": "unique_otp_identifier"
}
```

#### 5. Reset Password
- **Endpoint**: `POST /api/auth/reset-password`
- **Purpose**: Reset password using OTP
- **Authentication**: None required
- **Request Body**:
```json
{
  "otpId": "string",
  "otp": "string",
  "newPassword": "string"
}
```
- **Response**:
```json
{
  "message": "Password reset successfully"
}
```

---

## Product Management Module

### Base Route: `/api/products`

#### 1. Create Product
- **Endpoint**: `POST /api/products`
- **Purpose**: Create a new product with images
- **Authentication**: Admin/Sub-Admin required
- **Request Body** (FormData):
```javascript
{
  name: "string",
  description: "string",
  price: "number",
  category: "string",
  stock: "number",
  images: File[], // Array of image files
  hasVariants: "boolean",
  variants: "JSON string" // If hasVariants is true
}
```
- **Response**:
```json
{
  "message": "Product created successfully",
  "product": {
    "id": "product_id",
    "name": "string",
    "description": "string",
    "price": "number",
    "category": "string",
    "stock": "number",
    "images": ["image_url1", "image_url2"],
    "hasVariants": "boolean",
    "variants": [],
    "createdAt": "timestamp"
  }
}
```

#### 2. Bulk Upload Products
- **Endpoint**: `POST /api/products/bulk-upload`
- **Purpose**: Upload multiple products via CSV/Excel file
- **Authentication**: Admin/Sub-Admin required
- **Request Body** (FormData):
```javascript
{
  file: File, // CSV/Excel file
  images: File[] // Array of product images
}
```
- **Response**:
```json
{
  "message": "Bulk upload completed",
  "results": {
    "successful": "number",
    "failed": "number",
    "errors": ["error_messages"]
  }
}
```

#### 3. Get All Products
- **Endpoint**: `GET /api/products`
- **Purpose**: Retrieve all products with filtering and pagination
- **Authentication**: None required
- **Query Parameters**:
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 10)
  - `category`: Filter by category
  - `search`: Search in name/description
  - `minPrice`: Minimum price filter
  - `maxPrice`: Maximum price filter
- **Response**:
```json
{
  "products": [
    {
      "id": "product_id",
      "name": "string",
      "description": "string",
      "price": "number",
      "category": "string",
      "stock": "number",
      "images": ["image_urls"],
      "averageRating": "number",
      "reviewCount": "number"
    }
  ],
  "pagination": {
    "currentPage": "number",
    "totalPages": "number",
    "totalProducts": "number",
    "hasNextPage": "boolean",
    "hasPrevPage": "boolean"
  }
}
```

#### 4. Get Product by ID
- **Endpoint**: `GET /api/products/:id`
- **Purpose**: Get detailed information about a specific product
- **Authentication**: None required
- **Response**:
```json
{
  "product": {
    "id": "product_id",
    "name": "string",
    "description": "string",
    "price": "number",
    "category": "string",
    "stock": "number",
    "images": ["image_urls"],
    "hasVariants": "boolean",
    "variants": [],
    "averageRating": "number",
    "reviews": [
      {
        "userId": "user_id",
        "userName": "string",
        "rating": "number",
        "comment": "string",
        "createdAt": "timestamp"
      }
    ]
  }
}
```

#### 5. Update Product
- **Endpoint**: `PUT /api/products/:id`
- **Purpose**: Update an existing product
- **Authentication**: Admin/Sub-Admin required
- **Request Body** (FormData):
```javascript
{
  name: "string",
  description: "string",
  price: "number",
  category: "string",
  stock: "number",
  images: File[], // New images to add
  existingImages: "JSON string", // Existing images to keep
  hasVariants: "boolean",
  variants: "JSON string"
}
```
- **Response**:
```json
{
  "message": "Product updated successfully",
  "product": {
    // Updated product object
  }
}
```

#### 6. Delete Product
- **Endpoint**: `DELETE /api/products/:id`
- **Purpose**: Delete a product
- **Authentication**: Admin/Sub-Admin required
- **Response**:
```json
{
  "message": "Product deleted successfully"
}
```

#### 7. Add/Update Product Review
- **Endpoint**: `POST /api/products/:id/reviews`
- **Purpose**: Add or update a review for a product
- **Authentication**: User required
- **Request Body**:
```json
{
  "rating": "number (1-5)",
  "comment": "string"
}
```
- **Response**:
```json
{
  "message": "Review added successfully",
  "review": {
    "userId": "user_id",
    "rating": "number",
    "comment": "string",
    "createdAt": "timestamp"
  }
}
```

#### 8. Get Product Reviews
- **Endpoint**: `GET /api/products/:id/reviews`
- **Purpose**: Get all reviews for a product
- **Authentication**: None required
- **Response**:
```json
{
  "reviews": [
    {
      "userId": "user_id",
      "userName": "string",
      "rating": "number",
      "comment": "string",
      "createdAt": "timestamp"
    }
  ],
  "averageRating": "number",
  "totalReviews": "number"
}
```

---

## Order Management Module

### Base Route: `/api/products` (Order endpoints)

#### 1. Create Order
- **Endpoint**: `POST /api/products/orders`
- **Purpose**: Create a new order
- **Authentication**: User required
- **Request Body**:
```json
{
  "items": [
    {
      "productId": "string",
      "variantId": "string (optional)",
      "quantity": "number"
    }
  ],
  "deliveryAddress": {
    "street": "string",
    "city": "string",
    "state": "string",
    "zipCode": "string",
    "country": "string"
  },
  "paymentMethod": "string", // "upi", "cash", "card"
  "specialInstructions": "string (optional)",
  "deliverySlot": {
    "date": "string",
    "timeSlot": "string"
  }
}
```
- **Response**:
```json
{
  "message": "Order created successfully",
  "order": {
    "id": "order_id",
    "orderNumber": "string",
    "userId": "user_id",
    "items": [],
    "totalAmount": "number",
    "status": "pending",
    "paymentMethod": "string",
    "deliveryAddress": {},
    "deliverySlot": {},
    "createdAt": "timestamp"
  }
}
```

#### 2. Get User Orders
- **Endpoint**: `GET /api/products/orders/user`
- **Purpose**: Get all orders for the authenticated user
- **Authentication**: User required
- **Query Parameters**:
  - `page`: Page number
  - `limit`: Items per page
  - `status`: Filter by order status
- **Response**:
```json
{
  "orders": [
    {
      "id": "order_id",
      "orderNumber": "string",
      "totalAmount": "number",
      "status": "string",
      "paymentMethod": "string",
      "deliverySlot": {},
      "createdAt": "timestamp",
      "items": [
        {
          "productId": "string",
          "productName": "string",
          "quantity": "number",
          "price": "number"
        }
      ]
    }
  ],
  "pagination": {}
}
```

#### 3. Get All Orders (Admin)
- **Endpoint**: `GET /api/products/orders/all`
- **Purpose**: Get all orders (admin/sub-admin access)
- **Authentication**: Admin/Sub-Admin required
- **Query Parameters**:
  - `page`: Page number
  - `limit`: Items per page
  - `status`: Filter by status
  - `paymentMethod`: Filter by payment method
  - `dateFrom`: Start date filter
  - `dateTo`: End date filter
- **Response**:
```json
{
  "orders": [
    {
      "id": "order_id",
      "orderNumber": "string",
      "userId": "user_id",
      "userName": "string",
      "userPhone": "string",
      "totalAmount": "number",
      "status": "string",
      "paymentMethod": "string",
      "deliveryAddress": {},
      "createdAt": "timestamp"
    }
  ],
  "pagination": {},
  "statistics": {
    "totalOrders": "number",
    "totalRevenue": "number",
    "statusCounts": {}
  }
}
```

#### 4. Update Order Status
- **Endpoint**: `PUT /api/products/orders/:id/status`
- **Purpose**: Update order status (admin/sub-admin only)
- **Authentication**: Admin/Sub-Admin required
- **Request Body**:
```json
{
  "status": "string", // "pending", "confirmed", "processing", "shipped", "delivered", "cancelled"
  "note": "string (optional)"
}
```
- **Response**:
```json
{
  "message": "Order status updated successfully",
  "order": {
    "id": "order_id",
    "status": "string",
    "statusHistory": [
      {
        "status": "string",
        "timestamp": "timestamp",
        "note": "string"
      }
    ]
  }
}
```

#### 5. Cancel Order
- **Endpoint**: `POST /api/products/orders/:id/cancel`
- **Purpose**: Cancel an order (user)
- **Authentication**: User required
- **Request Body**:
```json
{
  "reason": "string"
}
```
- **Response**:
```json
{
  "message": "Order cancelled successfully",
  "refundAmount": "number (if applicable)"
}
```

#### 6. Mark Order as Paid
- **Endpoint**: `POST /api/products/orders/:id/mark-paid`
- **Purpose**: Mark order as paid (admin/sub-admin)
- **Authentication**: Admin/Sub-Admin required
- **Request Body**:
```json
{
  "paymentReference": "string (optional)",
  "note": "string (optional)"
}
```
- **Response**:
```json
{
  "message": "Order marked as paid successfully",
  "order": {
    "id": "order_id",
    "paymentStatus": "paid",
    "paidAt": "timestamp"
  }
}
```

---

## Return & Refund Module

### Customer Returns - Base Route: `/api/returns`

#### 1. Create Return Request
- **Endpoint**: `POST /api/returns/request`
- **Purpose**: Create a new return request
- **Authentication**: User required
- **Request Body**:
```json
{
  "orderId": "string",
  "items": [
    {
      "productId": "string",
      "variantId": "string (optional)",
      "quantity": "number",
      "reason": "string",
      "condition": "string" // "defective", "wrong_item", "not_as_described", etc.
    }
  ],
  "returnReason": "string",
  "description": "string",
  "images": ["image_urls"], // Optional proof images
  "preferredRefundMethod": "string" // "original_payment", "wallet", "exchange"
}
```
- **Response**:
```json
{
  "message": "Return request created successfully",
  "returnRequest": {
    "id": "return_id",
    "returnRequestId": "RET-XXXXXXXX",
    "orderId": "string",
    "userId": "string",
    "status": "pending",
    "items": [],
    "returnReason": "string",
    "refundAmount": "number",
    "createdAt": "timestamp"
  }
}
```

#### 2. Get User Returns
- **Endpoint**: `GET /api/returns/my-returns`
- **Purpose**: Get all return requests for authenticated user
- **Authentication**: User required
- **Response**:
```json
{
  "returns": [
    {
      "id": "return_id",
      "returnRequestId": "string",
      "orderId": "string",
      "orderNumber": "string",
      "status": "string",
      "refundAmount": "number",
      "createdAt": "timestamp",
      "items": []
    }
  ]
}
```

#### 3. Get Return Details
- **Endpoint**: `GET /api/returns/:id`
- **Purpose**: Get detailed information about a return request
- **Authentication**: User required
- **Response**:
```json
{
  "returnRequest": {
    "id": "return_id",
    "returnRequestId": "string",
    "orderId": "string",
    "orderDetails": {},
    "items": [],
    "status": "string",
    "returnReason": "string",
    "description": "string",
    "refundAmount": "number",
    "timeline": [
      {
        "status": "string",
        "timestamp": "timestamp",
        "note": "string"
      }
    ],
    "warehouseManagement": {
      "assignedAgent": "string",
      "pickup": {
        "scheduledDate": "timestamp",
        "timeSlot": "string",
        "status": "string"
      },
      "qualityCheck": {
        "status": "string",
        "checkedBy": "string",
        "notes": "string"
      }
    }
  }
}
```

### Admin Returns - Base Route: `/api/admin/returns`

#### 4. Get All Return Requests (Admin)
- **Endpoint**: `GET /api/admin/returns`
- **Purpose**: Get all return requests for admin review
- **Authentication**: Admin required
- **Query Parameters**:
  - `page`: Page number
  - `limit`: Items per page
  - `status`: Filter by status
  - `dateFrom`: Start date filter
  - `dateTo`: End date filter
- **Response**:
```json
{
  "returns": [
    {
      "id": "return_id",
      "returnRequestId": "string",
      "userId": "string",
      "userName": "string",
      "orderId": "string",
      "status": "string",
      "refundAmount": "number",
      "createdAt": "timestamp",
      "priority": "string"
    }
  ],
  "pagination": {},
  "statistics": {
    "totalReturns": "number",
    "pendingReturns": "number",
    "approvedReturns": "number",
    "rejectedReturns": "number"
  }
}
```

#### 5. Review Return Request
- **Endpoint**: `PUT /api/admin/returns/:id/review`
- **Purpose**: Approve or reject a return request
- **Authentication**: Admin required
- **Request Body**:
```json
{
  "status": "string", // "approved", "rejected"
  "adminNotes": "string",
  "refundAmount": "number (optional - if different from calculated)",
  "refundMethod": "string" // "original_payment", "wallet"
}
```
- **Response**:
```json
{
  "message": "Return request reviewed successfully",
  "returnRequest": {
    "id": "return_id",
    "status": "string",
    "adminNotes": "string",
    "reviewedBy": "admin_id",
    "reviewedAt": "timestamp"
  }
}
```

### Warehouse Returns - Base Route: `/api/warehouse/returns`

#### 6. Get Assigned Returns (Warehouse)
- **Endpoint**: `GET /api/warehouse/returns/assigned`
- **Purpose**: Get returns assigned to warehouse for processing
- **Authentication**: Warehouse Manager required
- **Response**:
```json
{
  "returns": [
    {
      "id": "return_id",
      "returnRequestId": "string",
      "status": "approved",
      "items": [],
      "pickupScheduled": "boolean",
      "qualityCheckStatus": "string"
    }
  ]
}
```

#### 7. Update Return Processing
- **Endpoint**: `PUT /api/warehouse/returns/:id/process`
- **Purpose**: Update return processing status
- **Authentication**: Warehouse Manager required
- **Request Body**:
```json
{
  "action": "string", // "schedule_pickup", "quality_check", "process_refund"
  "details": {
    "pickupDate": "string (optional)",
    "timeSlot": "string (optional)",
    "qualityNotes": "string (optional)",
    "condition": "string (optional)"
  }
}
```
- **Response**:
```json
{
  "message": "Return processing updated successfully",
  "returnRequest": {
    "id": "return_id",
    "status": "string",
    "warehouseManagement": {}
  }
}
```

### Delivery Returns - Base Route: `/api/delivery/returns`

#### 8. Get Assigned Pickups (Delivery Agent)
- **Endpoint**: `GET /api/delivery/returns/assigned`
- **Purpose**: Get return pickups assigned to delivery agent
- **Authentication**: Delivery Agent required
- **Response**:
```json
{
  "pickups": [
    {
      "id": "return_id",
      "returnRequestId": "string",
      "customerAddress": {},
      "pickupDate": "string",
      "timeSlot": "string",
      "items": [],
      "status": "assigned"
    }
  ]
}
```

#### 9. Complete Pickup
- **Endpoint**: `POST /api/delivery/returns/:id/pickup`
- **Purpose**: Mark return pickup as completed
- **Authentication**: Delivery Agent required
- **Request Body**:
```json
{
  "note": "string",
  "verificationCode": "string (optional)",
  "customerSignature": "string",
  "actualPackages": "number",
  "condition": "string", // "good", "damaged", "incomplete"
  "completedAt": "timestamp"
}
```
- **Response**:
```json
{
  "message": "Pickup completed successfully",
  "returnRequest": {
    "id": "return_id",
    "status": "picked_up",
    "pickupDetails": {}
  }
}
```

---

## Batch Management Module

### Base Route: `/api/batches`

#### 1. Create Batch
- **Endpoint**: `POST /api/batches/create`
- **Purpose**: Create a new product batch
- **Authentication**: Admin/Sub-Admin required
- **Request Body**:
```json
{
  "productId": "string",
  "variantId": "string (optional)",
  "quantity": "number",
  "batchNumber": "string",
  "manufacturingDate": "string",
  "expiryDate": "string (optional)",
  "supplier": "string (optional)",
  "costPrice": "number (optional)",
  "notes": "string (optional)"
}
```
- **Response**:
```json
{
  "message": "Batch created successfully",
  "batch": {
    "id": "batch_id",
    "productId": "string",
    "batchNumber": "string",
    "quantity": "number",
    "available": "number",
    "allocated": "number",
    "status": "active",
    "manufacturingDate": "string",
    "expiryDate": "string",
    "createdAt": "timestamp"
  }
}
```

#### 2. Get All Batches
- **Endpoint**: `GET /api/batches`
- **Purpose**: Get all batches with filtering
- **Authentication**: Admin/Sub-Admin required
- **Query Parameters**:
  - `productId`: Filter by product
  - `status`: Filter by batch status
  - `expiryDate`: Filter by expiry date
- **Response**:
```json
{
  "batches": [
    {
      "id": "batch_id",
      "productId": "string",
      "productName": "string",
      "batchNumber": "string",
      "quantity": "number",
      "available": "number",
      "allocated": "number",
      "status": "string",
      "expiryDate": "string"
    }
  ]
}
```

#### 3. Allocate Batch to Order
- **Endpoint**: `POST /api/batches/allocate`
- **Purpose**: Allocate batch quantities to an order
- **Authentication**: Admin/Sub-Admin required
- **Request Body**:
```json
{
  "orderId": "string",
  "allocations": [
    {
      "batchId": "string",
      "quantity": "number"
    }
  ]
}
```
- **Response**:
```json
{
  "message": "Batch allocation completed",
  "allocations": [
    {
      "batchId": "string",
      "quantity": "number",
      "remaining": "number"
    }
  ]
}
```

#### 4. Get Batch Analytics
- **Endpoint**: `GET /api/batches/analytics`
- **Purpose**: Get batch management analytics
- **Authentication**: Admin/Sub-Admin required
- **Response**:
```json
{
  "analytics": {
    "totalBatches": "number",
    "activeBatches": "number",
    "expiringSoon": "number",
    "totalInventoryValue": "number",
    "lowStockBatches": "number",
    "recentAllocations": []
  }
}
```

---

## Sub-Admin Management Module

### Base Route: `/api/sub-admin`

#### 1. Create Sub-Admin
- **Endpoint**: `POST /api/sub-admin/create`
- **Purpose**: Create a new sub-admin account
- **Authentication**: Admin required
- **Request Body**:
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "password": "string",
  "role": "string", // "warehouse_manager", "logistics_manager"
  "permissions": "string", // "read", "read_write"
  "isActive": "boolean"
}
```
- **Response**:
```json
{
  "message": "Sub-admin created successfully",
  "subAdmin": {
    "id": "subadmin_id",
    "name": "string",
    "email": "string",
    "role": "string",
    "permissions": "string",
    "isActive": "boolean",
    "isEmailVerified": "boolean"
  }
}
```

#### 2. Get All Sub-Admins
- **Endpoint**: `GET /api/sub-admin/all`
- **Purpose**: Get all sub-admin accounts
- **Authentication**: Admin required
- **Query Parameters**:
  - `page`: Page number
  - `limit`: Items per page
  - `role`: Filter by role
  - `isActive`: Filter by active status
- **Response**:
```json
{
  "subAdmins": [
    {
      "id": "subadmin_id",
      "name": "string",
      "email": "string",
      "role": "string",
      "roleDisplayName": "string",
      "permissions": "string",
      "permissionsDisplayName": "string",
      "isActive": "boolean",
      "isEmailVerified": "boolean",
      "lastLogin": "timestamp"
    }
  ],
  "pagination": {}
}
```

#### 3. Sub-Admin Login
- **Endpoint**: `POST /api/sub-admin/login`
- **Purpose**: Authenticate sub-admin
- **Authentication**: None required
- **Request Body**:
```json
{
  "email": "string",
  "password": "string"
}
```
- **Response**:
```json
{
  "message": "Login successful",
  "subAdmin": {
    "id": "subadmin_id",
    "name": "string",
    "email": "string",
    "role": "string",
    "permissions": "string"
  },
  "token": "jwt_token"
}
```

#### 4. Update Sub-Admin
- **Endpoint**: `PUT /api/sub-admin/:id`
- **Purpose**: Update sub-admin details
- **Authentication**: Admin required
- **Request Body**:
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "role": "string",
  "permissions": "string",
  "isActive": "boolean"
}
```
- **Response**:
```json
{
  "message": "Sub-admin updated successfully",
  "subAdmin": {
    // Updated sub-admin object
  }
}
```

#### 5. Delete Sub-Admin
- **Endpoint**: `DELETE /api/sub-admin/:id`
- **Purpose**: Delete a sub-admin account
- **Authentication**: Admin required
- **Response**:
```json
{
  "message": "Sub-admin deleted successfully"
}
```

---

## Analytics Module

### Revenue Analytics - Base Route: `/api/revenue-analytics`

#### 1. Get Revenue Analytics
- **Endpoint**: `GET /api/revenue-analytics`
- **Purpose**: Get comprehensive revenue analytics
- **Authentication**: Admin/Sub-Admin required
- **Query Parameters**:
  - `startDate`: Start date for analytics
  - `endDate`: End date for analytics
  - `period`: Grouping period (day, week, month)
- **Response**:
```json
{
  "analytics": {
    "totalRevenue": "number",
    "totalOrders": "number",
    "averageOrderValue": "number",
    "revenueGrowth": "number",
    "topProducts": [
      {
        "productId": "string",
        "productName": "string",
        "revenue": "number",
        "orders": "number"
      }
    ],
    "revenueByPeriod": [
      {
        "period": "string",
        "revenue": "number",
        "orders": "number"
      }
    ],
    "paymentMethodBreakdown": {
      "upi": "number",
      "cash": "number",
      "card": "number"
    }
  }
}
```

### Return Analytics - Base Route: `/api/return-analytics`

#### 2. Get Return Analytics
- **Endpoint**: `GET /api/return-analytics`
- **Purpose**: Get return and refund analytics
- **Authentication**: Admin required
- **Query Parameters**:
  - `startDate`: Start date
  - `endDate`: End date
  - `status`: Filter by return status
- **Response**:
```json
{
  "analytics": {
    "summary": {
      "totalReturns": "number",
      "totalRefundAmount": "number",
      "averageProcessingTime": "number",
      "returnRate": "number"
    },
    "returnReasons": [
      {
        "reason": "string",
        "count": "number",
        "percentage": "number"
      }
    ],
    "statusDistribution": [
      {
        "status": "string",
        "count": "number"
      }
    ],
    "trends": {
      "returnsByDate": [],
      "refundsByDate": []
    }
  }
}
```

---

## Banner Management Module

### Base Route: `/api/banners`

#### 1. Create Banner
- **Endpoint**: `POST /api/banners`
- **Purpose**: Create a new banner
- **Authentication**: Admin/Sub-Admin required
- **Request Body** (FormData):
```javascript
{
  title: "string",
  description: "string",
  image: File,
  link: "string (optional)",
  position: "string", // "hero", "sidebar", "footer"
  isActive: "boolean",
  startDate: "string (optional)",
  endDate: "string (optional)"
}
```
- **Response**:
```json
{
  "message": "Banner created successfully",
  "banner": {
    "id": "banner_id",
    "title": "string",
    "description": "string",
    "imageUrl": "string",
    "link": "string",
    "position": "string",
    "isActive": "boolean",
    "startDate": "string",
    "endDate": "string"
  }
}
```

#### 2. Get All Banners
- **Endpoint**: `GET /api/banners`
- **Purpose**: Get all banners (public endpoint for active banners)
- **Authentication**: None required
- **Query Parameters**:
  - `position`: Filter by position
  - `active`: Filter by active status
- **Response**:
```json
{
  "banners": [
    {
      "id": "banner_id",
      "title": "string",
      "description": "string",
      "imageUrl": "string",
      "link": "string",
      "position": "string",
      "isActive": "boolean"
    }
  ]
}
```

#### 3. Update Banner
- **Endpoint**: `PUT /api/banners/:id`
- **Purpose**: Update banner details
- **Authentication**: Admin/Sub-Admin required
- **Request Body** (FormData):
```javascript
{
  title: "string",
  description: "string",
  image: File, // New image (optional)
  link: "string",
  position: "string",
  isActive: "boolean",
  startDate: "string",
  endDate: "string"
}
```
- **Response**:
```json
{
  "message": "Banner updated successfully",
  "banner": {
    // Updated banner object
  }
}
```

---

## Additional Modules

### Combo Pack Module (`/api/combo-packs`)
- Create, read, update, delete combo packs
- Manage product combinations and pricing
- Bulk operations support

---

## Coupon Management Module

### Base Route: `/api/coupons`

#### 1. Create Coupon
- **Endpoint**: `POST /api/coupons`
- **Purpose**: Create a new discount coupon
- **Authentication**: Admin required
- **Request Body**:
```json
{
  "code": "string", // Unique coupon code
  "type": "string", // "fixed" or "percentage"
  "amount": "number", // Discount amount or percentage
  "expiry": "string", // Expiry date (optional)
  "minOrder": "number", // Minimum order amount
  "maxDiscount": "number", // Maximum discount amount (for percentage type)
  "usageLimit": "number", // Maximum number of uses
  "active": "boolean"
}
```
- **Response**:
```json
{
  "coupon": {
    "id": "coupon_id",
    "code": "string",
    "type": "string",
    "amount": "number",
    "expiry": "string",
    "minOrder": "number",
    "maxDiscount": "number",
    "usageLimit": "number",
    "usedCount": 0,
    "active": "boolean",
    "createdAt": "timestamp"
  }
}
```

#### 2. Get All Coupons
- **Endpoint**: `GET /api/coupons`
- **Purpose**: Get all coupons (admin view)
- **Authentication**: Admin required
- **Response**:
```json
{
  "coupons": [
    {
      "id": "coupon_id",
      "code": "string",
      "type": "string",
      "amount": "number",
      "expiry": "string",
      "usageLimit": "number",
      "usedCount": "number",
      "active": "boolean"
    }
  ]
}
```

#### 3. Validate Coupon
- **Endpoint**: `POST /api/coupons/validate`
- **Purpose**: Validate a coupon code for use
- **Authentication**: User required
- **Request Body**:
```json
{
  "code": "string",
  "orderAmount": "number (optional)"
}
```
- **Response**:
```json
{
  "coupon": {
    "id": "coupon_id",
    "code": "string",
    "type": "string",
    "amount": "number",
    "minOrder": "number",
    "maxDiscount": "number",
    "valid": "boolean",
    "discountAmount": "number"
  }
}
```

#### 4. Update Coupon
- **Endpoint**: `PUT /api/coupons/:id`
- **Purpose**: Update coupon details
- **Authentication**: Admin required
- **Request Body**:
```json
{
  "code": "string",
  "type": "string",
  "amount": "number",
  "expiry": "string",
  "minOrder": "number",
  "maxDiscount": "number",
  "usageLimit": "number",
  "active": "boolean"
}
```
- **Response**:
```json
{
  "coupon": {
    // Updated coupon object
  }
}
```

#### 5. Delete Coupon
- **Endpoint**: `DELETE /api/coupons/:id`
- **Purpose**: Delete a coupon
- **Authentication**: Admin required
- **Response**:
```json
{
  "message": "Coupon deleted successfully"
}
```

---

## Delivery Management Module

### Base Route: `/api/delivery`

#### 1. Get Assigned Orders (Delivery Agent)
- **Endpoint**: `GET /api/delivery/orders/assigned`
- **Purpose**: Get orders assigned to delivery agent
- **Authentication**: Delivery Agent required
- **Query Parameters**:
  - `status`: Filter by delivery status
  - `page`: Page number
  - `limit`: Items per page
  - `sortBy`: Sort field (default: createdAt)
  - `sortOrder`: Sort order (asc/desc)
- **Response**:
```json
{
  "orders": [
    {
      "id": "order_id",
      "orderNumber": "string",
      "customer": {
        "name": "string",
        "phone": "string",
        "email": "string"
      },
      "deliveryAddress": {
        "street": "string",
        "city": "string",
        "state": "string",
        "zipCode": "string"
      },
      "deliverySlot": {
        "date": "string",
        "timeSlot": "string"
      },
      "totalAmount": "number",
      "paymentMethod": "string",
      "paymentStatus": "string",
      "delivery": {
        "status": "string",
        "assignedAt": "timestamp",
        "estimatedDelivery": "timestamp"
      },
      "items": [
        {
          "productName": "string",
          "quantity": "number",
          "price": "number"
        }
      ]
    }
  ],
  "pagination": {
    "currentPage": "number",
    "totalPages": "number",
    "totalOrders": "number"
  }
}
```

#### 2. Update Delivery Status
- **Endpoint**: `PUT /api/delivery/orders/:id/status`
- **Purpose**: Update delivery status for an order
- **Authentication**: Delivery Agent required
- **Request Body**:
```json
{
  "status": "string", // "picked_up", "in_transit", "delivered", "failed"
  "notes": "string (optional)",
  "location": {
    "latitude": "number (optional)",
    "longitude": "number (optional)"
  },
  "deliveredAt": "timestamp (for delivered status)",
  "failureReason": "string (for failed status)"
}
```
- **Response**:
```json
{
  "message": "Delivery status updated successfully",
  "order": {
    "id": "order_id",
    "delivery": {
      "status": "string",
      "updatedAt": "timestamp",
      "timeline": [
        {
          "status": "string",
          "timestamp": "timestamp",
          "notes": "string"
        }
      ]
    }
  }
}
```

#### 3. Generate Delivery OTP
- **Endpoint**: `POST /api/delivery/orders/:id/generate-otp`
- **Purpose**: Generate OTP for delivery verification
- **Authentication**: Delivery Agent required
- **Response**:
```json
{
  "message": "OTP generated and sent to customer",
  "otpSent": "boolean"
}
```

#### 4. Verify Delivery OTP
- **Endpoint**: `POST /api/delivery/orders/:id/verify-otp`
- **Purpose**: Verify delivery OTP to complete delivery
- **Authentication**: Delivery Agent required
- **Request Body**:
```json
{
  "otp": "string",
  "customerSignature": "string (optional)",
  "deliveryNotes": "string (optional)"
}
```
- **Response**:
```json
{
  "message": "Delivery completed successfully",
  "order": {
    "id": "order_id",
    "delivery": {
      "status": "delivered",
      "completedAt": "timestamp",
      "verificationMethod": "otp"
    }
  }
}
```

---

## Referral & Rewards Module

### Base Route: `/api/referrals`

#### 1. Get Referral Code
- **Endpoint**: `GET /api/referrals/my-code`
- **Purpose**: Get user's referral code (generates if doesn't exist)
- **Authentication**: User required
- **Response**:
```json
{
  "success": true,
  "referralCode": "string",
  "referralLink": "string",
  "stats": {
    "totalReferrals": "number",
    "successfulReferrals": "number",
    "totalRewards": "number",
    "pendingRewards": "number"
  }
}
```

#### 2. Validate Referral Code
- **Endpoint**: `POST /api/referrals/validate`
- **Purpose**: Validate a referral code during registration
- **Authentication**: None required
- **Request Body**:
```json
{
  "referralCode": "string"
}
```
- **Response**:
```json
{
  "success": true,
  "valid": "boolean",
  "referrer": {
    "name": "string",
    "id": "string"
  },
  "reward": {
    "newUserBonus": "number",
    "referrerBonus": "number"
  }
}
```

#### 3. Get Referral History
- **Endpoint**: `GET /api/referrals/history`
- **Purpose**: Get user's referral history and rewards
- **Authentication**: User required
- **Response**:
```json
{
  "success": true,
  "referrals": [
    {
      "referredUser": {
        "name": "string",
        "email": "string"
      },
      "registeredAt": "timestamp",
      "status": "string", // "pending", "completed"
      "reward": {
        "amount": "number",
        "status": "string" // "pending", "credited"
      }
    }
  ],
  "totalEarnings": "number",
  "pendingEarnings": "number"
}
```

#### 4. Record Referral Visit
- **Endpoint**: `POST /api/referrals/visit`
- **Purpose**: Record a visit through referral link
- **Authentication**: None required
- **Request Body**:
```json
{
  "referralCode": "string",
  "visitorInfo": {
    "userAgent": "string",
    "ipAddress": "string",
    "source": "string"
  }
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Visit recorded successfully",
  "visitReward": "number (if applicable)"
}
```

---

## Wallet Management Module

### Base Route: `/api/wallet`

#### 1. Get Wallet Balance
- **Endpoint**: `GET /api/wallet/balance`
- **Purpose**: Get user's current wallet balance
- **Authentication**: User required
- **Response**:
```json
{
  "success": true,
  "wallet": {
    "balance": "number",
    "coins": "number",
    "currency": "INR",
    "lastUpdated": "timestamp"
  }
}
```

#### 2. Get Transaction History
- **Endpoint**: `GET /api/wallet/transactions`
- **Purpose**: Get wallet transaction history
- **Authentication**: User required
- **Query Parameters**:
  - `page`: Page number
  - `limit`: Items per page
  - `type`: Filter by transaction type
  - `dateFrom`: Start date filter
  - `dateTo`: End date filter
- **Response**:
```json
{
  "success": true,
  "transactions": [
    {
      "id": "transaction_id",
      "type": "string", // "credit", "debit", "refund", "reward"
      "amount": "number",
      "description": "string",
      "relatedOrder": "order_id (optional)",
      "status": "string", // "completed", "pending", "failed"
      "createdAt": "timestamp"
    }
  ],
  "pagination": {}
}
```

#### 3. Add Coins to Wallet
- **Endpoint**: `POST /api/wallet/add-coins`
- **Purpose**: Add coins to user's wallet (admin operation)
- **Authentication**: Admin required
- **Request Body**:
```json
{
  "userId": "string",
  "coins": "number",
  "reason": "string",
  "description": "string"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Coins added successfully",
  "wallet": {
    "balance": "number",
    "coins": "number"
  },
  "transaction": {
    "id": "transaction_id",
    "amount": "number",
    "type": "credit"
  }
}
```

#### 4. Redeem Coins
- **Endpoint**: `POST /api/wallet/redeem`
- **Purpose**: Redeem coins for wallet balance
- **Authentication**: User required
- **Request Body**:
```json
{
  "coins": "number",
  "redemptionType": "string" // "wallet_balance", "discount_coupon"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Coins redeemed successfully",
  "redeemed": {
    "coins": "number",
    "value": "number",
    "type": "string"
  },
  "wallet": {
    "balance": "number",
    "coins": "number"
  }
}
```

---

## Notification Module

### Base Route: `/api/notifications`

#### 1. Send Push Notification
- **Endpoint**: `POST /api/notifications/push`
- **Purpose**: Send push notification to users
- **Authentication**: Admin required
- **Request Body**:
```json
{
  "title": "string",
  "body": "string",
  "icon": "string (optional)",
  "badge": "string (optional)",
  "data": {}, // Additional data
  "recipients": {
    "type": "string", // "all", "specific", "segment"
    "userIds": ["user_ids"], // For specific users
    "criteria": {} // For segment targeting
  }
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Notification sent successfully",
  "stats": {
    "totalSent": "number",
    "successful": "number",
    "failed": "number"
  }
}
```

#### 2. Get User Notifications
- **Endpoint**: `GET /api/notifications/user`
- **Purpose**: Get notifications for authenticated user
- **Authentication**: User required
- **Query Parameters**:
  - `page`: Page number
  - `limit`: Items per page
  - `read`: Filter by read status
- **Response**:
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notification_id",
      "title": "string",
      "body": "string",
      "type": "string",
      "read": "boolean",
      "createdAt": "timestamp",
      "data": {}
    }
  ],
  "unreadCount": "number",
  "pagination": {}
}
```

#### 3. Mark Notification as Read
- **Endpoint**: `PUT /api/notifications/:id/read`
- **Purpose**: Mark a notification as read
- **Authentication**: User required
- **Response**:
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

#### 4. Subscribe to Push Notifications
- **Endpoint**: `POST /api/notifications/subscribe`
- **Purpose**: Subscribe user device for push notifications

Web PWA support:
- Get VAPID public key: `GET /api/notifications/public-key`
- Client must register a service worker, call PushManager.subscribe with that key, then POST the subscription above with user auth.
- **Authentication**: User required
- **Request Body**:
```json
{
  "subscription": {
    "endpoint": "string",
    "keys": {
      "p256dh": "string",
      "auth": "string"
    }
  },
  "deviceInfo": {
    "userAgent": "string",
    "platform": "string"
  }
}
```
- **Response**:
```json
{
  "success": true,
  "message": "Subscription saved successfully"
}
```

---

## Additional Modules Summary

### Combo Pack Module
**Base Route**: `/api/combo-packs`

Key endpoints include:
- `POST /api/combo-packs` - Create combo pack
- `GET /api/combo-packs` - Get all combo packs
- `PUT /api/combo-packs/:id` - Update combo pack
- `DELETE /api/combo-packs/:id` - Delete combo pack
- `POST /api/combo-packs/:id/purchase` - Purchase combo pack

### Bulk Upload Module
**Base Route**: `/api/bulk-upload`

Key endpoints include:
- `POST /api/bulk-upload/products` - Bulk upload products
- `POST /api/bulk-upload/validate` - Validate upload file
- `GET /api/bulk-upload/templates` - Download templates
- `GET /api/bulk-upload/history` - Upload history

### Revenue Analytics Module
**Base Route**: `/api/revenue-analytics`

Key endpoints include:
- `GET /api/revenue-analytics/dashboard` - Main analytics dashboard
- `GET /api/revenue-analytics/trends` - Revenue trends
- `GET /api/revenue-analytics/products` - Product performance
- `GET /api/revenue-analytics/export` - Export analytics data

---

## Error Handling

### Common Error Codes

#### 400 - Bad Request
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

#### 401 - Unauthorized
```json
{
  "success": false,
  "message": "Access token is missing or invalid",
  "error": "UNAUTHORIZED"
}
```

#### 403 - Forbidden
```json
{
  "success": false,
  "message": "Insufficient permissions to access this resource",
  "error": "FORBIDDEN"
}
```

#### 404 - Not Found
```json
{
  "success": false,
  "message": "Resource not found",
  "error": "NOT_FOUND"
}
```

#### 409 - Conflict
```json
{
  "success": false,
  "message": "Resource already exists",
  "error": "CONFLICT"
}
```

#### 422 - Unprocessable Entity
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "password",
      "message": "Password must be at least 8 characters"
    }
  ]
}
```

#### 500 - Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error",
  "error": "INTERNAL_ERROR"
}
```

---

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Authentication endpoints**: 5 requests per minute per IP
- **General API endpoints**: 100 requests per minute per user
- **Admin endpoints**: 200 requests per minute per admin
- **File upload endpoints**: 10 requests per minute per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

## File Upload Guidelines

### Supported File Types

#### Product Images
- **Formats**: JPEG, PNG, WebP
- **Max Size**: 5MB per file
- **Max Count**: 10 images per product
- **Dimensions**: Recommended 800x800px minimum

#### Bulk Upload Files
- **Formats**: CSV, XLSX
- **Max Size**: 10MB
- **Max Records**: 1000 products per file

#### Banner Images
- **Formats**: JPEG, PNG, WebP
- **Max Size**: 2MB
- **Dimensions**: Various based on position

### File Upload Response
```json
{
  "success": true,
  "files": [
    {
      "fieldname": "images",
      "originalname": "product1.jpg",
      "filename": "upload_123456789.jpg",
      "url": "https://domain.com/uploads/products/upload_123456789.jpg",
      "size": 1024000
    }
  ]
}
```

---

## Environment Variables

### Required Environment Variables

```env
# Database
MONGODB_URI=mongodb://localhost:27017/ecommerce

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Server
PORT=5000
NODE_ENV=development

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# File Storage
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=5242880

# Payment Gateway (if applicable)
PAYMENT_GATEWAY_KEY=your_payment_key
PAYMENT_GATEWAY_SECRET=your_payment_secret

# Push Notifications
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=your_email@domain.com

# Twilio (for SMS)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone

# Redis (for caching)
REDIS_URL=redis://localhost:6379
```

---

## Database Models Overview

### Core Models

1. **User**: Customer accounts and authentication
2. **Admin**: Admin user management
3. **Product**: Product catalog and inventory
4. **Order**: Order management and tracking
5. **Return**: Return and refund processing
6. **Batch**: Inventory batch management
7. **DeliveryAgent**: Delivery personnel management
8. **SubAdmin**: Sub-administrator accounts
9. **Banner**: Marketing banner management
10. **Coupon**: Discount coupon system
11. **Notification**: Push notification system
12. **Transaction**: Wallet transaction history
13. **ReferralVisit**: Referral tracking
14. **ComboOffer**: Combo pack management
15. **Cart**: Shopping cart management

### Relationship Overview

- **User** → **Order** (One-to-Many)
- **Order** → **Return** (One-to-Many)
- **Product** → **Batch** (One-to-Many)
- **Order** → **DeliveryAgent** (Many-to-One)
- **User** → **Transaction** (One-to-Many)
- **User** → **Referral** (One-to-Many)

---

## API Testing

### Using Postman

1. Import the API collection
2. Set up environment variables
3. Obtain authentication tokens
4. Test endpoints systematically

### Authentication Flow for Testing

1. **Register/Login**: Get user token
2. **Admin Login**: Get admin token  
3. **Set Headers**: Include `Authorization: Bearer <token>`
4. **Test Endpoints**: Use appropriate tokens for each endpoint

### Sample Request Headers

```http
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Accept: application/json
```

---

## API Versioning

Current API version: **v1**

All endpoints are prefixed with `/api/` for the current version.

Future versions will use:
- `/api/v2/` for version 2
- `/api/v3/` for version 3

---

## Security Features

### Authentication
- JWT-based authentication
- Token expiration handling
- Refresh token mechanism

### Authorization
- Role-based access control (RBAC)
- Permission-based endpoint access
- Resource ownership validation

### Data Protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CORS configuration

### Rate Limiting
- IP-based rate limiting
- User-based rate limiting
- Endpoint-specific limits

---

## Performance Optimization

### Caching Strategy
- Redis caching for frequently accessed data
- Database query optimization
- Image compression and CDN delivery

### Database Optimization
- Proper indexing on frequently queried fields
- Aggregation pipelines for analytics
- Connection pooling

### API Response Optimization
- Pagination for large datasets
- Field selection for reduced payload
- Gzip compression

---

This comprehensive documentation covers all major modules and endpoints in your backend API system. Each module includes detailed endpoint specifications, request/response formats, authentication requirements, and example payloads.

---

## 🤝 Contributing

### Getting Started
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Contribution Guidelines
- Follow the existing code style and conventions
- Write tests for new features
- Update documentation for API changes
- Use conventional commit messages
- Ensure all tests pass before submitting PR

### Code Review Process
1. All PRs require at least one review
2. Automated tests must pass
3. Documentation must be updated
4. Security implications must be considered

## 🐛 Troubleshooting

### Common Issues

#### Database Connection Error
```bash
Error: MongoNetworkError: failed to connect to server
```
**Solution**: Ensure MongoDB is running and connection string is correct

#### JWT Token Invalid
```bash
Error: jwt malformed
```
**Solution**: Check token format and ensure it's properly passed in headers

#### File Upload Error
```bash
Error: LIMIT_FILE_SIZE
```
**Solution**: Check file size limits in configuration

#### CORS Error
```bash
Access-Control-Allow-Origin error
```
**Solution**: Update CORS configuration with correct frontend URL

### Debug Mode
```bash
# Enable debug logging
DEBUG=app:* npm run dev

# Database debug
DEBUG=mongoose:* npm run dev
```

## 📞 Support

### Documentation
- [API Documentation](#) - Complete API reference
- [Database Schema](#database-models-overview) - Data structure guide
- [Authentication Guide](#authentication--authorization) - Auth implementation

### Contact
- **Email**: support@yourdomain.com
- **Issues**: [GitHub Issues](link-to-issues)
- **Discussions**: [GitHub Discussions](link-to-discussions)

### Community
- **Discord**: [Join our Discord](link-to-discord)
- **Stack Overflow**: Tag `your-project-name`

## 🔄 Changelog

### Version 1.0.0 (Current)
- ✅ Complete authentication system
- ✅ Product management with variants
- ✅ Order processing and tracking
- ✅ Return and refund system
- ✅ Batch inventory management
- ✅ Delivery agent integration
- ✅ Analytics dashboard
- ✅ Referral and rewards system
- ✅ Wallet and transaction management
- ✅ Push notification system

### Upcoming Features (v1.1.0)
- 🔄 Payment gateway integration
- 🔄 Advanced search and filtering
- 🔄 Inventory forecasting
- 🔄 Multi-language support
- 🔄 Advanced analytics with charts
- 🔄 Automated testing suite
- 🔄 API rate limiting improvements

## 📋 FAQ

### General Questions

**Q: What databases are supported?**
A: Currently MongoDB is the primary database. PostgreSQL support is planned for v2.0.

**Q: Can I use this API with mobile apps?**
A: Yes, this REST API works with any client that can make HTTP requests.

**Q: Is there a rate limit?**
A: Yes, rate limiting is implemented. See [Rate Limiting](#rate-limiting) section.

### Technical Questions

**Q: How do I handle file uploads?**
A: Use multipart/form-data with appropriate endpoints. See [File Upload Guidelines](#file-upload-guidelines).

**Q: How do I implement real-time features?**
A: WebSocket support is planned. Currently use polling or implement custom WebSocket layer.

**Q: Can I customize the user roles?**
A: Yes, the role system is flexible. Modify the auth middleware and models as needed.

## 🏗️ Architecture

### System Design
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend App  │───▶│   Backend API   │───▶│    MongoDB      │
│   (React/Vue)   │    │   (Express.js)  │    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  External APIs  │
                        │ (Email, SMS,    │
                        │  Payments)      │
                        └─────────────────┘
```

### Request Flow
1. **Client Request** → API Gateway
2. **Authentication** → JWT Validation
3. **Authorization** → Role/Permission Check
4. **Validation** → Request Body Validation
5. **Business Logic** → Controller Processing
6. **Database** → MongoDB Operations
7. **Response** → JSON Response

### Database Design Principles
- **Normalization** for relational data integrity
- **Denormalization** for performance optimization
- **Indexing** on frequently queried fields
- **Aggregation Pipelines** for complex analytics

## 🔐 Security Best Practices

### Authentication Security
- Secure JWT secret rotation
- Token expiration handling
- Refresh token mechanism
- Multi-factor authentication (planned)

### Data Protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF token implementation

### Infrastructure Security
- HTTPS enforcement
- Security headers (Helmet.js)
- Rate limiting and DDoS protection
- Regular security audits

## 📊 Performance Metrics

### Response Time Targets
- **Authentication**: < 200ms
- **Product Listing**: < 500ms
- **Order Creation**: < 1s
- **Analytics Queries**: < 2s

### Scalability
- **Concurrent Users**: 1000+ supported
- **Requests per Second**: 500+ supported
- **Database Connections**: Pooled for efficiency
- **Memory Usage**: Optimized for production

## 📖 Additional Resources

### Learning Resources
- [Express.js Documentation](https://expressjs.com/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [JWT Best Practices](https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/)
- [REST API Design Guidelines](https://restfulapi.net/)

### Tools & Extensions
- **Postman Collection**: Available in `/postman` directory
- **Swagger/OpenAPI**: Auto-generated documentation
- **Database Visualization**: MongoDB Compass recommended
- **API Testing**: Jest + Supertest

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 Your Company Name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 Acknowledgments

- **Express.js Team** for the robust web framework
- **MongoDB Team** for the powerful database solution
- **Node.js Community** for continuous innovation
- **Open Source Contributors** who make projects like this possible

---

**Made with ❤️ by [Your Team Name]**

For more information, visit our [website](https://yourdomain.com) or contact us at [support@yourdomain.com](mailto:support@yourdomain.com).
