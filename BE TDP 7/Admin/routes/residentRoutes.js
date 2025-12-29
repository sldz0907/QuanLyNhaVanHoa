const express = require('express');
const router = express.Router();
const { createResident, getAllResidents, updateResident, deleteResident } = require('../controllers/residentController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route GET /api/residents
 * @desc Lấy danh sách tất cả nhân khẩu (sắp xếp mới nhất lên đầu)
 * @access Private (Admin only - cần token)
 */
router.get('/', verifyToken, getAllResidents);

/**
 * @route POST /api/residents
 * @desc Tạo nhân khẩu mới (thêm người vào hộ khẩu)
 * @access Private (Admin only - cần token)
 */
router.post('/', verifyToken, createResident);

/**
 * @route PUT /api/residents/:id
 * @desc Cập nhật thông tin nhân khẩu
 * @access Private (Admin only - cần token)
 */
router.put('/:id', verifyToken, updateResident);

/**
 * @route DELETE /api/residents/:id
 * @desc Xóa nhân khẩu
 * @access Private (Admin only - cần token)
 */
router.delete('/:id', verifyToken, deleteResident);

module.exports = router;

