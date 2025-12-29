const { getPool, sql } = require('../dbConfig');
const crypto = require('crypto');

/**
 * Lấy danh sách user có status = 'pending'
 * @route GET /api/users/pending
 * @access Private (Admin only)
 */
const getPendingUsers = async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    // Query lấy tất cả user có status = 'pending'
    const query = `
      SELECT id, full_name, email, phone, role, status, created_at, updated_at
      FROM [User]
      WHERE status = 'pending'
      ORDER BY created_at DESC
    `;

    const result = await request.query(query);

    return res.json({
      success: true,
      message: 'Lấy danh sách user chờ duyệt thành công',
      data: result.recordset,
      count: result.recordset.length,
    });

  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách user chờ duyệt:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách user chờ duyệt',
      error: error.message,
    });
  }
};

/**
 * Duyệt user (đổi status từ 'pending' -> 'active')
 * @route PUT /api/users/approve/:id
 * @access Private (Admin only)
 */
const approveUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Validation
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin ID user',
      });
    }

    const pool = await getPool();
    const request = pool.request();

    // Kiểm tra user có tồn tại không
    request.input('id', sql.NVarChar, id);
    const checkQuery = "SELECT id, full_name, email, status FROM [User] WHERE id = @id";
    const checkResult = await request.query(checkQuery);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy user với ID này',
      });
    }

    const user = checkResult.recordset[0];

    // Kiểm tra user đã được duyệt chưa
    if (user.status === 'active') {
      return res.status(400).json({
        success: false,
        message: 'User này đã được duyệt rồi',
      });
    }

    // Update status từ 'pending' -> 'active'
    const updateRequest = pool.request();
    updateRequest.input('id', sql.NVarChar, id);
    
    const updateQuery = `
      UPDATE [User]
      SET status = 'active', updated_at = GETDATE()
      OUTPUT INSERTED.id, INSERTED.full_name, INSERTED.email, INSERTED.status
      WHERE id = @id
    `;

    const updateResult = await updateRequest.query(updateQuery);

    if (updateResult.recordset.length > 0) {
      const updatedUser = updateResult.recordset[0];
      return res.json({
        success: true,
        message: `Đã duyệt tài khoản của ${updatedUser.full_name} thành công`,
        data: updatedUser,
      });
    } else {
      throw new Error('Không thể cập nhật status của user');
    }

  } catch (error) {
    console.error('❌ Lỗi khi duyệt user:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi duyệt user',
      error: error.message,
    });
  }
};

/**
 * Lấy thông tin profile của user đang đăng nhập
 * @route GET /api/users/profile
 * @access Private (cần token)
 */
const getProfile = async (req, res) => {
  try {
    // Lấy id từ token (đã được gán vào req.user bởi middleware verifyToken)
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const pool = await getPool();
    const request = pool.request();
    
    // Query lấy thông tin đầy đủ của user (bao gồm các trường profile)
    request.input('id', sql.NVarChar, userId);
    
    const query = `
      SELECT id, full_name, email, phone, role, avatar, status, 
             dob, gender, cccd, job, workplace, household_id, created_at
      FROM [User]
      WHERE id = @id
    `;

    const result = await request.query(query);

    // Kiểm tra user có tồn tại không
    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const user = result.recordset[0];

    return res.json({
      success: true,
      message: 'Lấy thông tin profile thành công',
      data: user,
    });

  } catch (error) {
    console.error('❌ Lỗi khi lấy thông tin profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thông tin profile',
      error: error.message,
    });
  }
};

/**
 * Cập nhật thông tin cá nhân của user
 * @route PUT /api/users/profile
 * @access Private (cần token)
 */
const updateProfile = async (req, res) => {
  try {
    // Lấy id từ token (đã được gán vào req.user bởi middleware verifyToken)
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    // Lấy dữ liệu từ req.body
    const { full_name, phone, dob, gender, cccd, job, workplace } = req.body;

    // Validation: Ít nhất phải có một trường để cập nhật
    if (!full_name && !phone && !dob && !gender && !cccd && !job && !workplace) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ít nhất một trường để cập nhật',
      });
    }

    const pool = await getPool();
    const request = pool.request();

    // Kiểm tra user có tồn tại không và lấy thông tin cũ (để đồng bộ HouseholdMember)
    request.input('id', sql.NVarChar, userId);
    const checkQuery = "SELECT id, full_name, cccd, household_id FROM [User] WHERE id = @id";
    const checkResult = await request.query(checkQuery);

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy user',
      });
    }

    // Lưu thông tin cũ để dùng cho WHERE clause trong HouseholdMember
    const oldUserInfo = checkResult.recordset[0];
    const oldFullName = oldUserInfo.full_name || '';
    const oldCccd = oldUserInfo.cccd || '';
    const userHouseholdId = oldUserInfo.household_id;

    // Xây dựng câu lệnh UPDATE động (chỉ update các trường có giá trị)
    const updateFields = [];
    const updateRequest = pool.request();
    updateRequest.input('id', sql.NVarChar, userId);

    if (full_name !== undefined) {
      updateFields.push('full_name = @full_name');
      updateRequest.input('full_name', sql.NVarChar, full_name);
    }
    if (phone !== undefined) {
      updateFields.push('phone = @phone');
      updateRequest.input('phone', sql.NVarChar, phone);
    }
    if (dob !== undefined) {
      updateFields.push('dob = @dob');
      updateRequest.input('dob', sql.NVarChar, dob);
    }
    if (gender !== undefined) {
      updateFields.push('gender = @gender');
      updateRequest.input('gender', sql.NVarChar, gender);
    }
    if (cccd !== undefined) {
      updateFields.push('cccd = @cccd');
      updateRequest.input('cccd', sql.NVarChar, cccd);
    }
    if (job !== undefined) {
      updateFields.push('job = @job');
      updateRequest.input('job', sql.NVarChar, job);
    }
    if (workplace !== undefined) {
      updateFields.push('workplace = @workplace');
      updateRequest.input('workplace', sql.NVarChar, workplace);
    }

    // Luôn cập nhật updated_at
    updateFields.push('updated_at = GETDATE()');

    // Thực hiện UPDATE bảng User
    const updateQuery = `
      UPDATE [User]
      SET ${updateFields.join(', ')}
      OUTPUT INSERTED.id, INSERTED.full_name, INSERTED.email, INSERTED.phone, 
             INSERTED.dob, INSERTED.gender, INSERTED.cccd, INSERTED.job, 
             INSERTED.workplace, INSERTED.role, INSERTED.status, INSERTED.updated_at, INSERTED.household_id
      WHERE id = @id
    `;

    const updateResult = await updateRequest.query(updateQuery);

    if (updateResult.recordset.length === 0) {
      throw new Error('Không thể cập nhật thông tin user');
    }

    const updatedUser = updateResult.recordset[0];

    // ĐỒNG BỘ sang bảng HouseholdMember
    // Kiểm tra xem user có household_id chưa
    if (userHouseholdId) {
      try {
        // Lấy thông tin user sau khi update để có dữ liệu mới nhất
        const userInfoRequest = pool.request();
        userInfoRequest.input('id', sql.NVarChar, userId);
        const userInfoQuery = `
          SELECT full_name, dob, gender, cccd, job, workplace
          FROM [User]
          WHERE id = @id
        `;
        const userInfoResult = await userInfoRequest.query(userInfoQuery);
        
        if (userInfoResult.recordset.length > 0) {
          const userInfo = userInfoResult.recordset[0];
          const newFullName = userInfo.full_name || '';
          const newCccd = userInfo.cccd || '';
          
          // Xây dựng câu lệnh UPDATE cho HouseholdMember
          const memberUpdateFields = [];
          const memberUpdateRequest = pool.request();
          memberUpdateRequest.input('household_id', sql.NVarChar, userHouseholdId);
          
          // Sử dụng giá trị CŨ để tìm member trong WHERE clause
          if (oldCccd) {
            memberUpdateRequest.input('old_idCard', sql.NVarChar, oldCccd);
          }
          if (oldFullName) {
            memberUpdateRequest.input('old_full_name', sql.NVarChar, oldFullName);
          }
          
          // Sử dụng giá trị MỚI để cập nhật trong SET clause
          if (userInfo.dob !== undefined && userInfo.dob !== null) {
            memberUpdateFields.push('dob = @new_dob');
            memberUpdateRequest.input('new_dob', sql.NVarChar, userInfo.dob);
          }
          if (userInfo.gender !== undefined && userInfo.gender !== null) {
            memberUpdateFields.push('gender = @new_gender');
            memberUpdateRequest.input('new_gender', sql.NVarChar, userInfo.gender);
          }
          if (newCccd) {
            memberUpdateFields.push('idCard = @new_idCard');
            memberUpdateRequest.input('new_idCard', sql.NVarChar, newCccd);
          }
          if (userInfo.job !== undefined && userInfo.job !== null) {
            memberUpdateFields.push('occupation = @new_occupation');
            memberUpdateRequest.input('new_occupation', sql.NVarChar, userInfo.job);
          }
          if (userInfo.workplace !== undefined && userInfo.workplace !== null) {
            memberUpdateFields.push('workplace = @new_workplace');
            memberUpdateRequest.input('new_workplace', sql.NVarChar, userInfo.workplace);
          }
          if (newFullName) {
            memberUpdateFields.push('name = @new_name');
            memberUpdateRequest.input('new_name', sql.NVarChar, newFullName);
          }
          
          // Chỉ thực hiện UPDATE nếu có ít nhất một trường để cập nhật
          if (memberUpdateFields.length > 0) {
            // Xây dựng điều kiện WHERE: Tìm member bằng giá trị CŨ
            let whereCondition = 'household_id = @household_id AND (';
            const whereParts = [];
            
            if (oldCccd) {
              whereParts.push('idCard = @old_idCard');
            }
            if (oldFullName) {
              whereParts.push('name = @old_full_name');
            }
            
            if (whereParts.length > 0) {
              whereCondition += whereParts.join(' OR ') + ')';
              
              const memberUpdateQuery = `
                UPDATE [HouseholdMember]
                SET ${memberUpdateFields.join(', ')}
                WHERE ${whereCondition}
              `;
              
              const memberUpdateResult = await memberUpdateRequest.query(memberUpdateQuery);
              console.log(`✅ Đã đồng bộ thông tin sang HouseholdMember: ${memberUpdateResult.rowsAffected[0]} bản ghi được cập nhật`);
            }
          }
        }
      } catch (memberSyncError) {
        // Log lỗi nhưng không fail toàn bộ request
        console.error('⚠️ Lỗi khi đồng bộ sang HouseholdMember (không ảnh hưởng đến cập nhật User):', memberSyncError);
        // Vẫn trả về success vì User đã được cập nhật thành công
      }
    } else {
      console.log('ℹ️ User chưa có household_id, bỏ qua bước đồng bộ HouseholdMember');
    }

    return res.json({
      success: true,
      message: 'Cập nhật thông tin cá nhân thành công',
      data: updatedUser,
    });

  } catch (error) {
    console.error('❌ Lỗi khi cập nhật thông tin cá nhân:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật thông tin cá nhân',
      error: error.message,
    });
  }
};

/**
 * Lấy thông tin hộ khẩu của user đang đăng nhập
 * @route GET /api/users/my-household
 * @access Private (cần token)
 */
const getMyHousehold = async (req, res) => {
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

    // ============================================
    // Bước 1: Lấy thông tin User và Household
    // ============================================
    let userQuery;
    try {
      // Thử query có relation
      userQuery = `
        SELECT u.id, u.household_id, u.relation, u.full_name, u.cccd
        FROM [User] u
        WHERE u.id = @userId
      `;
    } catch (error) {
      // Nếu không có cột relation
      userQuery = `
        SELECT u.id, u.household_id, u.full_name, u.cccd
        FROM [User] u
        WHERE u.id = @userId
      `;
    }

    const userResult = await request.query(userQuery);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const user = userResult.recordset[0];

    if (!user.household_id) {
      return res.status(404).json({
        success: false,
        message: 'Bạn chưa được gán vào hộ khẩu nào',
        data: null,
      });
    }

    // ============================================
    // Bước 2: Lấy thông tin Household
    // ============================================
    const householdRequest = pool.request();
    householdRequest.input('householdId', sql.NVarChar, user.household_id);

    let householdQuery;
    try {
      // Thử query có owner_id và created_at
      householdQuery = `
        SELECT h.id, h.code, h.address, h.area, h.created_at, u.full_name AS owner_name
        FROM [Household] h
        LEFT JOIN [User] u ON h.owner_id = u.id
        WHERE h.id = @householdId
      `;
    } catch (error) {
      // Fallback: Query không có owner_id
      householdQuery = `
        SELECT h.id, h.code, h.address, h.area, h.created_at
        FROM [Household] h
        WHERE h.id = @householdId
      `;
    }

    const householdResult = await householdRequest.query(householdQuery);

    if (householdResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin hộ khẩu',
      });
    }

    const household = householdResult.recordset[0];

    // ============================================
    // Bước 3: Lấy danh sách HouseholdMember
    // ============================================
    const membersRequest = pool.request();
    membersRequest.input('householdId', sql.NVarChar, user.household_id);

    const membersQuery = `
      SELECT 
        id, household_id, name, role, dob, gender, idCard, 
        idIssueDate, idIssuePlace, ethnicity, religion, 
        occupation, workplace, registrationDate, previousAddress
      FROM [HouseholdMember]
      WHERE household_id = @householdId
      ORDER BY 
        CASE role
          WHEN N'Chủ hộ' THEN 1
          WHEN N'Vợ/Chồng' THEN 2
          WHEN N'Con' THEN 3
          WHEN N'Cha/Mẹ' THEN 4
          WHEN N'Ông/Bà' THEN 5
          WHEN N'Cháu' THEN 6
          ELSE 7
        END, name ASC
    `;

    const membersResult = await membersRequest.query(membersQuery);

    // ============================================
    // Bước 4: Kiểm tra user có phải Chủ hộ không
    // ============================================
    let isHouseholdHead = false;
    
    if (user.relation && user.relation.trim() === 'Chủ hộ') {
      isHouseholdHead = true;
    } else {
      // Kiểm tra qua owner_id
      try {
        const ownerCheckRequest = pool.request();
        ownerCheckRequest.input('householdId', sql.NVarChar, user.household_id);
        const ownerCheckResult = await ownerCheckRequest.query(`
          SELECT owner_id FROM [Household] WHERE id = @householdId
        `);
        if (ownerCheckResult.recordset.length > 0 && ownerCheckResult.recordset[0].owner_id === userId) {
          isHouseholdHead = true;
        }
      } catch (error) {
        // Bỏ qua nếu không có cột owner_id
      }
    }

    // ============================================
    // Bước 5: Trả về kết quả
    // ============================================
    return res.json({
      success: true,
      message: 'Lấy thông tin hộ khẩu thành công',
      data: {
        id: household.id,
        code: household.code,
        address: household.address,
        area: household.area || 0,
        owner_name: household.owner_name || null,
        members: membersResult.recordset,
        is_household_head: isHouseholdHead, // Thêm flag để frontend biết user có phải Chủ hộ không
      },
    });

  } catch (error) {
    console.error('❌ Lỗi khi lấy thông tin hộ khẩu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thông tin hộ khẩu',
      error: error.message,
    });
  }
};

/**
 * Chủ hộ tự thêm thành viên vào hộ khẩu của mình
 * @route POST /api/users/household/members
 * @access Private (cần token - chỉ Chủ hộ mới được)
 */
const addMemberToMyHousehold = async (req, res) => {
  let pool;
  let transaction;
  
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const { full_name, dob, gender, relation, cccd, job, workplace } = req.body;

    // Validation
    if (!full_name || !relation) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: full_name, relation',
      });
    }

    pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // ============================================
    // Bước 1: Kiểm tra User có phải Chủ hộ không
    // ============================================
    const userCheckRequest = new sql.Request(transaction);
    userCheckRequest.input('userId', sql.NVarChar, userId);
    
    // Query kiểm tra household_id và relation
    let userCheckQuery;
    try {
      // Thử query có cột relation
      userCheckQuery = `
        SELECT id, household_id, relation, full_name
        FROM [User]
        WHERE id = @userId
      `;
    } catch (error) {
      // Nếu không có cột relation, chỉ check household_id
      userCheckQuery = `
        SELECT id, household_id, full_name
        FROM [User]
        WHERE id = @userId
      `;
    }
    
    const userCheckResult = await userCheckRequest.query(userCheckQuery);

    if (userCheckResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const user = userCheckResult.recordset[0];

    // Kiểm tra user có household_id chưa
    if (!user.household_id) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Bạn chưa được gán vào hộ khẩu nào. Vui lòng liên hệ quản trị viên.',
      });
    }

    // Kiểm tra user có phải Chủ hộ không
    // Có 3 cách kiểm tra:
    // 1. Kiểm tra relation = 'Chủ hộ' trong bảng User
    // 2. Kiểm tra owner_id trong bảng Household
    // 3. Kiểm tra role = 'Chủ hộ' trong bảng HouseholdMember (dựa vào cccd hoặc name)
    let isHouseholdHead = false;
    
    // Cách 1: Kiểm tra relation trong User
    if (user.relation) {
      if (user.relation.trim() === 'Chủ hộ') {
        isHouseholdHead = true;
      }
    }
    
    // Cách 2: Nếu chưa xác định, kiểm tra owner_id trong Household
    if (!isHouseholdHead) {
      const householdCheckRequest = new sql.Request(transaction);
      householdCheckRequest.input('householdId', sql.NVarChar, user.household_id);
      
      try {
        const householdCheckQuery = `
          SELECT owner_id
          FROM [Household]
          WHERE id = @householdId
        `;
        const householdCheckResult = await householdCheckRequest.query(householdCheckQuery);
        
        if (householdCheckResult.recordset.length > 0) {
          const household = householdCheckResult.recordset[0];
          if (household.owner_id && household.owner_id === userId) {
            isHouseholdHead = true;
          }
        }
      } catch (error) {
        // Nếu không có cột owner_id, tiếp tục kiểm tra cách 3
        console.log('⚠️  Không thể kiểm tra owner_id, thử kiểm tra qua HouseholdMember...');
      }
    }
    
    // Cách 3: Nếu vẫn chưa xác định, kiểm tra qua HouseholdMember (dựa vào cccd hoặc name)
    if (!isHouseholdHead) {
      try {
        const memberCheckRequest = new sql.Request(transaction);
        memberCheckRequest.input('householdId', sql.NVarChar, user.household_id);
        memberCheckRequest.input('userId', sql.NVarChar, userId);
        
        // Lấy cccd và full_name của user để so sánh
        const userInfoRequest = new sql.Request(transaction);
        userInfoRequest.input('userId', sql.NVarChar, userId);
        const userInfoResult = await userInfoRequest.query(`
          SELECT cccd, full_name FROM [User] WHERE id = @userId
        `);
        
        if (userInfoResult.recordset.length > 0) {
          const userInfo = userInfoResult.recordset[0];
          const userCccd = userInfo.cccd || '';
          const userName = userInfo.full_name || '';
          
          // Kiểm tra xem có member nào trong household với role = 'Chủ hộ' và trùng cccd/name không
          let memberCheckQuery = `
            SELECT id, role
            FROM [HouseholdMember]
            WHERE household_id = @householdId AND role = N'Chủ hộ'
          `;
          
          if (userCccd) {
            memberCheckQuery += ` AND (idCard = @userCccd`;
            memberCheckRequest.input('userCccd', sql.NVarChar, userCccd);
            if (userName) {
              memberCheckQuery += ` OR name = @userName)`;
              memberCheckRequest.input('userName', sql.NVarChar, userName);
            } else {
              memberCheckQuery += `)`;
            }
          } else if (userName) {
            memberCheckQuery += ` AND name = @userName`;
            memberCheckRequest.input('userName', sql.NVarChar, userName);
          }
          
          const memberCheckResult = await memberCheckRequest.query(memberCheckQuery);
          
          if (memberCheckResult.recordset.length > 0) {
            isHouseholdHead = true;
          }
        }
      } catch (error) {
        console.log('⚠️  Không thể kiểm tra qua HouseholdMember:', error.message);
      }
    }

    if (!isHouseholdHead) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền thay đổi nhân khẩu. Chỉ Chủ hộ mới được phép thêm thành viên.',
      });
    }

    const householdId = user.household_id;
    console.log(`✅ User ${userId} (${user.full_name}) là Chủ hộ của Household ${householdId}`);

    // ============================================
    // Bước 2: INSERT vào bảng HouseholdMember
    // ============================================
    const memberId = crypto.randomUUID();
    const memberRequest = new sql.Request(transaction);
    memberRequest.input('id', sql.NVarChar, memberId);
    memberRequest.input('household_id', sql.NVarChar, householdId);
    memberRequest.input('name', sql.NVarChar, full_name);
    memberRequest.input('role', sql.NVarChar, relation);

    // Xử lý các trường optional với giá trị mặc định
    let safeDob;
    if (dob) {
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
    const safeJob = (job && typeof job === 'string' && job.trim() !== '') 
      ? job.trim() 
      : 'Chưa cập nhật';
    const safeWorkplace = (workplace && typeof workplace === 'string' && workplace.trim() !== '') 
      ? workplace.trim() 
      : 'Chưa cập nhật';

    memberRequest.input('dob', sql.NVarChar, safeDob);
    memberRequest.input('gender', sql.NVarChar, safeGender);
    memberRequest.input('idCard', sql.NVarChar, safeCccd);
    memberRequest.input('occupation', sql.NVarChar, safeJob);
    memberRequest.input('workplace', sql.NVarChar, safeWorkplace);

    try {
      // Thử INSERT có created_at
      await memberRequest.query(`
        INSERT INTO [HouseholdMember] (id, household_id, name, role, dob, gender, idCard, occupation, workplace, created_at)
        VALUES (@id, @household_id, @name, @role, @dob, @gender, @idCard, @occupation, @workplace, GETDATE())
      `);
    } catch (createdAtError) {
      // Nếu không có cột created_at, INSERT không có cột này
      console.log('⚠️  Bảng HouseholdMember không có cột created_at, bỏ qua...');
      await memberRequest.query(`
        INSERT INTO [HouseholdMember] (id, household_id, name, role, dob, gender, idCard, occupation, workplace)
        VALUES (@id, @household_id, @name, @role, @dob, @gender, @idCard, @occupation, @workplace)
      `);
    }

    console.log(`✅ Đã thêm HouseholdMember: ${memberId} (${full_name} - ${relation}) vào Household ${householdId}`);

    // Commit transaction
    await transaction.commit();

    // ============================================
    // Bước 3: Trả về kết quả
    // ============================================
    return res.status(201).json({
      success: true,
      message: `Đã thêm thành viên ${full_name} vào hộ khẩu của bạn thành công`,
      data: {
        id: memberId,
        household_id: householdId,
        name: full_name,
        role: relation,
        dob: safeDob,
        gender: safeGender,
        idCard: safeCccd,
        occupation: safeJob,
        workplace: safeWorkplace,
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
    
    console.error('❌ Lỗi khi thêm thành viên vào hộ khẩu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi thêm thành viên vào hộ khẩu',
      error: error.message,
    });
  }
};

/**
 * Chủ hộ sửa thông tin thành viên trong hộ của mình
 * @route PUT /api/users/household/members/:id
 * @access Private (cần token - chỉ Chủ hộ mới được)
 */
const updateResidentForUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: memberId } = req.params; // ID của thành viên cần sửa
    const { full_name, dob, gender, relation, cccd, job, workplace } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    if (!memberId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID thành viên',
      });
    }

    const pool = await getPool();

    // ============================================
    // Bước 1: Lấy household_id của User đang đăng nhập
    // ============================================
    const userRequest = pool.request();
    userRequest.input('userId', sql.NVarChar, userId);
    
    const userQuery = `
      SELECT id, household_id, relation
      FROM [User]
      WHERE id = @userId
    `;
    
    const userResult = await userRequest.query(userQuery);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const user = userResult.recordset[0];

    if (!user.household_id) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chưa được gán vào hộ khẩu nào',
      });
    }

    const userHouseholdId = user.household_id;

    // ============================================
    // Bước 2: KIỂM TRA AN TOÀN - Thành viên có thuộc hộ của user không?
    // ============================================
    const memberCheckRequest = pool.request();
    memberCheckRequest.input('memberId', sql.NVarChar, memberId);
    memberCheckRequest.input('householdId', sql.NVarChar, userHouseholdId);

    const memberCheckQuery = `
      SELECT id, household_id, name
      FROM [HouseholdMember]
      WHERE id = @memberId AND household_id = @householdId
    `;

    const memberCheckResult = await memberCheckRequest.query(memberCheckQuery);

    if (memberCheckResult.recordset.length === 0) {
      // Thành viên không tồn tại hoặc không thuộc hộ của user
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền sửa người lạ. Thành viên này không thuộc hộ khẩu của bạn.',
      });
    }

    console.log(`✅ User ${userId} có quyền sửa member ${memberId} trong household ${userHouseholdId}`);

    // ============================================
    // Bước 3: Kiểm tra user có phải Chủ hộ không (Optional - có thể bỏ qua nếu muốn cho phép tất cả thành viên trong hộ)
    // ============================================
    let isHouseholdHead = false;
    
    if (user.relation && user.relation.trim() === 'Chủ hộ') {
      isHouseholdHead = true;
    } else {
      // Kiểm tra qua owner_id
      try {
        const ownerCheckRequest = pool.request();
        ownerCheckRequest.input('householdId', sql.NVarChar, userHouseholdId);
        const ownerCheckResult = await ownerCheckRequest.query(`
          SELECT owner_id FROM [Household] WHERE id = @householdId
        `);
        if (ownerCheckResult.recordset.length > 0 && ownerCheckResult.recordset[0].owner_id === userId) {
          isHouseholdHead = true;
        }
      } catch (error) {
        // Bỏ qua nếu không có cột owner_id
      }
    }

    // Nếu muốn chỉ cho phép Chủ hộ sửa, uncomment đoạn này:
    // if (!isHouseholdHead) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Chỉ Chủ hộ mới được phép sửa thông tin thành viên',
    //   });
    // }

    // ============================================
    // Bước 4: Xây dựng câu lệnh UPDATE động
    // ============================================
    const updateFields = [];
    const updateRequest = pool.request();
    updateRequest.input('memberId', sql.NVarChar, memberId);
    updateRequest.input('householdId', sql.NVarChar, userHouseholdId); // Thêm vào WHERE để đảm bảo an toàn

    if (full_name !== undefined && full_name !== null && full_name.trim() !== '') {
      updateFields.push('name = @full_name');
      updateRequest.input('full_name', sql.NVarChar, full_name.trim());
    }
    
    if (dob !== undefined && dob !== null) {
      // Xử lý dob: có thể là Date object hoặc string
      let safeDob;
      if (dob instanceof Date) {
        safeDob = dob.toISOString().split('T')[0];
      } else if (typeof dob === 'string' && dob.trim() !== '') {
        safeDob = dob.trim();
      } else {
        safeDob = dob;
      }
      updateFields.push('dob = @dob');
      updateRequest.input('dob', sql.NVarChar, safeDob);
    }
    
    if (gender !== undefined && gender !== null && gender.trim() !== '') {
      updateFields.push('gender = @gender');
      updateRequest.input('gender', sql.NVarChar, gender.trim());
    }
    
    if (relation !== undefined && relation !== null && relation.trim() !== '') {
      updateFields.push('role = @relation');
      updateRequest.input('relation', sql.NVarChar, relation.trim());
    }
    
    if (cccd !== undefined && cccd !== null) {
      updateFields.push('idCard = @cccd');
      updateRequest.input('cccd', sql.NVarChar, cccd.trim() || 'Chưa có');
    }
    
    if (job !== undefined && job !== null) {
      updateFields.push('occupation = @job');
      updateRequest.input('job', sql.NVarChar, job.trim() || 'Chưa cập nhật');
    }
    
    if (workplace !== undefined && workplace !== null) {
      updateFields.push('workplace = @workplace');
      updateRequest.input('workplace', sql.NVarChar, workplace.trim() || 'Chưa cập nhật');
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ít nhất một trường để cập nhật',
      });
    }

    // ============================================
    // Bước 5: Thực hiện UPDATE (với điều kiện WHERE đảm bảo an toàn)
    // ============================================
    const updateQuery = `
      UPDATE [HouseholdMember]
      SET ${updateFields.join(', ')}
      OUTPUT INSERTED.*
      WHERE id = @memberId AND household_id = @householdId
    `;

    const updateResult = await updateRequest.query(updateQuery);

    if (updateResult.recordset.length === 0) {
      // Không tìm thấy member hoặc không thuộc household (trường hợp hiếm, nhưng vẫn check)
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thành viên hoặc không có quyền sửa',
      });
    }

    const updatedMember = updateResult.recordset[0];

    console.log(`✅ Đã cập nhật HouseholdMember ${memberId} bởi User ${userId}`);

    return res.json({
      success: true,
      message: 'Cập nhật thông tin thành viên thành công',
      data: updatedMember,
    });

  } catch (error) {
    console.error('❌ Lỗi khi cập nhật thành viên:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật thông tin thành viên',
      error: error.message,
    });
  }
};

module.exports = {
  getPendingUsers,
  approveUser,
  getProfile,
  updateProfile,
  getMyHousehold,
  addMemberToMyHousehold,
  updateResidentForUser,
};

