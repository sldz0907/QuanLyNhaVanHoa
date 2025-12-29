const express = require('express');
const router = express.Router();
const { 
  createRequest, 
  getAllRequests, 
  updateRequestStatus, 
  getRecentRequests,
  getMyRequests,
  updateMyRequest
} = require('../controllers/requestController');
const { verifyToken, authenticateToken } = require('../middleware/authMiddleware');

/**
 * @route POST /api/requests
 * @desc User đăng ký tạm trú/tạm vắng (hoặc các loại yêu cầu khác)
 * @access Private (cần token)
 * @note Phải có middleware authenticateToken để lấy được req.user.id
 */
router.post('/', authenticateToken, createRequest);

/**
 * @route GET /api/requests
 * @desc Admin lấy danh sách tất cả yêu cầu
 * @access Private (Admin - cần token)
 */
router.get('/', verifyToken, getAllRequests);

/**
 * @route GET /api/requests/recent
 * @desc Lấy danh sách 5 yêu cầu mới nhất (Cho Dashboard)
 * @access Private (Admin - cần token)
 */
router.get('/recent', verifyToken, getRecentRequests);

/**
 * @route GET /api/requests/my-requests
 * @desc User lấy danh sách yêu cầu của chính mình
 * @access Private (cần token)
 */
router.get('/my-requests', authenticateToken, getMyRequests);

/**
 * @route PUT /api/requests/my-requests/:id
 * @desc User tự sửa yêu cầu của chính mình (Chỉ cho sửa khi status là Pending)
 * @access Private (cần token)
 */
router.put('/my-requests/:id', authenticateToken, updateMyRequest);

/**
 * @route PUT /api/requests/:id/status
 * @desc Admin cập nhật trạng thái yêu cầu (Duyệt/Từ chối)
 * @access Private (Admin - cần token)
 */
router.put('/:id/status', verifyToken, updateRequestStatus);

module.exports = router;

