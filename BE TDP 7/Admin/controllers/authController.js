const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); 
const crypto = require('crypto'); // <--- THÊM DÒNG NÀY (để tạo ID ngẫu nhiên)
const { getPool, sql } = require('../dbConfig');

/**
 * Đăng ký tài khoản mới
 * @route POST /api/auth/register
 */
const register = async (req, res) => {
  try {
    const { full_name, email, password, phone, cccd } = req.body;

    // --- 1. Validation đầu vào ---
    if (!full_name || !email || !password || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin',
      });
    }

    // Kiểm tra định dạng email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Email không hợp lệ' });
    }

    // Kiểm tra độ dài mật khẩu
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    const pool = await getPool();

    // --- 2. Kiểm tra email đã tồn tại chưa ---
    const checkRequest = pool.request(); // Tạo request mới cho việc check
    checkRequest.input('email', sql.NVarChar, email);
    
    const checkEmailQuery = "SELECT id FROM [User] WHERE email = @email";
    const existingUser = await checkRequest.query(checkEmailQuery);

    if (existingUser.recordset.length > 0) {
      return res.status(409).json({
        success: false,                                                                                                                                                                                                                             
        message: 'Email đã được sử dụng. Vui lòng sử dụng email khác.',
      });
    }

    // --- 3. Chuẩn bị dữ liệu để INSERT ---
    
    // a. Mã hóa mật khẩu
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // b. Tạo ID ngẫu nhiên (UUID) <--- QUAN TRỌNG: Đây là phần sửa lỗi
    const newId = crypto.randomUUID(); 

    // --- 4. Thực hiện INSERT ---
    const insertRequest = pool.request();
    
    // Bind các tham số
    insertRequest.input('id', sql.NVarChar, newId); // <--- Thêm input ID
    insertRequest.input('full_name', sql.NVarChar, full_name);
    insertRequest.input('email', sql.NVarChar, email);
    insertRequest.input('password', sql.NVarChar, hashedPassword);
    insertRequest.input('phone', sql.NVarChar, phone);
    insertRequest.input('role', sql.NVarChar, 'user');
    insertRequest.input('status', sql.NVarChar, 'pending'); // <--- Đổi từ 'active' thành 'pending'
    
    // Thêm cccd nếu có
    if (cccd && cccd.trim() !== '') {
      insertRequest.input('cccd', sql.NVarChar, cccd.trim());
    }

    // Câu lệnh SQL - thêm cccd nếu có
    let insertQuery;
    if (cccd && cccd.trim() !== '') {
      insertQuery = `
        INSERT INTO [User] (id, full_name, email, password, phone, role, status, cccd, created_at, updated_at)
        OUTPUT INSERTED.id, INSERTED.full_name, INSERTED.email, INSERTED.status, INSERTED.cccd
        VALUES (@id, @full_name, @email, @password, @phone, @role, @status, @cccd, GETDATE(), GETDATE())
      `;
    } else {
      insertQuery = `
        INSERT INTO [User] (id, full_name, email, password, phone, role, status, created_at, updated_at)
        OUTPUT INSERTED.id, INSERTED.full_name, INSERTED.email, INSERTED.status
        VALUES (@id, @full_name, @email, @password, @phone, @role, @status, GETDATE(), GETDATE())
      `;
    }

    const result = await insertRequest.query(insertQuery);

    if (result.recordset.length > 0) {
      const newUser = result.recordset[0];
      const newUserId = newUser.id;

      // --- 5. Tự động liên kết Hộ khẩu nếu có CCCD ---
      // Mục đích: Người dùng đăng ký xong là vào thấy ngay thông tin hộ khẩu của mình mà không cần chờ Admin gán
      if (cccd && cccd.trim() !== '') {
        try {
          // 1. Kiểm tra bảng HouseholdMember với CCCD người dùng vừa nhập
          const householdCheckRequest = pool.request();
          householdCheckRequest.input('cccd', sql.NVarChar, cccd.trim());
          
          const householdCheckQuery = `
            SELECT household_id 
            FROM [HouseholdMember] 
            WHERE idCard = @cccd
          `;
          
          const householdCheckResult = await householdCheckRequest.query(householdCheckQuery);
          
          // 2. Nếu tìm thấy (tức là Admin đã khai báo người này vào hộ rồi)
          if (householdCheckResult.recordset.length > 0) {
            const foundHouseholdId = householdCheckResult.recordset[0].household_id;
            
            if (foundHouseholdId) {
              // 3. Thực hiện UPDATE ngay: UPDATE [User] SET household_id = @foundHouseholdId WHERE id = @newUserId
              const updateHouseholdRequest = pool.request();
              updateHouseholdRequest.input('userId', sql.NVarChar, newUserId);
              updateHouseholdRequest.input('householdId', sql.NVarChar, foundHouseholdId);
              
              await updateHouseholdRequest.query(`
                UPDATE [User] 
                SET household_id = @householdId 
                WHERE id = @userId
              `);
              
              console.log(`✅ Đã tự động liên kết User ${newUserId} với Household ${foundHouseholdId} (CCCD: ${cccd.trim()})`);
              
              // Cập nhật lại newUser để trả về household_id trong response
              newUser.household_id = foundHouseholdId;
            } else {
              console.log(`ℹ️  Tìm thấy HouseholdMember với CCCD ${cccd.trim()} nhưng household_id là null`);
            }
          } else {
            console.log(`ℹ️  Không tìm thấy HouseholdMember với CCCD ${cccd.trim()} - User sẽ cần Admin gán hộ khẩu sau`);
          }
        } catch (householdLinkError) {
          // Nếu lỗi khi liên kết hộ khẩu, không ảnh hưởng đến việc đăng ký
          // Chỉ log lỗi, không throw để user vẫn đăng ký thành công
          console.error('⚠️  Lỗi khi tự động liên kết hộ khẩu (không ảnh hưởng đến đăng ký):', householdLinkError.message);
        }
      }

      return res.status(201).json({
        success: true,
        message: 'Đăng ký thành công! Tài khoản của bạn đang chờ phê duyệt từ quản trị viên.',
        data: newUser,
      });
    } else {
      throw new Error('Không thể tạo tài khoản');
    }

  } catch (error) {
    console.error('❌ Lỗi khi đăng ký:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi đăng ký',
      error: error.message,
    });
  }
};

module.exports = {
  register,
};
/**
 * Đăng nhập
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu' });
        }

        const pool = await getPool();
        
        // Tìm user theo email
        const request = pool.request();
        request.input('email', sql.NVarChar, email);
        const result = await request.query("SELECT * FROM [User] WHERE email = @email");

        const user = result.recordset[0];

        // Nếu không tìm thấy user
        if (!user) {
            return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });
        }

        // So sánh mật khẩu
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });
        }

        // Kiểm tra status: Nếu tài khoản chưa được duyệt (pending), không cho đăng nhập
        if (user.status === 'pending') {
            return res.status(403).json({ 
                success: false, 
                message: 'Tài khoản của bạn đang chờ phê duyệt từ quản trị viên. Vui lòng đợi để được kích hoạt.',
                status: 'pending'
            });
        }

        // ============================================
        // SAU KHI CHECK PASS THÀNH CÔNG, TRƯỚC KHI TRẢ VỀ TOKEN:
        // Tự động liên kết hộ khẩu nếu User chưa có household_id
        // ============================================
        // 1. Kiểm tra nếu User này chưa có household_id nhưng có cccd
        if (!user.household_id && user.cccd && user.cccd.trim() !== '' && user.cccd !== 'Chưa có') {
            try {
                // Tìm trong bảng nhân khẩu xem có CCCD này không
                const residentCheckRequest = pool.request();
                residentCheckRequest.input('cccd', sql.NVarChar, user.cccd.trim());
                
                const residentCheckQuery = `
                    SELECT household_id 
                    FROM [HouseholdMember] 
                    WHERE idCard = @cccd
                `;
                
                const residentCheckResult = await residentCheckRequest.query(residentCheckQuery);

                // 2. Nếu tìm thấy
                if (residentCheckResult.recordset.length > 0) {
                    const foundHouseholdId = residentCheckResult.recordset[0].household_id;
                    
                    if (foundHouseholdId) {
                        // Tìm thấy! Cập nhật ngay vào bảng User
                        const updateUserRequest = pool.request();
                        updateUserRequest.input('userId', sql.NVarChar, user.id);
                        updateUserRequest.input('householdId', sql.NVarChar, foundHouseholdId);
                        
                        await updateUserRequest.query(`
                            UPDATE [User] 
                            SET household_id = @householdId 
                            WHERE id = @userId
                        `);
                        
                        // Cập nhật lại biến user trong bộ nhớ để trả về client luôn
                        user.household_id = foundHouseholdId;
                        console.log(`✅ Đã tự động liên kết hộ khẩu cho user ${user.full_name} (CCCD: ${user.cccd.trim()}) với Household ${foundHouseholdId}`);
                    }
                }
            } catch (err) {
                console.error('⚠️  Lỗi auto-link khi login:', err);
                // Không throw lỗi ở đây để user vẫn đăng nhập được bình thường
            }
        }

        // Tạo Token (JWT)
        const secretKey = process.env.JWT_SECRET || 'secret_mac_dinh';
        const accessToken = jwt.sign(
            { id: user.id, role: user.role }, 
            secretKey, 
            { expiresIn: '1d' }
        );

        // Trả về kết quả
        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            accessToken,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                status: user.status, // Thêm status vào user object
                household_id: user.household_id || null // Thêm household_id vào response
            }
        });

    } catch (error) {
        console.error('Lỗi Login:', error);
        res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
    }
};

/**
 * Lấy thông tin cá nhân của user đang đăng nhập
 * @route GET /api/auth/me
 * @access Private (cần token)
 */
const getMe = async (req, res) => {
  try {
    // Lấy user ID từ middleware (đã được gán vào req.user)
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const pool = await getPool();
    const request = pool.request();
    
    // Query lấy thông tin user theo ID (chỉ lấy các trường cần thiết, không lấy password)
    request.input('id', sql.NVarChar, userId);
    
    const query = `
      SELECT id, full_name, email, phone, role, avatar, status, created_at, updated_at
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
      message: 'Lấy thông tin user thành công',
      data: user,
    });

  } catch (error) {
    console.error('❌ Lỗi khi lấy thông tin user:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy thông tin user',
      error: error.message,
    });
  }
};

/**
 * Đổi mật khẩu (User tự đổi, không cần Admin duyệt)
 * @route PUT /api/auth/change-password
 * @access Private (cần token)
 */
const changePassword = async (req, res) => {
  try {
    // 1. Input: Lấy từ body và token
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id; // Lấy từ token (middleware đã verify)

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới',
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    // Kiểm tra độ dài mật khẩu mới
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu mới phải có ít nhất 6 ký tự',
      });
    }

    const pool = await getPool();

    // 2. Logic: Query DB lấy mật khẩu hiện tại của user
    const getUserRequest = pool.request();
    getUserRequest.input('userId', sql.NVarChar, userId);
    
    const getUserQuery = `
      SELECT password 
      FROM [User] 
      WHERE id = @userId
    `;
    
    const userResult = await getUserRequest.query(getUserQuery);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy user',
      });
    }

    const currentHashedPassword = userResult.recordset[0].password;

    // 3. Dùng bcrypt.compare để kiểm tra currentPassword có đúng không
    const isMatch = await bcrypt.compare(currentPassword, currentHashedPassword);
    
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Mật khẩu hiện tại không đúng',
      });
    }

    // 4. Nếu đúng -> Dùng bcrypt.hash để mã hóa newPassword
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // 5. UPDATE trực tiếp vào bảng [User]
    const updateRequest = pool.request();
    updateRequest.input('userId', sql.NVarChar, userId);
    updateRequest.input('hashedPass', sql.NVarChar, hashedNewPassword);
    
    await updateRequest.query(`
      UPDATE [User] 
      SET password = @hashedPass 
      WHERE id = @userId
    `);

    console.log(`✅ User ${userId} đã đổi mật khẩu thành công`);

    // 6. Trả về: "Đổi mật khẩu thành công"
    return res.json({
      success: true,
      message: 'Đổi mật khẩu thành công',
    });

  } catch (error) {
    console.error('❌ Lỗi khi đổi mật khẩu:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi đổi mật khẩu',
      error: error.message,
    });
  }
};

// Xuất cả các hàm ra để dùng
module.exports = {
    register,
    login,
    getMe,
    changePassword
};