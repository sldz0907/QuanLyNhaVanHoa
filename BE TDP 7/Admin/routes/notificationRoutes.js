const express = require('express');
const router = express.Router();
const { 
  getNotifications, 
  createNotification, 
  deleteNotification 
} = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route GET /api/notifications
 * @desc Lấy danh sách tất cả thông báo
 * @access Private (Admin only - cần token)
 */
router.get('/', verifyToken, getNotifications);

/**
 * @route POST /api/notifications
 * @desc Tạo thông báo mới
 * @access Private (Admin only - cần token)
 */
router.post('/', verifyToken, createNotification);

/**
 * @route DELETE /api/notifications/:id
 * @desc Xóa thông báo
 * @access Private (Admin only - cần token)
 */
router.delete('/:id', verifyToken, deleteNotification);

module.exports = router;

