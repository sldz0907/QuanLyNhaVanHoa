const express = require('express');
const router = express.Router();
const { 
  createBooking, 
  getUserBookings, 
  getAllBookings, 
  updateBookingStatus 
} = require('../controllers/bookingController');
const { verifyToken, authenticateToken } = require('../middleware/authMiddleware');

/**
 * @route POST /api/bookings
 * @desc User tạo đơn đặt lịch
 * @access Private (cần token)
 * @note Phải có middleware authenticateToken để lấy được req.user.id
 */
router.post('/', authenticateToken, createBooking);

/**
 * @route GET /api/bookings/my-bookings
 * @desc User lấy lịch sử đặt lịch của chính mình
 * @access Private (cần token)
 */
router.get('/my-bookings', authenticateToken, getUserBookings);

/**
 * @route GET /api/bookings
 * @desc Admin lấy toàn bộ đơn đặt lịch (cho duyệt)
 * @access Private (Admin only - cần token)
 */
router.get('/', verifyToken, getAllBookings);

/**
 * @route PUT /api/bookings/:id/status
 * @desc Admin cập nhật trạng thái đơn đặt lịch (Duyệt/Từ chối)
 * @access Private (Admin only - cần token)
 */
router.put('/:id/status', verifyToken, updateBookingStatus);

module.exports = router;

