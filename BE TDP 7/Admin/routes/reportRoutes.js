const express = require('express');
const router = express.Router();
const { 
  createReport, 
  getAllReports,
  getMyReports,
  getReportStats,
  updateReportStatus,
  getDemographicStats
} = require('../controllers/reportController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route POST /api/reports
 * @desc User gửi phản ánh/báo cáo
 * @access Private (cần token)
 */
router.post('/', verifyToken, createReport);

/**
 * @route GET /api/reports/stats
 * @desc Admin lấy thống kê số lượng phản ánh theo trạng thái
 * @access Private (Admin - cần token)
 */
router.get('/stats', verifyToken, getReportStats);

/**
 * @route GET /api/reports
 * @desc Admin lấy toàn bộ danh sách phản ánh
 * @access Private (Admin - cần token)
 */
router.get('/', verifyToken, getAllReports);

/**
 * @route GET /api/reports/my-reports
 * @desc User lấy danh sách phản ánh của chính mình
 * @access Private (cần token)
 */
router.get('/my-reports', verifyToken, getMyReports);

/**
 * @route PUT /api/reports/:id/status
 * @desc Admin cập nhật trạng thái phản ánh
 * @access Private (Admin - cần token)
 */
router.put('/:id/status', verifyToken, updateReportStatus);

/**
 * @route GET /api/reports/demographic-stats
 * @desc Admin lấy thống kê dân số theo độ tuổi (cho trang Báo cáo)
 * @access Private (Admin - cần token)
 */
router.get('/demographic-stats', verifyToken, getDemographicStats);

module.exports = router;

