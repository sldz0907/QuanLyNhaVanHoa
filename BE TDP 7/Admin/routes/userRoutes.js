const express = require('express');
const router = express.Router();
const { getPendingUsers, approveUser, getProfile, updateProfile, getMyHousehold, addMemberToMyHousehold, updateResidentForUser } = require('../controllers/userController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route GET /api/users/pending
 * @desc Lấy danh sách user có status = 'pending' (chờ duyệt)
 * @access Private (Admin only - cần token)
 */
router.get('/pending', verifyToken, getPendingUsers);

/**
 * @route PUT /api/users/approve/:id
 * @desc Duyệt user (đổi status từ 'pending' -> 'active')
 * @access Private (Admin only - cần token)
 */
router.put('/approve/:id', verifyToken, approveUser);

/**
 * @route GET /api/users/profile
 * @desc Lấy thông tin profile của user đang đăng nhập
 * @access Private (cần token)
 */
router.get('/profile', verifyToken, getProfile);

/**
 * @route PUT /api/users/profile
 * @desc Cập nhật thông tin cá nhân của user đang đăng nhập
 * @access Private (cần token)
 */
router.put('/profile', verifyToken, updateProfile);

/**
 * @route GET /api/users/my-household
 * @desc Lấy thông tin hộ khẩu của user đang đăng nhập
 * @access Private (cần token)
 */
router.get('/my-household', verifyToken, getMyHousehold);

/**
 * @route POST /api/users/household/members
 * @desc Chủ hộ tự thêm thành viên vào hộ khẩu của mình
 * @access Private (cần token - chỉ Chủ hộ mới được)
 */
router.post('/household/members', verifyToken, addMemberToMyHousehold);

/**
 * @route PUT /api/users/household/members/:id
 * @desc Chủ hộ sửa thông tin thành viên trong hộ của mình
 * @access Private (cần token - chỉ Chủ hộ mới được)
 */
router.put('/household/members/:id', verifyToken, updateResidentForUser);

module.exports = router;

