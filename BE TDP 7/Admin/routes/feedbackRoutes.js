const express = require('express');
const router = express.Router();
const { 
  createFeedback, 
  getAllFeedbacks, 
  updateFeedbackStatus, 
  getFeedbackStats 
} = require('../controllers/feedbackController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route POST /api/feedbacks
 * @desc User gửi phản ánh
 * @access Private (cần token)
 */
router.post('/', verifyToken, createFeedback);

/**
 * @route GET /api/feedbacks
 * @desc Lấy toàn bộ danh sách phản ánh (Admin)
 * @access Private (Admin - cần token)
 */
router.get('/', verifyToken, getAllFeedbacks);

/**
 * @route GET /api/feedbacks/stats
 * @desc Lấy thống kê số lượng phản ánh theo trạng thái
 * @access Private (Admin - cần token)
 */
router.get('/stats', verifyToken, getFeedbackStats);

/**
 * @route PUT /api/feedbacks/:id/status
 * @desc Admin cập nhật trạng thái phản ánh
 * @access Private (Admin - cần token)
 */
router.put('/:id/status', verifyToken, updateFeedbackStatus);

module.exports = router;
