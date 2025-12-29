const { getPool, sql } = require('../dbConfig');

/**
 * User gửi phản ánh/báo cáo
 * @route POST /api/reports
 * @access Private (cần token)
 * 
 * @param {string} req.user.id - ID người gửi (lấy từ token sau khi verify)
 * @param {string} req.body.title - Tiêu đề phản ánh
 * @param {string} req.body.content - Nội dung chi tiết
 * @param {string} req.body.category - Danh mục (an_ninh, ve_sinh, ha_tang, dich_vu, khac)
 */
const createReport = async (req, res) => {
  try {
    // Lấy user_id từ thông tin đăng nhập (req.user.id từ middleware verifyToken)
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user. Vui lòng đăng nhập lại.',
      });
    }

    // Nhận các tham số từ req.body
    const { title, content, category } = req.body;

    // Validation
    if (!title || !content || !category) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: title, content, category',
      });
    }

    const pool = await getPool();
    const request = pool.request();

    // Bind các tham số (KHÔNG bind id vì cột id là Identity tự động tăng)
    request.input('user_id', sql.NVarChar, userId);
    request.input('title', sql.NVarChar, title);
    request.input('content', sql.NVarChar, content);
    request.input('category', sql.NVarChar, category);
    request.input('status', sql.NVarChar, 'Pending'); // Trạng thái mặc định là 'Pending'

    // Thực hiện INSERT (KHÔNG insert id, để SQL Server tự động sinh)
    try {
      const insertQuery = `
        INSERT INTO [Report] (
          user_id, title, content, category, status, created_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @user_id, @title, @content, @category, @status, GETDATE()
        )
      `;

      const result = await request.query(insertQuery);

      if (result.recordset.length > 0) {
        const createdReport = result.recordset[0];
        console.log(`✅ Đã tạo Report: ${createdReport.id} bởi User ${userId}`);
        
        return res.status(201).json({
          success: true,
          message: 'Đã gửi phản ánh thành công. Chúng tôi sẽ xử lý sớm nhất có thể.',
          data: createdReport,
        });
      } else {
        throw new Error('Không thể tạo phản ánh');
      }
    } catch (insertError) {
      // Nếu bảng không có một số cột, thử INSERT với các cột cơ bản hơn
      console.log('⚠️  Thử INSERT với các cột cơ bản...');
      
      const basicInsertQuery = `
        INSERT INTO [Report] (
          user_id, title, content, category, status, created_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @user_id, @title, @content, @category, @status, GETDATE()
        )
      `;

      const result = await request.query(basicInsertQuery);

      if (result.recordset.length > 0) {
        const createdReport = result.recordset[0];
        console.log(`✅ Đã tạo Report: ${createdReport.id} bởi User ${userId}`);
        
        return res.status(201).json({
          success: true,
          message: 'Đã gửi phản ánh thành công. Chúng tôi sẽ xử lý sớm nhất có thể.',
          data: createdReport,
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
 * Admin lấy toàn bộ danh sách phản ánh
 * @route GET /api/reports
 * @access Private (Admin - cần token)
 * 
 * Query: SELECT * FROM Report với LEFT JOIN User để lấy thông tin người gửi
 */
const getAllReports = async (req, res) => {
  try {
    const pool = await getPool();
    
    // Query với LEFT JOIN để lấy thông tin người gửi và căn hộ
    // Sử dụng LEFT JOIN để đảm bảo luôn lấy được report dù user không khớp
    // Format ngày tháng ngay trong SQL để tránh lệch múi giờ
    const query = `
      SELECT 
        r.id,
        r.user_id,
        r.title,
        r.content,
        r.category,
        r.status,
        r.admin_response,
        FORMAT(r.created_at, 'dd/MM/yyyy HH:mm') as created_at_formatted,
        u.full_name,
        u.household_id,
        h.code as household_code
      FROM [Report] r
      LEFT JOIN [User] u ON r.user_id = u.id
      LEFT JOIN [Household] h ON u.household_id = h.id
      ORDER BY r.created_at DESC
    `;

    console.log('🔍 Đang thực hiện query getAllReports với JOIN...');
    console.log('📝 SQL Query:', query);
    
    const result = await pool.request().query(query);
    
    console.log(`✅ Query thành công. Số lượng records từ DB: ${result.recordset.length}`);
    
    // Log chi tiết từng record để debug
    if (result.recordset.length > 0) {
      console.log('📋 Sample record (first):', JSON.stringify(result.recordset[0], null, 2));
      console.log('📋 Các cột có trong record:', Object.keys(result.recordset[0]));
    } else {
      console.log('⚠️  Không có dữ liệu trả về từ query. Kiểm tra lại:');
      console.log('   - Bảng Report có dữ liệu không?');
      console.log('   - Tên bảng có đúng không? (Report vs Reports)');
    }

    // Map lại dữ liệu để có user_name và apartment_number
    const reports = result.recordset.map(report => {
      // Xử lý full_name: Nếu null -> "Người dùng ẩn"
      const userName = report.full_name || 'Người dùng ẩn';
      
      // Lấy apartment_number từ household_code
      const apartmentNumber = report.household_code || null;
      
      return {
        id: report.id,
        user_id: report.user_id,
        title: report.title,
        content: report.content,
        category: report.category,
        status: report.status,
        admin_response: report.admin_response || null,
        created_at: report.created_at_formatted || '', // Sử dụng created_at đã được format trong SQL
        user_name: userName,
        apartment_number: apartmentNumber,
      };
    });

    console.log(`📊 Số lượng reports sau khi map: ${reports.length}`);
    if (reports.length > 0) {
      console.log('📋 Sample report sau map:', {
        id: reports[0].id,
        user_name: reports[0].user_name,
        apartment_number: reports[0].apartment_number,
        title: reports[0].title,
      });
    }

    return res.json({
      success: true,
      message: 'Lấy danh sách phản ánh thành công',
      data: reports,
      count: reports.length,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách phản ánh (getAllReports):', error);
    console.error('❌ Chi tiết lỗi:', {
      message: error.message,
      code: error.code,
      number: error.number,
      state: error.state,
      class: error.class,
      serverName: error.serverName,
      procName: error.procName,
      lineNumber: error.lineNumber,
      stack: error.stack,
    });
    
    // Nếu JOIN thất bại, thử query đơn giản không JOIN
    try {
      console.log('⚠️  Thử query đơn giản không JOIN...');
      const simpleQuery = `
        SELECT 
          id,
          user_id,
          title,
          content,
          category,
          status,
          admin_response,
          FORMAT(created_at, 'dd/MM/yyyy HH:mm') as created_at_formatted
        FROM [Report] 
        ORDER BY created_at DESC
      `;
      const simpleResult = await pool.request().query(simpleQuery);
      
      console.log(`📊 Query đơn giản trả về: ${simpleResult.recordset.length} records`);
      
      // Map với giá trị mặc định
      const reports = simpleResult.recordset.map(report => ({
        id: report.id,
        user_id: report.user_id,
        title: report.title,
        content: report.content,
        category: report.category,
        status: report.status,
        admin_response: report.admin_response || null,
        created_at: report.created_at_formatted, // Sử dụng created_at đã được format trong SQL
        user_name: 'Không xác định',
        apartment_number: null,
      }));
      
      return res.json({
        success: true,
        message: 'Lấy danh sách phản ánh thành công (không có thông tin người gửi)',
        data: reports,
        count: reports.length,
      });
    } catch (fallbackError) {
      console.error('❌ Lỗi cả query đơn giản:', fallbackError);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy danh sách phản ánh',
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? {
          code: error.code,
          number: error.number,
          state: error.state,
          lineNumber: error.lineNumber,
        } : undefined,
      });
    }
  }
};

/**
 * User lấy danh sách phản ánh của chính mình
 * @route GET /api/reports/my-reports
 * @access Private (cần token)
 * 
 * Query: SELECT * FROM Report WHERE user_id = @user_id ORDER BY created_at DESC
 * User chỉ xem được các phản ánh do chính mình gửi
 */
const getMyReports = async (req, res) => {
  try {
    // Lấy user_id từ thông tin đăng nhập (req.user.id từ middleware verifyToken)
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user. Vui lòng đăng nhập lại.',
      });
    }

    const pool = await getPool();
    const request = pool.request();
    
    // Bind tham số user_id
    request.input('user_id', sql.NVarChar, userId);

    // Query: SELECT * FROM Report WHERE user_id = @user_id ORDER BY created_at DESC
    const query = `
      SELECT * 
      FROM [Report] 
      WHERE user_id = @user_id 
      ORDER BY created_at DESC
    `;

    const result = await request.query(query);

    return res.json({
      success: true,
      message: 'Lấy danh sách phản ánh thành công',
      data: result.recordset,
      count: result.recordset.length,
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
 * @route PUT /api/reports/:id/status
 * @access Private (Admin - cần token)
 * 
 * @param {string} req.params.id - ID phản ánh
 * @param {string} req.body.status - Trạng thái mới ('Pending', 'Processing', 'Resolved')
 * @param {string} req.body.admin_response - Phản hồi của Admin (tùy chọn)
 */
const updateReportStatus = async (req, res) => {
  try {
    const pool = await getPool();
    
    // Log toàn bộ body để kiểm tra Frontend gửi gì
    console.log('📦 Body received:', JSON.stringify(req.body, null, 2));
    
    // Lấy id từ params
    const { id } = req.params;
    
    // Lấy status và admin_response từ body (xử lý cả camelCase và snake_case)
    const { status, admin_response, adminResponse } = req.body;
    
    // Ưu tiên cái nào có dữ liệu (admin_response hoặc adminResponse)
    const responseToSave = admin_response || adminResponse;

    console.log('🔍 updateReportStatus - Nhận được:');
    console.log('   - id:', id);
    console.log('   - status:', status);
    console.log('   - admin_response (snake_case):', admin_response);
    console.log('   - adminResponse (camelCase):', adminResponse);
    console.log('   - responseToSave (final):', responseToSave);

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

    // Thực hiện UPDATE - Đảm bảo update đúng bảng Report (KHÔNG phải Feedback)
    const updateRequest = pool.request();
    
    // QUAN TRỌNG: Phải bind tất cả các tham số trước khi execute
    updateRequest.input('id', sql.NVarChar, id);
    updateRequest.input('status', sql.NVarChar, status);
    
    // Xử lý admin_response: Nếu có giá trị thì set, nếu không thì set NULL
    // QUAN TRỌNG: Phải luôn bind admin_response, dù có giá trị hay không
    let adminResponseValue = null;
    if (responseToSave !== undefined && responseToSave !== null) {
      const trimmedResponse = String(responseToSave).trim();
      adminResponseValue = trimmedResponse !== '' ? trimmedResponse : null;
    } else {
      console.warn('⚠️  Warning: Không nhận được nội dung phản hồi (admin_response/adminResponse đều không có giá trị)');
    }
    
    updateRequest.input('admin_response', sql.NVarChar, adminResponseValue);
    
    const updateQuery = `
      UPDATE [Report] 
      SET status = @status, 
          admin_response = @admin_response, 
          updated_at = GETDATE()
      WHERE id = @id
    `;

    console.log('📝 SQL Update Query:', updateQuery);
    console.log('📝 Parameters:');
    console.log('   - id:', id);
    console.log('   - status:', status);
    console.log('   - admin_response (final value):', adminResponseValue);
    console.log('   - admin_response (original snake_case):', admin_response);
    console.log('   - adminResponse (original camelCase):', adminResponse);
    console.log('   - responseToSave:', responseToSave);

    const result = await updateRequest.query(updateQuery);

    // Log kết quả update
    const rowsAffected = result.rowsAffected[0] || 0;
    console.log(`📊 Kết quả update: ${rowsAffected} dòng bị ảnh hưởng`);

    if (rowsAffected > 0) {
      console.log(`✅ Đã cập nhật Report ${id} thành status: ${status}, admin_response: ${admin_response || 'NULL'}`);
      
      // Lấy lại record đã update để trả về
      const selectRequest = pool.request();
      selectRequest.input('id', sql.NVarChar, id);
      const selectResult = await selectRequest.query(`
        SELECT * FROM [Report] WHERE id = @id
      `);

      return res.json({
        success: true,
        message: 'Cập nhật trạng thái thành công',
        data: selectResult.recordset[0] || { id, status, admin_response },
      });
    } else {
      console.log(`⚠️  Không tìm thấy Report với id: ${id}`);
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy phản ánh với id này',
      });
    }
  } catch (error) {
    console.error('❌ Lỗi khi cập nhật trạng thái phản ánh:', error);
    console.error('❌ Chi tiết lỗi:', {
      message: error.message,
      code: error.code,
      number: error.number,
      state: error.state,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật trạng thái',
      error: error.message,
    });
  }
};

/**
 * Lấy thống kê số lượng phản ánh theo trạng thái
 * @route GET /api/reports/stats
 * @access Private (Admin - cần token)
 * 
 * Trả về: { pending: 5, processing: 2, resolved: 10 }
 */
const getReportStats = async (req, res) => {
  try {
    const pool = await getPool();
    
    const result = await pool.request()
      .query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM [Report]
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

    console.log(`📊 Report Stats:`, stats);

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

/**
 * Lấy thống kê dân số theo độ tuổi (cho trang Báo cáo)
 * @route GET /api/reports/demographic-stats
 * @access Private (Admin - cần token)
 * 
 * Trả về: {
 *   counts: { children: 10, voters: 50, elderly: 5, total: 65 },
 *   lists: {
 *     children: [...danh sách trẻ em...],
 *     voters: [...danh sách cử tri...],
 *     elderly: [...danh sách người cao tuổi...]
 *   }
 * }
 */
const getDemographicStats = async (req, res) => {
  try {
    const pool = await getPool();
    
    // Query lấy tất cả nhân khẩu với thông tin hộ khẩu và tính tuổi
    // Sử dụng DATEDIFF để tính tuổi từ dob
    const query = `
      SELECT 
        m.id,
        m.name,
        m.dob,
        m.gender,
        m.role,
        m.idCard,
        h.code as household_code,
        h.address,
        DATEDIFF(YEAR, m.dob, GETDATE()) as age
      FROM [HouseholdMember] m
      LEFT JOIN [Household] h ON m.household_id = h.id
      WHERE m.dob IS NOT NULL
      ORDER BY m.name ASC
    `;

    console.log('🔍 Đang thực hiện query getDemographicStats...');
    console.log('📝 SQL Query:', query);
    
    const result = await pool.request().query(query);
    
    console.log(`✅ Query thành công. Số lượng records từ DB: ${result.recordset.length}`);
    
    // Phân loại theo độ tuổi
    const children = []; // Tuổi < 15
    const voters = []; // Tuổi >= 18
    const elderly = []; // Tuổi >= 70
    
    result.recordset.forEach(member => {
      const age = member.age || 0;
      
      // Format dob để hiển thị đẹp
      let formattedDob = member.dob;
      if (member.dob) {
        try {
          // Nếu dob là string, format lại
          if (typeof member.dob === 'string') {
            const date = new Date(member.dob);
            if (!isNaN(date.getTime())) {
              formattedDob = date.toLocaleDateString('vi-VN');
            }
          } else if (member.dob instanceof Date) {
            formattedDob = member.dob.toLocaleDateString('vi-VN');
          }
        } catch (e) {
          // Giữ nguyên nếu không format được
          formattedDob = member.dob;
        }
      }
      
      const memberData = {
        id: member.id,
        name: member.name || 'Chưa có tên',
        dob: formattedDob,
        age: age,
        gender: member.gender || 'Chưa có',
        role: member.role || 'Chưa có',
        idCard: member.idCard || 'Chưa có',
        household_code: member.household_code || 'Chưa có',
        address: member.address || 'Chưa có',
      };
      
      // Phân loại
      if (age < 15) {
        children.push(memberData);
      }
      if (age >= 18) {
        voters.push(memberData);
      }
      if (age >= 70) {
        elderly.push(memberData);
      }
    });
    
    const counts = {
      total: result.recordset.length,
      children: children.length,
      voters: voters.length,
      elderly: elderly.length,
    };
    
    const lists = {
      children: children,
      voters: voters,
      elderly: elderly,
    };
    
    console.log(`📊 Thống kê dân số:`, counts);
    console.log(`   - Trẻ em (<15): ${children.length}`);
    console.log(`   - Cử tri (>=18): ${voters.length}`);
    console.log(`   - Người cao tuổi (>=70): ${elderly.length}`);
    
    return res.json({
      success: true,
      message: 'Lấy thống kê dân số thành công',
      data: {
        counts,
        lists,
      },
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy thống kê dân số:', error);
    console.error('❌ Chi tiết lỗi:', {
      message: error.message,
      code: error.code,
      number: error.number,
      state: error.state,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thống kê dân số',
      error: error.message,
    });
  }
};

module.exports = {
  createReport,
  getAllReports,
  getMyReports,
  getReportStats,
  updateReportStatus,
  getDemographicStats,
};

