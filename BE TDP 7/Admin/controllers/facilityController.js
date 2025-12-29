const { getPool, sql } = require('../dbConfig');

/**
 * Helper function: Parse số từ chuỗi (ví dụ: "200 người" -> 200)
 * @param {string|number} value - Giá trị cần parse
 * @returns {number|null} - Số đã parse hoặc null nếu không hợp lệ
 */
const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  
  // Nếu đã là số, trả về luôn
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  
  // Nếu là chuỗi, tìm số đầu tiên trong chuỗi
  if (typeof value === 'string') {
    const match = value.match(/\d+(\.\d+)?/);
    if (match) {
      const num = parseFloat(match[0]);
      return isNaN(num) ? null : num;
    }
  }
  
  return null;
};

/**
 * Lấy danh sách tất cả tài sản (Nhà văn hóa)
 * @route GET /api/facilities
 * @access Private (Admin only - cần token)
 */
const getAllFacilities = async (req, res) => {
  try {
    const pool = await getPool();
    
    const result = await pool.request()
      .query(`
        SELECT * 
        FROM [Facility] 
        ORDER BY created_at DESC
      `);

    return res.json({
      success: true,
      message: 'Lấy danh sách tài sản thành công',
      data: result.recordset,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách tài sản:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách tài sản',
      error: error.message,
    });
  }
};

/**
 * Lấy danh sách địa điểm (Phòng họp, Thể thao, Sân bãi)
 * @route GET /api/facilities/locations
 * @access Private (Admin only - cần token)
 */
const getLocations = async (req, res) => {
  try {
    const pool = await getPool();
    
    const result = await pool.request()
      .query(`
        SELECT * 
        FROM [Facility] 
        WHERE type IN ('PhongHop', 'TheThao', 'SanBai')
        ORDER BY created_at DESC
      `);

    return res.json({
      success: true,
      message: 'Lấy danh sách địa điểm thành công',
      data: result.recordset,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách địa điểm:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách địa điểm',
      error: error.message,
    });
  }
};

/**
 * Lấy danh sách thiết bị (Thiết bị, Âm thanh, Dụng cụ)
 * @route GET /api/facilities/equipments
 * @access Private (Admin only - cần token)
 */
const getEquipments = async (req, res) => {
  try {
    const pool = await getPool();
    
    const result = await pool.request()
      .query(`
        SELECT * 
        FROM [Facility] 
        WHERE type IN ('ThietBi', 'AmThanh', 'DungCu')
        ORDER BY created_at DESC
      `);

    return res.json({
      success: true,
      message: 'Lấy danh sách thiết bị thành công',
      data: result.recordset,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách thiết bị:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách thiết bị',
      error: error.message,
    });
  }
};

/**
 * Tạo tài sản mới
 * @route POST /api/facilities
 * @access Private (Admin only - cần token)
 */
const createFacility = async (req, res) => {
  try {
    const pool = await getPool();
    
    // Input: name, description, capacity, area, location, status, type, asset_value, quantity, price
    const { 
      name, 
      description, 
      capacity, 
      area,
      location, 
      status,
      type,
      asset_value,
      quantity,
      price
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp tên tài sản (name)',
      });
    }

    // Parse capacity, area, asset_value, quantity, price sang số nếu cần
    const parsedCapacity = capacity !== undefined ? parseNumber(capacity) : null;
    const parsedArea = area !== undefined ? parseNumber(area) : null;
    // Nếu asset_value hoặc price là null/undefined, gán mặc định là 0
    const parsedAssetValue = asset_value !== undefined && asset_value !== null ? (parseNumber(asset_value) ?? 0) : 0;
    const parsedPrice = price !== undefined && price !== null ? (parseNumber(price) ?? 0) : 0;
    const parsedQuantity = quantity !== undefined ? parseNumber(quantity) : null;

    // Bind các tham số cho INSERT
    const insertRequest = pool.request();
    insertRequest.input('name', sql.NVarChar, name);
    insertRequest.input('description', sql.NVarChar, description || null);
    insertRequest.input('capacity', sql.Int, parsedCapacity);
    insertRequest.input('area', sql.Float, parsedArea);
    insertRequest.input('location', sql.NVarChar, location || null);
    insertRequest.input('status', sql.NVarChar, status || 'Available');
    insertRequest.input('type', sql.NVarChar, type || null);
    insertRequest.input('asset_value', sql.Decimal(18, 2), parsedAssetValue);
    insertRequest.input('quantity', sql.Int, parsedQuantity);
    insertRequest.input('price', sql.Decimal(18, 2), parsedPrice);
    insertRequest.input('created_at', sql.DateTime, new Date());

    // Query: INSERT INTO Facility
    const insertQuery = `
      INSERT INTO [Facility] (
        name, description, capacity, area, location, status, type, asset_value, quantity, price, created_at
      )
      OUTPUT INSERTED.*
      VALUES (
        @name, @description, @capacity, @area, @location, @status, @type, @asset_value, @quantity, @price, @created_at
      )
    `;

    const result = await insertRequest.query(insertQuery);

    if (result.recordset.length > 0) {
      console.log(`✅ Đã tạo Facility: ${result.recordset[0].id} - "${name}"`);
      
      return res.status(201).json({
        success: true,
        message: 'Tạo tài sản thành công',
        data: result.recordset[0],
      });
    } else {
      throw new Error('Không thể tạo tài sản');
    }
  } catch (error) {
    console.error('❌ Lỗi khi tạo tài sản:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi tạo tài sản',
      error: error.message,
    });
  }
};

/**
 * Cập nhật thông tin tài sản hoặc trạng thái bảo trì
 * @route PUT /api/facilities/:id
 * @access Private (Admin only - cần token)
 */
const updateFacility = async (req, res) => {
  try {
    const pool = await getPool();
    
    const { id } = req.params;
    const { 
      name, 
      description, 
      capacity,
      area,
      location, 
      status,
      type,
      asset_value,
      quantity,
      price
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp id tài sản',
      });
    }

    // Build dynamic update query
    const updateFields = [];
    const updateRequest = pool.request();
    updateRequest.input('id', sql.NVarChar, id);

    if (name !== undefined) {
      updateFields.push('name = @name');
      updateRequest.input('name', sql.NVarChar, name);
    }
    if (description !== undefined) {
      updateFields.push('description = @description');
      updateRequest.input('description', sql.NVarChar, description);
    }
    if (capacity !== undefined) {
      // Parse capacity sang số nếu cần
      const parsedCapacity = parseNumber(capacity);
      updateFields.push('capacity = @capacity');
      updateRequest.input('capacity', sql.Int, parsedCapacity);
    }
    if (area !== undefined) {
      // Parse area sang số nếu cần
      const parsedArea = parseNumber(area);
      updateFields.push('area = @area');
      updateRequest.input('area', sql.Float, parsedArea);
    }
    if (location !== undefined) {
      updateFields.push('location = @location');
      updateRequest.input('location', sql.NVarChar, location);
    }
    if (status !== undefined) {
      updateFields.push('status = @status');
      updateRequest.input('status', sql.NVarChar, status);
    }
    if (type !== undefined) {
      updateFields.push('type = @type');
      updateRequest.input('type', sql.NVarChar, type);
    }
    if (asset_value !== undefined) {
      // Parse asset_value sang số nếu cần, nếu null/undefined thì gán mặc định là 0
      const parsedAssetValue = asset_value !== null ? (parseNumber(asset_value) ?? 0) : 0;
      updateFields.push('asset_value = @asset_value');
      updateRequest.input('asset_value', sql.Decimal(18, 2), parsedAssetValue);
    }
    if (quantity !== undefined) {
      // Parse quantity sang số nếu cần
      const parsedQuantity = parseNumber(quantity);
      updateFields.push('quantity = @quantity');
      updateRequest.input('quantity', sql.Int, parsedQuantity);
    }
    if (price !== undefined) {
      // Parse price sang số nếu cần, nếu null/undefined thì gán mặc định là 0
      const parsedPrice = price !== null ? (parseNumber(price) ?? 0) : 0;
      updateFields.push('price = @price');
      updateRequest.input('price', sql.Decimal(18, 2), parsedPrice);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ít nhất một trường để cập nhật',
      });
    }

    const updateQuery = `
      UPDATE [Facility]
      SET ${updateFields.join(', ')}
      OUTPUT INSERTED.*
      WHERE id = @id
    `;

    const result = await updateRequest.query(updateQuery);

    if (result.recordset.length > 0) {
      console.log(`✅ Đã cập nhật Facility: ${id}`);
      
      return res.json({
        success: true,
        message: 'Cập nhật tài sản thành công',
        data: result.recordset[0],
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài sản để cập nhật',
      });
    }
  } catch (error) {
    console.error('❌ Lỗi khi cập nhật tài sản:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật tài sản',
      error: error.message,
    });
  }
};

/**
 * Xóa tài sản
 * @route DELETE /api/facilities/:id
 * @access Private (Admin only - cần token)
 */
const deleteFacility = async (req, res) => {
  try {
    const pool = await getPool();
    
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp id tài sản',
      });
    }

    const deleteRequest = pool.request();
    deleteRequest.input('id', sql.NVarChar, id);

    const deleteQuery = `
      DELETE FROM [Facility] 
      WHERE id = @id
    `;

    const result = await deleteRequest.query(deleteQuery);

    if (result.rowsAffected[0] > 0) {
      console.log(`✅ Đã xóa Facility: ${id}`);
      
      return res.json({
        success: true,
        message: 'Xóa tài sản thành công',
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài sản để xóa',
      });
    }
  } catch (error) {
    console.error('❌ Lỗi khi xóa tài sản:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa tài sản',
      error: error.message,
    });
  }
};

module.exports = {
  getAllFacilities,
  getLocations,
  getEquipments,
  createFacility,
  updateFacility,
  deleteFacility,
};

