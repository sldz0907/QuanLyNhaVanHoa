const express = require('express');
const router = express.Router();
const { register, login, getMe, changePassword } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route POST /api/auth/register
 * @desc Đăng ký tài khoản mới
 * @access Public
 */
router.post('/register', register);

/**
 * @route POST /api/auth/login
 * @desc Đăng nhập
 * @access Public
 */
router.post('/login', login);

/**
 * @route GET /api/auth/me
 * @desc Lấy thông tin cá nhân của user đang đăng nhập
 * @access Private (cần token)
 */
router.get('/me', verifyToken, getMe);

/**
 * @route PUT /api/auth/change-password
 * @desc Đổi mật khẩu (User tự đổi, không cần Admin duyệt)
 * @access Private (cần token)
 */
router.put('/change-password', verifyToken, changePassword);

module.exports = router;

