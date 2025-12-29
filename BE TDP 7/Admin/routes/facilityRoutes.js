const express = require('express');
const router = express.Router();
const { 
  getAllFacilities,
  getLocations,
  getEquipments,
  createFacility, 
  updateFacility, 
  deleteFacility 
} = require('../controllers/facilityController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route GET /api/facilities
 * @desc Lấy danh sách tất cả tài sản (Nhà văn hóa)
 * @access Private (Admin only - cần token)
 */
router.get('/', verifyToken, getAllFacilities);

/**
 * @route GET /api/facilities/locations
 * @desc Lấy danh sách địa điểm (Phòng họp, Thể thao, Sân bãi)
 * @access Private (Admin only - cần token)
 */
router.get('/locations', verifyToken, getLocations);

/**
 * @route GET /api/facilities/equipments
 * @desc Lấy danh sách thiết bị (Thiết bị, Âm thanh, Dụng cụ)
 * @access Private (Admin only - cần token)
 */
router.get('/equipments', verifyToken, getEquipments);

/**
 * @route POST /api/facilities
 * @desc Tạo tài sản mới
 * @access Private (Admin only - cần token)
 */
router.post('/', verifyToken, createFacility);

/**
 * @route PUT /api/facilities/:id
 * @desc Cập nhật thông tin tài sản hoặc trạng thái bảo trì
 * @access Private (Admin only - cần token)
 */
router.put('/:id', verifyToken, updateFacility);

/**
 * @route DELETE /api/facilities/:id
 * @desc Xóa tài sản
 * @access Private (Admin only - cần token)
 */
router.delete('/:id', verifyToken, deleteFacility);

module.exports = router;

