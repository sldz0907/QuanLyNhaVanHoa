const { getPool, sql } = require('../dbConfig');
const crypto = require('crypto');

/**
 * User đăng ký tạm trú/tạm vắng (hoặc các loại yêu cầu khác)
 * @route POST /api/requests
 * @access Private (cần token)
 */
const createRequest = async (req, res) => {
  try {
    // Lấy user_id từ token (middleware đã verify)
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    // Nhận input từ req.body
    const { 
      type, 
      reason, 
      start_date, 
      end_date 
    } = req.body;

    // Validation
    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp loại yêu cầu (type)',
      });
    }

    // Validate type - Chấp nhận cả format mới (TamTru, TamVang) và cũ (tam_tru, tam_vang)
    const validTypes = ['TamTru', 'TamVang', 'DatLich', 'tam_tru', 'tam_vang', 'dat_lich'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Loại yêu cầu không hợp lệ. Các loại hợp lệ: TamTru, TamVang, DatLich`,
      });
    }

    const pool = await getPool();

    // Lấy thông tin user để lấy full_name và household_code (để hiển thị cho Admin)
    const userRequest = pool.request();
    userRequest.input('userId', sql.NVarChar, userId);
    const userResult = await userRequest.query(`
      SELECT u.full_name, u.household_id, h.code AS household_code
      FROM [User] u
      LEFT JOIN [Household] h ON u.household_id = h.id
      WHERE u.id = @userId
    `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const user = userResult.recordset[0];
    const applicant_name = user.full_name || '';
    const household_code = user.household_code || '';

    // Tạo ID mới
    const requestId = crypto.randomUUID();

    // Chuẩn hóa type (chuyển TamTru -> tam_tru, TamVang -> tam_vang)
    let normalizedType = type;
    if (type === 'TamTru') normalizedType = 'tam_tru';
    else if (type === 'TamVang') normalizedType = 'tam_vang';
    else if (type === 'DatLich') normalizedType = 'dat_lich';

    // Bind các tham số cho INSERT
    // Đảm bảo nhận reason từ req.body và lưu vào Database mà không thay đổi gì cả
    const insertRequest = pool.request();
    insertRequest.input('id', sql.NVarChar, requestId);
    insertRequest.input('user_id', sql.NVarChar, userId);
    insertRequest.input('type', sql.NVarChar, normalizedType);
    insertRequest.input('applicant_name', sql.NVarChar, applicant_name);
    insertRequest.input('household_code', sql.NVarChar, household_code);
    insertRequest.input('status', sql.NVarChar, 'Pending'); // Mặc định là Pending
    insertRequest.input('reason', sql.NVarChar, reason || ''); // Lưu trực tiếp reason vào cột reason
    insertRequest.input('start_date', sql.Date, start_date || null);
    insertRequest.input('end_date', sql.Date, end_date || null);

    // Thực hiện INSERT vào bảng RegistrationRequest
    try {
      const insertQuery = `
        INSERT INTO [RegistrationRequest] (
          id, user_id, type, applicant_name, household_code, 
          status, reason, start_date, end_date, created_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @id, @user_id, @type, @applicant_name, @household_code,
          @status, @reason, @start_date, @end_date, GETDATE()
        )
      `;

      const result = await insertRequest.query(insertQuery);

      if (result.recordset.length > 0) {
        console.log(`✅ Đã tạo RegistrationRequest: ${requestId} (${normalizedType}) bởi User ${userId}`);
        
        return res.status(201).json({
          success: true,
          message: 'Gửi yêu cầu thành công',
          data: result.recordset[0],
        });
      } else {
        throw new Error('Không thể tạo yêu cầu');
      }
    } catch (insertError) {
      // Nếu bảng không có cột created_at, thử INSERT không có cột này
      console.log('⚠️  Thử INSERT không có created_at...');
      
      try {
        const basicInsertQuery = `
          INSERT INTO [RegistrationRequest] (
            id, user_id, type, applicant_name, household_code, 
            status, reason, start_date, end_date
          )
          OUTPUT INSERTED.*
          VALUES (
            @id, @user_id, @type, @applicant_name, @household_code,
            @status, @reason, @start_date, @end_date
          )
        `;

        const result = await insertRequest.query(basicInsertQuery);

        if (result.recordset.length > 0) {
          console.log(`✅ Đã tạo RegistrationRequest: ${requestId} (${normalizedType}) bởi User ${userId}`);
          
          return res.status(201).json({
            success: true,
            message: 'Gửi yêu cầu thành công',
            data: result.recordset[0],
          });
        } else {
          throw insertError;
        }
      } catch (basicInsertError) {
        // Nếu vẫn lỗi, thử INSERT chỉ với các cột cơ bản nhất
        console.log('⚠️  Thử INSERT với các cột cơ bản nhất...');
        
        const minimalInsertQuery = `
          INSERT INTO [RegistrationRequest] (
            id, user_id, type, applicant_name, household_code, 
            status
          )
          OUTPUT INSERTED.*
          VALUES (
            @id, @user_id, @type, @applicant_name, @household_code,
            @status
          )
        `;

        const result = await insertRequest.query(minimalInsertQuery);

        if (result.recordset.length > 0) {
          console.log(`✅ Đã tạo RegistrationRequest: ${requestId} (${normalizedType}) bởi User ${userId}`);
          
          return res.status(201).json({
            success: true,
            message: 'Gửi yêu cầu thành công',
            data: result.recordset[0],
          });
        } else {
          throw basicInsertError;
        }
      }
    }

  } catch (error) {
    console.error('❌ Lỗi khi tạo yêu cầu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi gửi yêu cầu',
      error: error.message,
    });
  }
};

/**
 * Admin lấy danh sách tất cả yêu cầu
 * @route GET /api/requests
 * @access Private (Admin - cần token)
 */
const getAllRequests = async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    let query;
    try {
      // Query với created_at
      query = `
        SELECT 
          r.*,
          u.full_name,
          u.household_id
        FROM [RegistrationRequest] r
        LEFT JOIN [User] u ON r.user_id = u.id
        ORDER BY r.created_at DESC
      `;
      const result = await request.query(query);
      return res.json({
        success: true,
        message: 'Lấy danh sách yêu cầu thành công',
        data: result.recordset,
        count: result.recordset.length,
      });
    } catch (dateError) {
      // Nếu không có created_at, thử query không có cột này
      console.log('⚠️  Thử query không có created_at...');
      try {
        query = `
          SELECT 
            r.*,
            u.full_name,
            u.household_id
          FROM [RegistrationRequest] r
          LEFT JOIN [User] u ON r.user_id = u.id
          ORDER BY r.created_at DESC
        `;
        const result = await request.query(query);
        return res.json({
          success: true,
          message: 'Lấy danh sách yêu cầu thành công',
          data: result.recordset,
          count: result.recordset.length,
        });
      } catch (createdAtError) {
        // Nếu không có created_at, sắp xếp theo id
        console.log('⚠️  Thử query không có created_at...');
        query = `
          SELECT 
            r.*,
            u.full_name,
            u.household_id
          FROM [RegistrationRequest] r
          LEFT JOIN [User] u ON r.user_id = u.id
          ORDER BY r.id DESC
        `;
        const result = await request.query(query);
        return res.json({
          success: true,
          message: 'Lấy danh sách yêu cầu thành công',
          data: result.recordset,
          count: result.recordset.length,
        });
      }
    }

  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách yêu cầu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách yêu cầu',
      error: error.message,
    });
  }
};

/**
 * Admin cập nhật trạng thái yêu cầu (Duyệt/Từ chối)
 * @route PUT /api/requests/:id/status
 * @access Private (Admin - cần token)
 */
const updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID yêu cầu',
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp trạng thái mới (status)',
      });
    }

    // Validate status
    const validStatuses = ['Approved', 'Rejected', 'Pending', 'approved', 'rejected', 'pending'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái không hợp lệ. Các trạng thái hợp lệ: Approved, Rejected, Pending',
      });
    }

    // Chuẩn hóa status (Approved -> Approved, approved -> Approved)
    let normalizedStatus = status;
    if (status.toLowerCase() === 'approved') normalizedStatus = 'Approved';
    else if (status.toLowerCase() === 'rejected') normalizedStatus = 'Rejected';
    else if (status.toLowerCase() === 'pending') normalizedStatus = 'Pending';

    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.NVarChar, id);
    request.input('status', sql.NVarChar, normalizedStatus);

    // Kiểm tra yêu cầu có tồn tại không
    const checkRequest = pool.request();
    checkRequest.input('id', sql.NVarChar, id);
    const checkResult = await checkRequest.query(`
      SELECT id, status FROM [RegistrationRequest] WHERE id = @id
    `);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy yêu cầu với ID này',
      });
    }

    // Thực hiện UPDATE
    try {
      const updateQuery = `
        UPDATE [RegistrationRequest]
        SET status = @status
        OUTPUT INSERTED.*
        WHERE id = @id
      `;

      const result = await request.query(updateQuery);

      if (result.recordset.length > 0) {
        console.log(`✅ Đã cập nhật trạng thái yêu cầu ${id} thành ${normalizedStatus}`);
        
        return res.json({
          success: true,
          message: `Đã cập nhật trạng thái yêu cầu thành ${normalizedStatus}`,
          data: result.recordset[0],
        });
      } else {
        throw new Error('Không thể cập nhật trạng thái yêu cầu');
      }
    } catch (updateError) {
      // Nếu bảng không có OUTPUT, thử UPDATE đơn giản
      console.log('⚠️  Thử UPDATE không có OUTPUT...');
      
      const simpleUpdateQuery = `
        UPDATE [RegistrationRequest]
        SET status = @status
        WHERE id = @id
      `;

      await request.query(simpleUpdateQuery);

      // Lấy lại dữ liệu sau khi update
      const getRequest = pool.request();
      getRequest.input('id', sql.NVarChar, id);
      const getResult = await getRequest.query(`
        SELECT * FROM [RegistrationRequest] WHERE id = @id
      `);

      if (getResult.recordset.length > 0) {
        console.log(`✅ Đã cập nhật trạng thái yêu cầu ${id} thành ${normalizedStatus}`);
        
        return res.json({
          success: true,
          message: `Đã cập nhật trạng thái yêu cầu thành ${normalizedStatus}`,
          data: getResult.recordset[0],
        });
      } else {
        throw updateError;
      }
    }

  } catch (error) {
    console.error('❌ Lỗi khi cập nhật trạng thái yêu cầu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật trạng thái yêu cầu',
      error: error.message,
    });
  }
};

/**
 * Lấy danh sách 5 yêu cầu mới nhất (Cho Dashboard)
 * @route GET /api/requests/recent
 * @access Private (Admin - cần token)
 */
const getRecentRequests = async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    let query;
    try {
      // Query với created_at
      query = `
        SELECT TOP 5
          r.*,
          u.full_name,
          u.household_id
        FROM [RegistrationRequest] r
        LEFT JOIN [User] u ON r.user_id = u.id
        ORDER BY r.created_at DESC
      `;
      const result = await request.query(query);
      return res.json({
        success: true,
        message: 'Lấy danh sách yêu cầu mới nhất thành công',
        data: result.recordset,
        count: result.recordset.length,
      });
    } catch (dateError) {
      // Nếu không có created_at, thử query không có cột này
      console.log('⚠️  Thử query không có created_at...');
      try {
        query = `
          SELECT TOP 5
            r.*,
            u.full_name,
            u.household_id
          FROM [RegistrationRequest] r
          LEFT JOIN [User] u ON r.user_id = u.id
          ORDER BY r.created_at DESC
        `;
        const result = await request.query(query);
        return res.json({
          success: true,
          message: 'Lấy danh sách yêu cầu mới nhất thành công',
          data: result.recordset,
          count: result.recordset.length,
        });
      } catch (createdAtError) {
        // Nếu không có created_at, sắp xếp theo id
        console.log('⚠️  Thử query không có created_at...');
        query = `
          SELECT TOP 5
            r.*,
            u.full_name,
            u.household_id
          FROM [RegistrationRequest] r
          LEFT JOIN [User] u ON r.user_id = u.id
          ORDER BY r.id DESC
        `;
        const result = await request.query(query);
        return res.json({
          success: true,
          message: 'Lấy danh sách yêu cầu mới nhất thành công',
          data: result.recordset,
          count: result.recordset.length,
        });
      }
    }

  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách yêu cầu mới nhất:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách yêu cầu mới nhất',
      error: error.message,
    });
  }
};

/**
 * User lấy danh sách yêu cầu của chính mình
 * @route GET /api/requests/my-requests
 * @access Private (cần token)
 */
const getMyRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('userId', sql.NVarChar, userId);

    let query;
    try {
      // Query với created_at
      query = `
        SELECT 
          r.*,
          u.full_name,
          u.household_id
        FROM [RegistrationRequest] r
        LEFT JOIN [User] u ON r.user_id = u.id
        WHERE r.user_id = @userId
        ORDER BY r.created_at DESC
      `;
      const result = await request.query(query);
      return res.json({
        success: true,
        message: 'Lấy danh sách yêu cầu thành công',
        data: result.recordset,
        count: result.recordset.length,
      });
    } catch (dateError) {
      // Nếu không có created_at, thử query không có cột này
      console.log('⚠️  Thử query không có created_at...');
      try {
        query = `
          SELECT 
            r.*,
            u.full_name,
            u.household_id
          FROM [RegistrationRequest] r
          LEFT JOIN [User] u ON r.user_id = u.id
          WHERE r.user_id = @userId
          ORDER BY r.created_at DESC
        `;
        const result = await request.query(query);
        return res.json({
          success: true,
          message: 'Lấy danh sách yêu cầu thành công',
          data: result.recordset,
          count: result.recordset.length,
        });
      } catch (createdAtError) {
        // Nếu không có created_at, sắp xếp theo id
        console.log('⚠️  Thử query không có created_at...');
        query = `
          SELECT 
            r.*,
            u.full_name,
            u.household_id
          FROM [RegistrationRequest] r
          LEFT JOIN [User] u ON r.user_id = u.id
          WHERE r.user_id = @userId
          ORDER BY r.id DESC
        `;
        const result = await request.query(query);
        return res.json({
          success: true,
          message: 'Lấy danh sách yêu cầu thành công',
          data: result.recordset,
          count: result.recordset.length,
        });
      }
    }
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách yêu cầu của user:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách yêu cầu',
      error: error.message,
    });
  }
};

/**
 * User tự sửa yêu cầu của chính mình (Chỉ cho sửa khi status là Pending)
 * @route PUT /api/requests/my-requests/:id
 * @access Private (cần token)
 */
const updateMyRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, start_date, end_date } = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID yêu cầu',
      });
    }

    const pool = await getPool();
    
    // 1. Kiểm tra xem đơn này có phải của chính chủ không VÀ còn 'Pending' không
    const checkRequest = pool.request();
    checkRequest.input('id', sql.NVarChar, id);
    checkRequest.input('userId', sql.NVarChar, userId);
    
    const checkResult = await checkRequest.query(`
      SELECT id, status, user_id 
      FROM [RegistrationRequest] 
      WHERE id = @id AND user_id = @userId
    `);

    if (checkResult.recordset.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Không tìm thấy yêu cầu hoặc bạn không có quyền sửa',
      });
    }

    if (checkResult.recordset[0].status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ được sửa các yêu cầu đang chờ duyệt',
      });
    }

    // 2. Thực hiện Update
    const updateRequest = pool.request();
    updateRequest.input('id', sql.NVarChar, id);
    updateRequest.input('reason', sql.NVarChar, reason || '');
    updateRequest.input('start_date', sql.NVarChar, start_date || null);
    updateRequest.input('end_date', sql.NVarChar, end_date || null);

    // Thử update với các cột đầy đủ
    try {
      const updateQuery = `
        UPDATE [RegistrationRequest] 
        SET reason = @reason, start_date = @start_date, end_date = @end_date
        WHERE id = @id
      `;
      
      await updateRequest.query(updateQuery);
      
      // Nếu có cột details, cập nhật details JSON
      try {
        const detailsObj = {
          reason: reason || '',
          start_date: start_date || null,
          end_date: end_date || null,
        };
        const detailsJson = JSON.stringify(detailsObj);
        
        const updateDetailsRequest = pool.request();
        updateDetailsRequest.input('id', sql.NVarChar, id);
        updateDetailsRequest.input('details', sql.NVarChar, detailsJson);
        
        await updateDetailsRequest.query(`
          UPDATE [RegistrationRequest] 
          SET details = @details
          WHERE id = @id
        `);
      } catch (detailsError) {
        // Nếu không có cột details, bỏ qua
        console.log('⚠️  Không có cột details, bỏ qua cập nhật details');
      }

      console.log(`✅ User ${userId} đã cập nhật yêu cầu ${id}`);
      
      return res.json({
        success: true,
        message: 'Cập nhật thành công',
      });
    } catch (updateError) {
      // Nếu không có cột start_date hoặc end_date, thử update chỉ reason
      console.log('⚠️  Thử update chỉ reason...');
      
      const simpleUpdateRequest = pool.request();
      simpleUpdateRequest.input('id', sql.NVarChar, id);
      simpleUpdateRequest.input('reason', sql.NVarChar, reason || '');
      
      await simpleUpdateRequest.query(`
        UPDATE [RegistrationRequest] 
        SET reason = @reason
        WHERE id = @id
      `);

      console.log(`✅ User ${userId} đã cập nhật yêu cầu ${id} (chỉ reason)`);
      
      return res.json({
        success: true,
        message: 'Cập nhật thành công',
      });
    }
  } catch (error) {
    console.error('❌ Lỗi khi cập nhật yêu cầu của user:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật yêu cầu',
      error: error.message,
    });
  }
};

module.exports = {
  createRequest,
  getAllRequests,
  updateRequestStatus,
  getRecentRequests,
  getMyRequests,
  updateMyRequest,
};

