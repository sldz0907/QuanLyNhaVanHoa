const { getPool, sql } = require('../dbConfig');

/**
 * Format TIME từ Date object thành chuỗi "HH:mm"
 * Driver mssql trả về TIME dạng Date object (1970-01-01Txx:xx:xx.000Z)
 * Cần lấy đúng phần giờ phút để tránh lệch múi giờ
 * @param {Date|string|null} dateObj - Date object hoặc chuỗi TIME từ DB
 * @returns {string|null} - Chuỗi "HH:mm" hoặc null
 */
const formatTime = (dateObj) => {
  if (!dateObj) return null;
  
  // Nếu là Date object
  if (dateObj instanceof Date) {
    // Lấy phần giờ phút từ ISO string (substring từ vị trí 11 đến 16: "HH:mm")
    return dateObj.toISOString().substring(11, 16);
  }
  
  // Nếu đã là chuỗi, kiểm tra format và trả về phần HH:mm
  if (typeof dateObj === 'string') {
    // Nếu là chuỗi TIME đơn giản (HH:mm hoặc HH:mm:ss)
    if (dateObj.match(/^\d{2}:\d{2}/)) {
      return dateObj.substring(0, 5); // Lấy 5 ký tự đầu (HH:mm)
    }
    // Nếu là ISO string, lấy phần sau T
    if (dateObj.includes('T')) {
      const timePart = dateObj.split('T')[1];
      return timePart ? timePart.substring(0, 5) : null;
    }
  }
  
  return null;
};

/**
 * User tạo đơn đặt lịch
 * @route POST /api/bookings
 * @access Private (cần token)
 */
const createBooking = async (req, res) => {
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
      facility_id, 
      booking_date, 
      start_time, 
      end_time,
      purpose,
      attendees_count,
      quantity // Số lượng yêu cầu (mặc định là 1)
    } = req.body;

    // Ép kiểu facility_id từ string sang int
    const facilityId = parseInt(facility_id);

    // Validation
    if (isNaN(facilityId)) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng chọn tài sản hợp lệ (facility_id bị lỗi)',
      });
    }

    if (!booking_date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: booking_date, start_time, end_time',
      });
    }

    const pool = await getPool();
    // Xử lý quantity: nếu không tồn tại hoặc <= 0, gán mặc định = 1
    const requestQuantity = (quantity && parseInt(quantity) > 0) ? parseInt(quantity) : 1;
    
    // Xử lý attendees_count: nếu User có gửi lên -> Dùng giá trị đó, nếu không -> null
    const attendeesCount = (attendees_count !== undefined && attendees_count !== null) 
      ? parseInt(attendees_count) || 0 
      : null;

    // Xử lý start_time và end_time: chỉ lấy phần giờ phút (HH:mm hoặc HH:mm:ss)
    // Nếu client gửi Date object, format nó thành chuỗi giờ. Nếu là chuỗi, giữ nguyên.
    let startTimeString = start_time;
    let endTimeString = end_time;
    
    // Nếu là Date object hoặc ISO string, extract phần giờ phút
    if (start_time instanceof Date) {
      startTimeString = start_time.toTimeString().slice(0, 5); // HH:mm
    } else if (typeof start_time === 'string' && start_time.includes('T')) {
      // Nếu là ISO string (2024-01-01T08:00:00), lấy phần sau T và chỉ lấy HH:mm
      const timePart = start_time.split('T')[1] || start_time.split(' ')[1];
      startTimeString = timePart.slice(0, 5); // HH:mm
    } else if (typeof start_time === 'string') {
      // Nếu đã là chuỗi giờ (08:00 hoặc 08:00:00), giữ nguyên nhưng đảm bảo format đúng
      startTimeString = start_time.slice(0, 8); // HH:mm:ss hoặc HH:mm
    }
    
    if (end_time instanceof Date) {
      endTimeString = end_time.toTimeString().slice(0, 5); // HH:mm
    } else if (typeof end_time === 'string' && end_time.includes('T')) {
      const timePart = end_time.split('T')[1] || end_time.split(' ')[1];
      endTimeString = timePart.slice(0, 5); // HH:mm
    } else if (typeof end_time === 'string') {
      endTimeString = end_time.slice(0, 8); // HH:mm:ss hoặc HH:mm
    }

    // === BƯỚC 1: Lấy thông tin tài sản từ DB ===
    const facilityCheck = await pool.request()
      .input('facility_id', sql.Int, facilityId)
      .query(`
        SELECT quantity, name
        FROM [Facility]
        WHERE id = @facility_id
      `);

    if (facilityCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy tài sản với id này',
      });
    }

    const facility = facilityCheck.recordset[0];
    const maxCapacity = facility.quantity || 1; // Nếu quantity null thì mặc định là 1

    // === BƯỚC 2: Đếm số lượng đã được đặt trong khung giờ đó ===
    // Logic kiểm tra trùng lịch (Overlap Check):
    // Hai khoảng thời gian giao nhau khi: (start_time < @end_time AND end_time > @start_time)
    // Ví dụ: Đã có đơn 08:00-10:00, User đặt 09:30-11:00
    //   -> start_time (08:00) < @end_time (11:00) ✓
    //   -> end_time (10:00) > @start_time (09:30) ✓
    //   => Phát hiện trùng (trùng đoạn 09:30-10:00)
    const checkRequest = pool.request();
    checkRequest.input('facility_id', sql.Int, facilityId);
    checkRequest.input('booking_date', sql.Date, booking_date);
    checkRequest.input('start_time', sql.VarChar, startTimeString);
    checkRequest.input('end_time', sql.VarChar, endTimeString);

    const usageCheck = await checkRequest.query(`
      SELECT ISNULL(SUM(ISNULL(quantity, 1)), 0) as currentUsage
      FROM [FacilityBooking]
      WHERE facility_id = @facility_id
        AND booking_date = @booking_date
        AND status IN ('Pending', 'Approved')
        AND start_time < @end_time
        AND end_time > @start_time
    `);

    const currentUsage = usageCheck.recordset[0]?.currentUsage || 0;

    // === BƯỚC 3: So sánh và Quyết định ===
    if ((currentUsage + requestQuantity) > maxCapacity) {
      return res.status(400).json({
        success: false,
        message: `Tài sản "${facility.name || 'N/A'}" đã hết hoặc đã kín lịch trong khung giờ bạn chọn. (Đã sử dụng: ${currentUsage}/${maxCapacity})`,
      });
    }

    // === Cho phép INSERT đơn mới ===
    const insertRequest = pool.request();
    insertRequest.input('user_id', sql.NVarChar, userId);
    insertRequest.input('facility_id', sql.Int, facilityId);
    insertRequest.input('booking_date', sql.Date, booking_date);
    insertRequest.input('start_time', sql.VarChar, startTimeString);
    insertRequest.input('end_time', sql.VarChar, endTimeString);
    insertRequest.input('purpose', sql.NVarChar, purpose || null);
    insertRequest.input('attendees_count', sql.Int, attendeesCount);
    insertRequest.input('quantity', sql.Int, requestQuantity);
    insertRequest.input('status', sql.NVarChar, 'Pending');
    insertRequest.input('created_at', sql.DateTime, new Date());

    // Query: INSERT INTO FacilityBooking
    const insertQuery = `
      INSERT INTO [FacilityBooking] (
        user_id, facility_id, booking_date, start_time, end_time, purpose, attendees_count, quantity, status, created_at
      )
      OUTPUT INSERTED.*
      VALUES (
        @user_id, @facility_id, @booking_date, @start_time, @end_time, @purpose, @attendees_count, @quantity, @status, @created_at
      )
    `;

    const result = await insertRequest.query(insertQuery);

    if (result.recordset.length > 0) {
      console.log(`✅ Đã tạo Booking: ${result.recordset[0].id} bởi User: ${userId} (Quantity: ${requestQuantity})`);
      
      return res.status(201).json({
        success: true,
        message: 'Tạo đơn đặt lịch thành công',
        data: result.recordset[0],
      });
    } else {
      throw new Error('Không thể tạo đơn đặt lịch');
    }
  } catch (error) {
    console.error('❌ Lỗi khi tạo đơn đặt lịch:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi tạo đơn đặt lịch',
      error: error.message,
    });
  }
};

/**
 * Lấy lịch sử đặt của 1 user cụ thể
 * @route GET /api/bookings/my-bookings
 * @access Private (cần token)
 */
const getUserBookings = async (req, res) => {
  try {
    // Lấy user_id từ token
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy thông tin user',
      });
    }

    const pool = await getPool();
    
    const result = await pool.request()
      .input('user_id', sql.NVarChar, userId)
      .query(`
        SELECT 
          b.*,
          f.name as facility_name,
          f.location as facility_location
        FROM [FacilityBooking] b
        LEFT JOIN [Facility] f ON b.facility_id = f.id
        WHERE b.user_id = @user_id
        ORDER BY b.created_at DESC
      `);

    // Format start_time và end_time thành chuỗi "HH:mm" để tránh lệch múi giờ
    const bookings = result.recordset.map(booking => ({
      ...booking,
      start_time: formatTime(booking.start_time),
      end_time: formatTime(booking.end_time)
    }));

    return res.json({
      success: true,
      message: 'Lấy lịch sử đặt lịch thành công',
      data: bookings,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy lịch sử đặt lịch:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy lịch sử đặt lịch',
      error: error.message,
    });
  }
};

/**
 * Lấy toàn bộ đơn đặt lịch (cho Admin duyệt)
 * @route GET /api/bookings
 * @access Private (Admin only - cần token)
 */
const getAllBookings = async (req, res) => {
  try {
    const pool = await getPool();
    
    const result = await pool.request()
      .query(`
        SELECT 
          b.*,
          u.full_name as user_name,
          u.household_id,
          f.name as facility_name,
          f.location as facility_location
        FROM [FacilityBooking] b
        LEFT JOIN [User] u ON b.user_id = u.id
        LEFT JOIN [Facility] f ON b.facility_id = f.id
        ORDER BY b.created_at DESC
      `);

    // Format start_time và end_time thành chuỗi "HH:mm" để tránh lệch múi giờ
    const bookings = result.recordset.map(booking => ({
      ...booking,
      start_time: formatTime(booking.start_time),
      end_time: formatTime(booking.end_time)
    }));

    return res.json({
      success: true,
      message: 'Lấy danh sách đơn đặt lịch thành công',
      data: bookings,
    });
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách đơn đặt lịch:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách đơn đặt lịch',
      error: error.message,
    });
  }
};

/**
 * Admin cập nhật trạng thái đơn đặt lịch (Duyệt/Từ chối)
 * @route PUT /api/bookings/:id/status
 * @access Private (Admin only - cần token)
 * 
 * @param {string} req.params.id - ID đơn đặt lịch
 * @param {string} req.body.status - Trạng thái mới ('Pending', 'Approved', 'Rejected', 'Cancelled')
 * @param {string} req.body.admin_note - Ghi chú của admin (tùy chọn)
 */
const updateBookingStatus = async (req, res) => {
  try {
    const pool = await getPool();
    
    // Input: id từ params, status từ body
    const { id } = req.params;
    const { status, admin_note } = req.body;

    // Validation
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp id đơn đặt lịch',
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp trạng thái (status)',
      });
    }

    // Validate status - Đảm bảo hỗ trợ 'Rejected'
    const validStatuses = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Trạng thái không hợp lệ. Các trạng thái hợp lệ: ${validStatuses.join(', ')}`,
      });
    }

    // Thực hiện UPDATE: SET status = @status WHERE id = @id
    const updateRequest = pool.request();
    updateRequest.input('id', sql.NVarChar, id);
    updateRequest.input('status', sql.NVarChar, status);
    
    let updateQuery = `UPDATE [FacilityBooking] SET status = @status`;
    
    // Nếu có admin_note, thêm vào update
    if (admin_note !== undefined && admin_note !== null) {
      updateRequest.input('admin_note', sql.NVarChar, admin_note);
      updateQuery += `, admin_note = @admin_note`;
    }

    updateQuery += ` OUTPUT INSERTED.* WHERE id = @id`;

    const result = await updateRequest.query(updateQuery);

    if (result.recordset.length > 0) {
      console.log(`✅ Đã cập nhật Booking ${id} thành status: ${status}`);
      
      return res.json({
        success: true,
        message: 'Cập nhật trạng thái thành công',
        data: result.recordset[0],
      });
    } else {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy đơn đặt lịch để cập nhật',
      });
    }
  } catch (error) {
    console.error('❌ Lỗi khi cập nhật trạng thái đơn đặt lịch:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật trạng thái đơn đặt lịch',
      error: error.message,
    });
  }
};

module.exports = {
  createBooking,
  getUserBookings,
  getAllBookings,
  updateBookingStatus,
};

