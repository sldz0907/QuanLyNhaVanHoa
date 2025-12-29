const { getPool, sql } = require('../dbConfig');

/**
 * Lấy danh sách thông báo
 * @route GET /api/notifications
 * @access Private (Admin only - cần token)
 */
const getNotifications = async (req, res) => {
  try {
    const pool = await getPool();
    
    // Query: SELECT * FROM Notification ORDER BY created_at DESC
    const result = await pool.request()
      .query(`
        SELECT * 
        FROM [Notification] 
        ORDER BY created_at DESC
      `);

    return res.json({
      success: true,
      message: 'Lấy danh sách thông báo thành công',
      data: result.recordset,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách thông báo:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách thông báo',
      error: error.message,
    });
  }
};

/**
 * Tạo thông báo mới
 * @route POST /api/notifications
 * @access Private (Admin only - cần token)
 */
const createNotification = async (req, res) => {
  try {
    const pool = await getPool();
    
    // Input: title, type, content, location, event_date, end_date, is_urgent
    const { 
      title, 
      type, 
      content, 
      location, 
      event_date, 
      end_date,
      is_urgent 
    } = req.body;

    // Validation
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: title, content',
      });
    }

    // Bind các tham số cho INSERT (không bao gồm id - để SQL Server tự động sinh)
    const insertRequest = pool.request();
    insertRequest.input('title', sql.NVarChar, title);
    insertRequest.input('type', sql.NVarChar, type || 'Thông báo');
    insertRequest.input('content', sql.NVarChar, content);
    insertRequest.input('location', sql.NVarChar, location || null);
    insertRequest.input('event_date', sql.DateTime, event_date || null);
    insertRequest.input('end_date', sql.DateTime, end_date || null);
    insertRequest.input('is_urgent', sql.Bit, is_urgent || false);
    insertRequest.input('created_at', sql.DateTime, new Date());

    // Query: INSERT INTO Notification (...) VALUES (...)
    // Lưu ý: Không insert id - để SQL Server tự động sinh (IDENTITY column)
    const insertQuery = `
      INSERT INTO [Notification] (
        title, type, content, location, event_date, end_date, is_urgent, created_at
      )
      OUTPUT INSERTED.*
      VALUES (
        @title, @type, @content, @location, @event_date, @end_date, @is_urgent, @created_at
      )
    `;

    const result = await insertRequest.query(insertQuery);

    if (result.recordset.length > 0) {
      console.log(`✅ Đã tạo Notification: ${result.recordset[0].id} bởi Admin`);
      
      return res.status(201).json({
        success: true,
        message: 'Tạo thông báo thành công',
        data: result.recordset[0],
      });
    } else {
      throw new Error('Không thể tạo thông báo');
    }
  } catch (error) {
    console.error('❌ Lỗi khi tạo thông báo:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi tạo thông báo',
      error: error.message,
    });
  }
};

/**
 * Xóa thông báo
 * @route DELETE /api/notifications/:id
 * @access Private (Admin only - cần token)
 */
const deleteNotification = async (req, res) => {
  try {
    const pool = await getPool();
    
    // Input: id (params)
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp id thông báo',
      });
    }

    // Query: DELETE FROM Notification WHERE id = @id
    const deleteRequest = pool.request();
    deleteRequest.input('id', sql.NVarChar, id);

    const deleteQuery = `
      DELETE FROM [Notification] 
      WHERE id = @id
    `;

    const result = await deleteRequest.query(deleteQuery);

    if (result.rowsAffected[0] > 0) {
      console.log(`✅ Đã xóa Notification: ${id}`);
      
      return res.json({
        success: true,
        message: 'Xóa thông báo thành công',
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông báo để xóa',
      });
    }
  } catch (error) {
    console.error('❌ Lỗi khi xóa thông báo:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa thông báo',
      error: error.message,
    });
  }
};

module.exports = {
  getNotifications,
  createNotification,
  deleteNotification,
};

