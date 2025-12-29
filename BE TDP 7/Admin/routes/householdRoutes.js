const express = require('express');
const router = express.Router();
const { createHousehold, getAllHouseholds, getHouseholdById } = require('../controllers/householdController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * @route GET /api/households
 * @desc Lấy danh sách tất cả hộ khẩu (sắp xếp mới nhất lên đầu)
 * @access Private (Admin only - cần token)
 */
router.get('/', verifyToken, getAllHouseholds);

/**
 * @route GET /api/households/:id
 * @desc Lấy chi tiết một hộ khẩu theo ID
 * @access Private (Admin only - cần token)
 */
router.get('/:id', verifyToken, getHouseholdById);

/**
 * @route POST /api/households
 * @desc Tạo hộ khẩu mới và gán chủ hộ
 * @access Private (Admin only - cần token)
 */
router.post('/', verifyToken, createHousehold);

module.exports = router;

