const { getPool, sql } = require('../dbConfig');
const crypto = require('crypto');

/**
 * Tạo nhân khẩu mới (thêm người vào hộ khẩu)
 * @route POST /api/residents
 * @access Private (Admin only - cần token)
 */
const createResident = async (req, res) => {
  let pool;
  let transaction;
  
  try {
    const { household_code, full_name, dob, gender, relation, cccd } = req.body;

    // Validation
    if (!household_code || !full_name || !relation) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: household_code, full_name, relation',
      });
    }

    pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // ============================================
    // Bước 1: Tìm household_id dựa vào household_code
    // ============================================
    const householdRequest = new sql.Request(transaction);
    householdRequest.input('code', sql.NVarChar, household_code);
    
    const householdQuery = `
      SELECT id
      FROM [Household]
      WHERE code = @code
    `;
    
    const householdResult = await householdRequest.query(householdQuery);

    if (householdResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Không tìm thấy hộ khẩu với mã: ${household_code}`,
      });
    }

    const householdId = householdResult.recordset[0].id;
    console.log(`✅ Tìm thấy Household: ${householdId} (${household_code})`);

    // ============================================
    // Bước 2: INSERT vào bảng HouseholdMember
    // ============================================
    const memberId = crypto.randomUUID();
    const memberRequest = new sql.Request(transaction);
    memberRequest.input('id', sql.NVarChar, memberId);
    memberRequest.input('household_id', sql.NVarChar, householdId);
    memberRequest.input('name', sql.NVarChar, full_name);
    memberRequest.input('role', sql.NVarChar, relation); // relation = role trong bảng HouseholdMember
    
    // Xử lý các trường optional với giá trị mặc định
    let safeDob;
    if (dob) {
      // Nếu là Date object, convert sang string
      if (dob instanceof Date) {
        safeDob = dob.toISOString().split('T')[0];
      } else if (typeof dob === 'string') {
        safeDob = dob;
      } else {
        safeDob = new Date().toISOString().split('T')[0];
      }
    } else {
      safeDob = new Date().toISOString().split('T')[0];
    }
    
    const safeGender = (gender && typeof gender === 'string' && gender.trim() !== '') 
      ? gender.trim() 
      : 'Nam';
    const safeCccd = (cccd && typeof cccd === 'string' && cccd.trim() !== '') 
      ? cccd.trim() 
      : 'Chưa có';
    
    memberRequest.input('dob', sql.NVarChar, safeDob);
    memberRequest.input('gender', sql.NVarChar, safeGender);
    memberRequest.input('idCard', sql.NVarChar, safeCccd);

    try {
      // Thử INSERT có created_at
      await memberRequest.query(`
        INSERT INTO [HouseholdMember] (id, household_id, name, role, dob, gender, idCard, created_at)
        VALUES (@id, @household_id, @name, @role, @dob, @gender, @idCard, GETDATE())
      `);
    } catch (createdAtError) {
      // Nếu không có cột created_at, INSERT không có cột này
      console.log('⚠️  Bảng HouseholdMember không có cột created_at, bỏ qua...');
      await memberRequest.query(`
        INSERT INTO [HouseholdMember] (id, household_id, name, role, dob, gender, idCard)
        VALUES (@id, @household_id, @name, @role, @dob, @gender, @idCard)
      `);
    }

    console.log(`✅ Đã tạo HouseholdMember: ${memberId} (${full_name} - ${relation})`);

    // ============================================
    // Bước 3: Tự động cập nhật household_id cho User nếu có tài khoản
    // Mục đích: Nếu người dân đã có tài khoản từ trước, ngay khi Admin thêm tên họ vào sổ hộ khẩu, 
    //           tài khoản của họ sẽ tự động cập nhật dữ liệu gia đình
    // ============================================
    if (safeCccd && safeCccd !== 'Chưa có' && safeCccd.trim() !== '') {
      try {
        // 1. Kiểm tra bảng [User] với CCCD vừa thêm
        const userCheckRequest = new sql.Request(transaction);
        userCheckRequest.input('cccd', sql.NVarChar, safeCccd.trim());
        
        const userCheckQuery = `
          SELECT id 
          FROM [User] 
          WHERE cccd = @cccd
        `;
        
        const userCheckResult = await userCheckRequest.query(userCheckQuery);
        
        // 2. Nếu tìm thấy User tương ứng
        if (userCheckResult.recordset.length > 0) {
          const foundUserId = userCheckResult.recordset[0].id;
          
          if (foundUserId) {
            // 3. Thực hiện UPDATE: UPDATE [User] SET household_id = @currentHouseholdId WHERE cccd = @cccd
            const updateUserRequest = new sql.Request(transaction);
            updateUserRequest.input('cccd', sql.NVarChar, safeCccd.trim());
            updateUserRequest.input('householdId', sql.NVarChar, householdId);
            
            await updateUserRequest.query(`
              UPDATE [User] 
              SET household_id = @householdId 
              WHERE cccd = @cccd
            `);
            
            console.log(`✅ Đã tự động cập nhật household_id cho User ${foundUserId} (CCCD: ${safeCccd.trim()}) với Household ${householdId}`);
          }
        } else {
          console.log(`ℹ️  Không tìm thấy User với CCCD ${safeCccd.trim()} - Chưa có tài khoản`);
        }
      } catch (userUpdateError) {
        // Nếu lỗi khi cập nhật User, không ảnh hưởng đến việc thêm nhân khẩu
        // Chỉ log lỗi, không throw để Admin vẫn thêm nhân khẩu thành công
        console.error('⚠️  Lỗi khi tự động cập nhật household_id cho User (không ảnh hưởng đến thêm nhân khẩu):', userUpdateError.message);
      }
    }

    // Commit transaction
    await transaction.commit();

    // ============================================
    // Bước 3: Trả về kết quả
    // ============================================
    return res.status(201).json({
      success: true,
      message: `Đã thêm nhân khẩu ${full_name} vào hộ khẩu ${household_code} thành công`,
      data: {
        id: memberId,
        household_id: householdId,
        household_code: household_code,
        name: full_name,
        role: relation,
        dob: safeDob,
        gender: safeGender,
        idCard: safeCccd,
      },
    });

  } catch (error) {
    // Rollback transaction nếu có lỗi
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('❌ Lỗi khi rollback transaction:', rollbackError);
      }
    }
    
    console.error('❌ Lỗi khi tạo nhân khẩu:', error);
    console.error('❌ Chi tiết lỗi:', {
      message: error.message,
      code: error.code,
      number: error.number,
      originalError: error.originalError?.message,
      stack: error.stack,
    });
    
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi tạo nhân khẩu',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? {
        code: error.code,
        number: error.number,
        originalError: error.originalError?.message,
      } : undefined,
    });
  }
};

/**
 * Lấy danh sách tất cả nhân khẩu
 * @route GET /api/residents
 * @access Private (Admin only - cần token)
 */
const getAllResidents = async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    
    // Query lấy danh sách nhân khẩu kèm thông tin hộ khẩu
    try {
      // Thử query có created_at
      const query = `
        SELECT 
          m.*,
          h.code AS household_code,
          h.address
        FROM [HouseholdMember] m
        LEFT JOIN [Household] h ON m.household_id = h.id
        ORDER BY m.created_at DESC
      `;
      const result = await request.query(query);
      
      return res.json({
        success: true,
        message: 'Lấy danh sách nhân khẩu thành công',
        data: result.recordset,
        count: result.recordset.length,
      });
    } catch (createdAtError) {
      // Nếu không có cột created_at, query không có ORDER BY created_at
      console.log('⚠️  Bảng HouseholdMember không có cột created_at, sắp xếp theo name...');
      const query = `
        SELECT 
          m.*,
          h.code AS household_code,
          h.address
        FROM [HouseholdMember] m
        LEFT JOIN [Household] h ON m.household_id = h.id
        ORDER BY m.name ASC
      `;
      const result = await request.query(query);
      
      return res.json({
        success: true,
        message: 'Lấy danh sách nhân khẩu thành công',
        data: result.recordset,
        count: result.recordset.length,
      });
    }
    
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách nhân khẩu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách nhân khẩu',
      error: error.message,
    });
  }
};

/**
 * Cập nhật thông tin nhân khẩu
 * @route PUT /api/residents/:id
 * @access Private (Admin only - cần token)
 */
const updateResident = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, dob, gender, role, idCard, occupation, workplace } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID nhân khẩu',
      });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.NVarChar, id);

    // Xây dựng câu lệnh UPDATE động
    const updateFields = [];
    
    if (name !== undefined) {
      updateFields.push('name = @name');
      request.input('name', sql.NVarChar, name);
    }
    if (dob !== undefined) {
      // Xử lý dob: có thể là Date object hoặc string
      let safeDob;
      if (dob instanceof Date) {
        safeDob = dob.toISOString().split('T')[0];
      } else if (typeof dob === 'string') {
        safeDob = dob;
      } else {
        safeDob = dob;
      }
      updateFields.push('dob = @dob');
      request.input('dob', sql.NVarChar, safeDob);
    }
    if (gender !== undefined) {
      updateFields.push('gender = @gender');
      request.input('gender', sql.NVarChar, gender);
    }
    if (role !== undefined) {
      updateFields.push('role = @role');
      request.input('role', sql.NVarChar, role);
    }
    if (idCard !== undefined) {
      updateFields.push('idCard = @idCard');
      request.input('idCard', sql.NVarChar, idCard);
    }
    if (occupation !== undefined) {
      updateFields.push('occupation = @occupation');
      request.input('occupation', sql.NVarChar, occupation);
    }
    if (workplace !== undefined) {
      updateFields.push('workplace = @workplace');
      request.input('workplace', sql.NVarChar, workplace);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ít nhất một trường để cập nhật',
      });
    }

    const updateQuery = `
      UPDATE [HouseholdMember]
      SET ${updateFields.join(', ')}
      OUTPUT INSERTED.*
      WHERE id = @id
    `;

    const result = await request.query(updateQuery);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân khẩu với ID này',
      });
    }

    return res.json({
      success: true,
      message: 'Cập nhật thông tin nhân khẩu thành công',
      data: result.recordset[0],
    });

  } catch (error) {
    console.error('❌ Lỗi khi cập nhật nhân khẩu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật nhân khẩu',
      error: error.message,
    });
  }
};

/**
 * Xóa nhân khẩu
 * @route DELETE /api/residents/:id
 * @access Private (Admin only - cần token)
 */
const deleteResident = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID nhân khẩu',
      });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.NVarChar, id);

    // ============================================
    // Bước 1: Kiểm tra nhân khẩu có tồn tại không
    // ============================================
    const checkQuery = `
      SELECT id, name, household_id
      FROM [HouseholdMember]
      WHERE id = @id
    `;

    const checkResult = await request.query(checkQuery);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy nhân khẩu với ID này',
      });
    }

    const resident = checkResult.recordset[0];
    const residentName = resident.name || 'Nhân khẩu';

    // ============================================
    // Bước 2: Thực hiện DELETE
    // ============================================
    const deleteQuery = `
      DELETE FROM [HouseholdMember]
      WHERE id = @id
    `;

    const deleteResult = await request.query(deleteQuery);

    // Kiểm tra xem có bản ghi nào bị xóa không
    if (deleteResult.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không thể xóa nhân khẩu. Có thể nhân khẩu đã bị xóa trước đó.',
      });
    }

    console.log(`✅ Đã xóa HouseholdMember: ${id} (${residentName})`);

    return res.json({
      success: true,
      message: `Đã xóa nhân khẩu ${residentName} thành công`,
      data: {
        id: id,
        deleted: true,
      },
    });

  } catch (error) {
    console.error('❌ Lỗi khi xóa nhân khẩu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi xóa nhân khẩu',
      error: error.message,
    });
  }
};

module.exports = {
  createResident,
  getAllResidents,
  updateResident,
  deleteResident,
};

