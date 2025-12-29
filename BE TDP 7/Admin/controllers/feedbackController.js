const { getPool, sql } = require('../dbConfig');
const crypto = require('crypto');

/**
 * User gửi phản ánh
 * @route POST /api/feedbacks
 * @access Private (cần token)
 * 
 * @param {string} req.body.user_id - ID người gửi (có thể lấy từ token)
 * @param {string} req.body.title - Tiêu đề phản ánh
 * @param {string} req.body.content - Nội dung chi tiết
 * @param {string} req.body.category - Danh mục (an_ninh, ve_sinh, ha_tang, dich_vu, khac)
 * @param {string} req.body.image_url - URL ảnh đính kèm (tùy chọn)
 */
const createFeedback = async (req, res) => {
  try {
    // Lấy user_id từ token (nếu có middleware) hoặc từ body
    const userId = req.user?.id || req.body.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const { title, content, category, image_url } = req.body;

    // Validation
    if (!title || !content || !category) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: title, content, category',
      });
    }

    const pool = await getPool();
    const request = pool.request();

    // Tạo ID mới
    const feedbackId = crypto.randomUUID();

    // Bind các tham số
    request.input('id', sql.NVarChar, feedbackId);
    request.input('user_id', sql.NVarChar, userId);
    request.input('title', sql.NVarChar, title);
    request.input('content', sql.NVarChar, content);
    request.input('category', sql.NVarChar, category);
    request.input('image_url', sql.NVarChar, image_url || null);
    request.input('status', sql.NVarChar, 'Pending'); // Mặc định là Pending

    // Thực hiện INSERT
    try {
      const insertQuery = `
        INSERT INTO [Feedback] (
          id, user_id, title, content, category, image_url, status, created_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @id, @user_id, @title, @content, @category, @image_url, @status, GETDATE()
        )
      `;

      const result = await request.query(insertQuery);

      if (result.recordset.length > 0) {
        console.log(`✅ Đã tạo Feedback: ${feedbackId} bởi User ${userId}`);
        
        return res.status(201).json({
          success: true,
          message: 'Đã gửi phản ánh thành công. Chúng tôi sẽ xử lý sớm nhất có thể.',
          data: result.recordset[0],
        });
      } else {
        throw new Error('Không thể tạo phản ánh');
      }
    } catch (insertError) {
      // Nếu bảng không có cột image_url, thử INSERT không có cột này
      console.log('⚠️  Thử INSERT không có image_url...');
      
      const basicInsertQuery = `
        INSERT INTO [Feedback] (
          id, user_id, title, content, category, status, created_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @id, @user_id, @title, @content, @category, @status, GETDATE()
        )
      `;

      const result = await request.query(basicInsertQuery);

      if (result.recordset.length > 0) {
        console.log(`✅ Đã tạo Feedback: ${feedbackId} bởi User ${userId}`);
        
        return res.status(201).json({
          success: true,
          message: 'Đã gửi phản ánh thành công. Chúng tôi sẽ xử lý sớm nhất có thể.',
          data: result.recordset[0],
        });
      } else {
        throw insertError;
      }
    }

  } catch (error) {
    console.error('❌ Lỗi khi tạo phản ánh:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi gửi phản ánh',
      error: error.message,
    });
  }
};

/**
 * Lấy toàn bộ danh sách phản ánh (Admin)
 * @route GET /api/feedbacks
 * @access Private (Admin - cần token)
 * 
 * Trả về danh sách phản ánh với thông tin người gửi (JOIN User)
 */
const getAllFeedbacks = async (req, res) => {
  try {
    const pool = await getPool();
    
    // Query với JOIN User để lấy full_name và apartment_number
    // Lưu ý: apartment_number có thể nằm trong Feedback table hoặc HouseholdMember
    const result = await pool.request()
      .query(`
        SELECT 
          f.*,
          u.full_name,
          u.household_id,
          h.code as household_code,
          hm.name as household_member_name,
          hm.role as household_member_role
        FROM [Feedback] f
        LEFT JOIN [User] u ON f.user_id = u.id
        LEFT JOIN [Household] h ON u.household_id = h.id
        LEFT JOIN [HouseholdMember] hm ON u.household_id = hm.household_id AND hm.role = N'Chủ hộ'
        ORDER BY f.created_at DESC
      `);

    // Map lại dữ liệu để có apartment_number
    const feedbacks = result.recordset.map(feedback => {
      // Lấy apartment_number từ Feedback table (nếu có cột apartment) hoặc từ Household
      const apartmentNumber = feedback.apartment || feedback.household_code || null;
      
      return {
        ...feedback,
        user_name: feedback.full_name || 'Không xác định',
        apartment_number: apartmentNumber,
      };
    });

    return res.json({
      success: true,
      message: 'Lấy danh sách phản ánh thành công',
      data: feedbacks,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách phản ánh:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách phản ánh',
      error: error.message,
    });
  }
};

/**
 * Admin cập nhật trạng thái phản ánh
 * @route PUT /api/feedbacks/:id/status
 * @access Private (Admin - cần token)
 * 
 * @param {string} req.params.id - ID phản ánh
 * @param {string} req.body.status - Trạng thái mới ('Pending', 'Processing', 'Resolved')
 */
const updateFeedbackStatus = async (req, res) => {
  try {
    const pool = await getPool();
    
    const { id } = req.params;
    const { status } = req.body;

    // Validation
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp id phản ánh',
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp trạng thái (status)',
      });
    }

    // Validate status
    const validStatuses = ['Pending', 'Processing', 'Resolved'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Trạng thái không hợp lệ. Các trạng thái hợp lệ: ${validStatuses.join(', ')}`,
      });
    }

    // Thực hiện UPDATE
    const updateRequest = pool.request();
    updateRequest.input('id', sql.NVarChar, id);
    updateRequest.input('status', sql.NVarChar, status);
    
    const updateQuery = `
      UPDATE [Feedback] 
      SET status = @status, updated_at = GETDATE()
      OUTPUT INSERTED.*
      WHERE id = @id
    `;

    const result = await updateRequest.query(updateQuery);

    if (result.recordset.length > 0) {
      console.log(`✅ Đã cập nhật Feedback ${id} thành status: ${status}`);
      
      return res.json({
        success: true,
        message: 'Cập nhật trạng thái thành công',
        data: result.recordset[0],
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phản ánh với id này',
      });
    }
  } catch (error) {
    console.error('❌ Lỗi khi cập nhật trạng thái phản ánh:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật trạng thái',
      error: error.message,
    });
  }
};

/**
 * Lấy thống kê số lượng phản ánh theo trạng thái
 * @route GET /api/feedbacks/stats
 * @access Private (Admin - cần token)
 * 
 * Trả về: { pending: 5, processing: 2, resolved: 10 }
 */
const getFeedbackStats = async (req, res) => {
  try {
    const pool = await getPool();
    
    const result = await pool.request()
      .query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM [Feedback]
        GROUP BY status
      `);

    // Khởi tạo stats với giá trị mặc định 0
    const stats = {
      pending: 0,
      processing: 0,
      resolved: 0,
    };

    // Map kết quả từ DB vào stats object
    result.recordset.forEach(row => {
      const status = row.status?.toLowerCase();
      if (status === 'pending') {
        stats.pending = row.count;
      } else if (status === 'processing') {
        stats.processing = row.count;
      } else if (status === 'resolved') {
        stats.resolved = row.count;
      }
    });

    return res.json({
      success: true,
      message: 'Lấy thống kê phản ánh thành công',
      data: stats,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy thống kê phản ánh:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thống kê',
      error: error.message,
    });
  }
};

module.exports = {
  createFeedback,
  getAllFeedbacks,
  updateFeedbackStatus,
  getFeedbackStats,
};
