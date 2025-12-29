const { getPool, sql } = require('../dbConfig');
const crypto = require('crypto');

/**
 * Tạo hộ khẩu mới và gán chủ hộ
 * @route POST /api/households
 * @access Private (Admin only - cần token)
 */
const createHousehold = async (req, res) => {
  let pool;
  let transaction;
  
  try {
    const { code, address, email_chu_ho, area } = req.body;

    // Validation
    if (!code || !address || !email_chu_ho) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: code, address, email_chu_ho',
      });
    }

    pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // ============================================
    // Bước 1: Tìm User theo email
    // ============================================
    const userRequest = new sql.Request(transaction);
    userRequest.input('email', sql.NVarChar, email_chu_ho);
    
    const userQuery = `
      SELECT id, full_name, dob, gender, cccd, job, workplace, household_id, phone, email
      FROM [User]
      WHERE email = @email
    `;
    
    const userResult = await userRequest.query(userQuery);

    if (userResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Email này chưa đăng ký tài khoản: ${email_chu_ho}`,
      });
    }

    const user = userResult.recordset[0];
    const userId = user.id;

    // Kiểm tra user đã có household_id chưa
    if (user.household_id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Email ${email_chu_ho} đã được gán vào hộ khẩu khác`,
      });
    }

    // ============================================
    // Bước 2: INSERT vào bảng Household (BẮT BUỘC có owner_id)
    // ============================================
    const householdRequest = new sql.Request(transaction);
    householdRequest.input('code', sql.NVarChar, code);
    householdRequest.input('address', sql.NVarChar, address);
    householdRequest.input('owner_id', sql.NVarChar, userId); // Bắt buộc lưu owner_id
    const areaValue = area !== undefined ? parseFloat(area) : 0;
    householdRequest.input('area', sql.Float, areaValue);

    let householdResult;
    let householdId;
    
    try {
      // Thử INSERT có created_at và owner_id
      householdResult = await householdRequest.query(`
        INSERT INTO [Household] (id, code, address, owner_id, area, created_at)
        OUTPUT INSERTED.id
        VALUES (NEWID(), @code, @address, @owner_id, @area, GETDATE())
      `);
    } catch (createdAtError) {
      // Nếu không có cột created_at, INSERT không có cột này
      console.log('⚠️  Bảng Household không có cột created_at, bỏ qua...');
      try {
        householdResult = await householdRequest.query(`
          INSERT INTO [Household] (id, code, address, owner_id, area)
          OUTPUT INSERTED.id
          VALUES (NEWID(), @code, @address, @owner_id, @area)
        `);
      } catch (ownerIdError) {
        // Nếu không có cột owner_id, INSERT không có cột này (fallback)
        console.log('⚠️  Bảng Household không có cột owner_id, sẽ UPDATE sau...');
        householdResult = await householdRequest.query(`
          INSERT INTO [Household] (id, code, address, area)
          OUTPUT INSERTED.id
          VALUES (NEWID(), @code, @address, @area)
        `);
      }
    }

    if (householdResult.recordset.length > 0 && householdResult.recordset[0].id) {
      householdId = householdResult.recordset[0].id;
    } else {
      await transaction.rollback();
      throw new Error('Không thể lấy được ID của Household vừa tạo');
    }

    console.log(`✅ Đã tạo Household: ${householdId} (${code}) với owner_id: ${userId}`);

    // Nếu không có cột owner_id trong INSERT, UPDATE sau
    try {
      const updateOwnerRequest = new sql.Request(transaction);
      updateOwnerRequest.input('householdId', sql.NVarChar, householdId);
      updateOwnerRequest.input('userId', sql.NVarChar, userId);
      
      await updateOwnerRequest.query(`
        UPDATE [Household]
        SET owner_id = @userId
        WHERE id = @householdId
      `);
      console.log(`✅ Đã cập nhật Household ${householdId} với owner_id: ${userId}`);
    } catch (ownerIdUpdateError) {
      // Bỏ qua nếu không có cột owner_id
      console.log('⚠️  Không thể cập nhật owner_id (cột không tồn tại)');
    }

    // ============================================
    // Bước 3: UPDATE User SET household_id
    // ============================================
    const updateUserRequest = new sql.Request(transaction);
    updateUserRequest.input('userId', sql.NVarChar, userId);
    updateUserRequest.input('householdId', sql.NVarChar, householdId);
    
    try {
      // Thử UPDATE có relation
      await updateUserRequest.query(`
        UPDATE [User]
        SET household_id = @householdId, relation = N'Chủ hộ'
        WHERE id = @userId
      `);
    } catch (relationError) {
      // Nếu không có cột relation, chỉ UPDATE household_id
      console.log('⚠️  Bảng User không có cột relation, chỉ cập nhật household_id...');
      await updateUserRequest.query(`
        UPDATE [User]
        SET household_id = @householdId
        WHERE id = @userId
      `);
    }
    
    console.log(`✅ Đã cập nhật User ${userId} với household_id: ${householdId}`);

    // ============================================
    // Bước 4: INSERT vào HouseholdMember (Copy thông tin từ User)
    // ============================================
    const memberId = crypto.randomUUID();
    const memberRequest = new sql.Request(transaction);
    memberRequest.input('id', sql.NVarChar, memberId);
    memberRequest.input('household_id', sql.NVarChar, householdId);
    memberRequest.input('name', sql.NVarChar, user.full_name || 'Chưa cập nhật');
    memberRequest.input('role', sql.NVarChar, 'Chủ hộ');
    
    // Xử lý giá trị mặc định cho các trường từ User
    // Xử lý dob: Có thể là Date object, string, hoặc null
    let safeDob;
    if (user.dob) {
      // Nếu là Date object, convert sang string (YYYY-MM-DD)
      if (user.dob instanceof Date) {
        safeDob = user.dob.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      } else if (typeof user.dob === 'string') {
        // Nếu là string, dùng luôn
        safeDob = user.dob;
      } else {
        // Fallback: Lấy ngày hiện tại
        safeDob = new Date().toISOString().split('T')[0];
      }
    } else {
      // Nếu không có dob, lấy ngày hiện tại
      safeDob = new Date().toISOString().split('T')[0];
    }
    
    // Xử lý các trường chuỗi: Kiểm tra tồn tại và là string trước khi trim
    const safeGender = (user.gender && typeof user.gender === 'string' && user.gender.trim() !== '') 
      ? user.gender.trim() 
      : 'Nam';
    const safeCccd = (user.cccd && typeof user.cccd === 'string' && user.cccd.trim() !== '') 
      ? user.cccd.trim() 
      : 'Chưa có';
    const safeJob = (user.job && typeof user.job === 'string' && user.job.trim() !== '') 
      ? user.job.trim() 
      : 'Chưa cập nhật';
    const safeWorkplace = (user.workplace && typeof user.workplace === 'string' && user.workplace.trim() !== '') 
      ? user.workplace.trim() 
      : 'Chưa cập nhật';
    
    memberRequest.input('dob', sql.NVarChar, safeDob);
    memberRequest.input('gender', sql.NVarChar, safeGender);
    memberRequest.input('idCard', sql.NVarChar, safeCccd);
    memberRequest.input('occupation', sql.NVarChar, safeJob);
    memberRequest.input('workplace', sql.NVarChar, safeWorkplace);

    await memberRequest.query(`
      INSERT INTO [HouseholdMember] (id, household_id, name, role, dob, gender, idCard, occupation, workplace)
      VALUES (@id, @household_id, @name, @role, @dob, @gender, @idCard, @occupation, @workplace)
    `);

    console.log(`✅ Đã tạo HouseholdMember: ${memberId} (${user.full_name} - Chủ hộ)`);

    // Commit transaction
    await transaction.commit();

    // ============================================
    // Bước 5: Trả về kết quả
    // ============================================
    return res.status(201).json({
      success: true,
      message: `Đã tạo hộ khẩu ${code} thành công và gán ${user.full_name} làm chủ hộ`,
      data: {
        household: {
          id: householdId,
          code: code,
          address: address,
          area: areaValue,
          owner_id: userId,
        },
        owner: {
          id: userId,
          full_name: user.full_name,
          email: email_chu_ho,
        },
        member: {
          id: memberId,
          name: user.full_name,
          role: 'Chủ hộ',
        },
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
    
    console.error('❌ Lỗi khi tạo hộ khẩu:', error);
    console.error('❌ Chi tiết lỗi:', {
      message: error.message,
      code: error.code,
      number: error.number,
      originalError: error.originalError?.message,
      stack: error.stack,
    });
    
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi tạo hộ khẩu',
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
 * Lấy danh sách tất cả hộ khẩu
 * @route GET /api/households
 * @access Private (Admin only - cần token)
 */
const getAllHouseholds = async (req, res) => {
  try {
    const pool = await getPool();
    const request = pool.request();
    
    // Query lấy danh sách households với thông tin chủ hộ và số thành viên
    // JOIN với User dựa vào owner_id để lấy tên chủ hộ chính xác
    try {
      // Thử query có created_at và owner_id
      const query = `
        SELECT 
          h.id,
          h.code,
          h.address,
          h.area,
          h.created_at,
          u.full_name AS owner_name,
          (SELECT COUNT(*) FROM [HouseholdMember] m WHERE m.household_id = h.id) AS member_count
        FROM [Household] h
        LEFT JOIN [User] u ON h.owner_id = u.id
        ORDER BY h.created_at DESC
      `;
      const result = await request.query(query);
      
      return res.json({
        success: true,
        message: 'Lấy danh sách hộ khẩu thành công',
        data: result.recordset,
        count: result.recordset.length,
      });
    } catch (queryError) {
      // Nếu không có cột owner_id hoặc created_at, thử query khác
      console.log('⚠️  Thử query không có owner_id hoặc created_at...');
      
      try {
        // Thử query có created_at nhưng không có owner_id (fallback: dùng HouseholdMember)
        const query = `
          SELECT 
            h.id,
            h.code,
            h.address,
            h.area,
            h.created_at,
            hm.name AS owner_name,
            (SELECT COUNT(*) FROM [HouseholdMember] m WHERE m.household_id = h.id) AS member_count
          FROM [Household] h
          LEFT JOIN [HouseholdMember] hm ON hm.household_id = h.id AND hm.role = 'Chủ hộ'
          ORDER BY h.created_at DESC
        `;
        const result = await request.query(query);
        
        return res.json({
          success: true,
          message: 'Lấy danh sách hộ khẩu thành công',
          data: result.recordset,
          count: result.recordset.length,
        });
      } catch (fallbackError) {
        // Nếu không có created_at, query không có ORDER BY created_at
        console.log('⚠️  Bảng Household không có cột created_at, sắp xếp theo code DESC...');
        
        try {
          // Thử query có owner_id nhưng không có created_at
          const query = `
            SELECT 
              h.id,
              h.code,
              h.address,
              h.area,
              u.full_name AS owner_name,
              (SELECT COUNT(*) FROM [HouseholdMember] m WHERE m.household_id = h.id) AS member_count
            FROM [Household] h
            LEFT JOIN [User] u ON h.owner_id = u.id
            ORDER BY h.code DESC
          `;
          const result = await request.query(query);
          
          return res.json({
            success: true,
            message: 'Lấy danh sách hộ khẩu thành công',
            data: result.recordset,
            count: result.recordset.length,
          });
        } catch (finalError) {
          // Fallback cuối cùng: không có owner_id và created_at
          const query = `
            SELECT 
              h.id,
              h.code,
              h.address,
              h.area,
              hm.name AS owner_name,
              (SELECT COUNT(*) FROM [HouseholdMember] m WHERE m.household_id = h.id) AS member_count
            FROM [Household] h
            LEFT JOIN [HouseholdMember] hm ON hm.household_id = h.id AND hm.role = 'Chủ hộ'
            ORDER BY h.code DESC
          `;
          const result = await request.query(query);
          
          return res.json({
            success: true,
            message: 'Lấy danh sách hộ khẩu thành công',
            data: result.recordset,
            count: result.recordset.length,
          });
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách hộ khẩu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách hộ khẩu',
      error: error.message,
    });
  }
};

/**
 * Lấy chi tiết một hộ khẩu theo ID
 * @route GET /api/households/:id
 * @access Private (Admin only - cần token)
 */
const getHouseholdById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp ID hộ khẩu',
      });
    }

    const pool = await getPool();
    const request = pool.request();
    request.input('id', sql.NVarChar, id);

    // ============================================
    // Query 1: Lấy thông tin Household + Tên chủ hộ
    // ============================================
    let householdInfo;
    try {
      // Thử query có owner_id và created_at
      const infoQuery = `
        SELECT 
          h.id,
          h.code,
          h.address,
          h.area,
          h.created_at,
          u.full_name AS owner_name,
          u.id AS owner_id
        FROM [Household] h
        LEFT JOIN [User] u ON h.owner_id = u.id
        WHERE h.id = @id
      `;
      const infoResult = await request.query(infoQuery);
      
      if (infoResult.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy hộ khẩu với ID này',
        });
      }
      
      householdInfo = infoResult.recordset[0];
    } catch (queryError) {
      // Fallback: Query không có owner_id
      console.log('⚠️  Thử query không có owner_id...');
      const infoQuery = `
        SELECT 
          h.id,
          h.code,
          h.address,
          h.area,
          h.created_at,
          hm.name AS owner_name
        FROM [Household] h
        LEFT JOIN [HouseholdMember] hm ON hm.household_id = h.id AND hm.role = 'Chủ hộ'
        WHERE h.id = @id
      `;
      const infoResult = await request.query(infoQuery);
      
      if (infoResult.recordset.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy hộ khẩu với ID này',
        });
      }
      
      householdInfo = infoResult.recordset[0];
    }

    // ============================================
    // Query 2: Lấy danh sách HouseholdMember
    // ============================================
    const membersRequest = pool.request();
    membersRequest.input('id', sql.NVarChar, id);
    
    const membersQuery = `
      SELECT *
      FROM [HouseholdMember]
      WHERE household_id = @id
      ORDER BY 
        CASE role
          WHEN 'Chủ hộ' THEN 1
          WHEN 'Vợ/Chồng' THEN 2
          WHEN 'Con' THEN 3
          WHEN 'Cha/Mẹ' THEN 4
          WHEN 'Ông/Bà' THEN 5
          WHEN 'Cháu' THEN 6
          ELSE 7
        END,
        name
    `;
    
    const membersResult = await membersRequest.query(membersQuery);

    // ============================================
    // Trả về kết quả
    // ============================================
    return res.json({
      success: true,
      message: 'Lấy thông tin hộ khẩu thành công',
      data: {
        ...householdInfo,
        members: membersResult.recordset,
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

module.exports = {
  createHousehold,
  getAllHouseholds,
  getHouseholdById,
};
