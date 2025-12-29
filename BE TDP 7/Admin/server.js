const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { getPool, closePool, sql } = require('./dbConfig');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const householdRoutes = require('./routes/householdRoutes');
const residentRoutes = require('./routes/residentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const reportRoutes = require('./routes/reportRoutes');
const requestRoutes = require('./routes/requestRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const facilityRoutes = require('./routes/facilityRoutes');
const bookingRoutes = require('./routes/bookingRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/households', householdRoutes);
app.use('/api/residents', residentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/bookings', bookingRoutes);

// Test API - Lấy danh sách users
app.get('/api/users', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    
    // Query lấy danh sách user từ bảng [User]
    const result = await request.query('SELECT * FROM [User]');
    
    res.json({
      success: true,
      data: result.recordset,
      count: result.recordset.length,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách users:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy danh sách users',
      error: error.message,
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    await request.query('SELECT 1');
    
    res.json({
      success: true,
      message: 'Server và Database đang hoạt động bình thường',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi kết nối database',
      error: error.message,
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'TDP7 Backend API Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
      },
      users: {
        pending: 'GET /api/users/pending',
        approve: 'PUT /api/users/approve/:id',
        profile: 'GET /api/users/profile',
        updateProfile: 'PUT /api/users/profile',
      },
      households: {
        create: 'POST /api/households',
        getAll: 'GET /api/households',
        getById: 'GET /api/households/:id',
      },
      residents: {
        create: 'POST /api/residents',
        getAll: 'GET /api/residents',
      },
      dashboard: {
        stats: 'GET /api/dashboard/stats',
      },
      feedback: {
        create: 'POST /api/feedback',
      },
      requests: {
        create: 'POST /api/requests',
        getAll: 'GET /api/requests',
        getRecent: 'GET /api/requests/recent',
        updateStatus: 'PUT /api/requests/:id/status',
      },
      notifications: {
        getAll: 'GET /api/notifications',
        create: 'POST /api/notifications',
        delete: 'DELETE /api/notifications/:id',
      },
      facilities: {
        getAll: 'GET /api/facilities',
        create: 'POST /api/facilities',
        update: 'PUT /api/facilities/:id',
        delete: 'DELETE /api/facilities/:id',
      },
      bookings: {
        create: 'POST /api/bookings',
        getMyBookings: 'GET /api/bookings/my-bookings',
        getAll: 'GET /api/bookings',
        updateStatus: 'PUT /api/bookings/:id/status',
      },
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint không tồn tại',
  });
});

// Khởi động server - Đảm bảo process luôn sống
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Test kết nối database khi khởi động (chỉ 1 lần)
  try {
    const pool = await getPool();
    // Test query đơn giản để đảm bảo kết nối hoạt động
    const request = pool.request();
    await request.query('SELECT 1');
    console.log('✅ Đã kết nối thành công tới SQL Server');
  } catch (error) {
    console.error('❌ Lỗi kết nối SQL Server:', error.message);
    console.error('⚠️  Cảnh báo: Không thể kết nối database khi khởi động');
    // KHÔNG exit process, server vẫn chạy để có thể retry sau
  }
});

// Đảm bảo server không tự tắt
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} đã được sử dụng. Vui lòng chọn port khác.`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⚠️  SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('✅ HTTP server closed');
    await closePool();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('⚠️  SIGINT signal received: closing HTTP server');
  server.close(async () => {
    console.log('✅ HTTP server closed');
    await closePool();
    process.exit(0);
  });
});

module.exports = app;

