const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route GET /api/dashboard/stats
 * @desc Lấy số liệu thống kê cho Dashboard
 * @access Private (Admin only - cần token)
 */
router.get('/stats', verifyToken, getDashboardStats);

module.exports = router;

