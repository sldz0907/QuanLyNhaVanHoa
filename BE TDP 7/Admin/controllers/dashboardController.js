const { getPool, sql } = require('../dbConfig');

/**
 * Lấy số liệu thống kê cho Dashboard
 * @route GET /api/dashboard/stats
 * @access Private (Admin only - cần token)
 */
const getDashboardStats = async (req, res) => {
  try {
    const pool = await getPool();

    // Query 1: Đếm tổng số hộ trong bảng Household
    const householdsResult = await pool.request()
      .query("SELECT COUNT(*) as count FROM [Household]");
    const total_households = householdsResult.recordset[0]?.count || 0;

    // Query 2: Đếm tổng nhân khẩu trong bảng HouseholdMember
    const residentsResult = await pool.request()
      .query("SELECT COUNT(*) as count FROM [HouseholdMember]");
    const total_residents = residentsResult.recordset[0]?.count || 0;

    // Query 3: Đếm riêng đơn Tạm trú trong bảng RegistrationRequest
    // Query linh hoạt: Không phân biệt hoa thường, xử lý cả 'TamTru' và 'tam_tru'
    const tamTruResult = await pool.request()
      .query(`
        SELECT COUNT(*) as count 
        FROM [RegistrationRequest] 
        WHERE LOWER(LTRIM(RTRIM(type))) = 'tamtru' 
           OR LOWER(LTRIM(RTRIM(type))) = 'tam_tru'
           OR type LIKE 'TamTru%'
      `);
    const tam_tru_count = tamTruResult.recordset[0]?.count || 0;

    // Query 4: Đếm số đơn đang chờ duyệt
    // Query linh hoạt: Không phân biệt hoa thường, xử lý cả NULL và viết thường
    const pendingResult = await pool.request()
      .query(`
        SELECT COUNT(*) as count 
        FROM [RegistrationRequest] 
        WHERE LOWER(LTRIM(RTRIM(status))) = 'pending' 
           OR status LIKE 'Pending%'
           OR status IS NULL
      `);
    const pending_requests = pendingResult.recordset[0]?.count || 0;

    // Query 5: Đếm số lượng Nam/Nữ từ bảng HouseholdMember (Phân bố giới tính)
    const genderStatsResult = await pool.request()
      .query(`
        SELECT gender, COUNT(*) as count 
        FROM [HouseholdMember] 
        WHERE gender IS NOT NULL
        GROUP BY gender
      `);
    
    // Format gender_stats: [{ gender: 'Nam', count: 100 }, { gender: 'Nữ', count: 90 }]
    const gender_stats = genderStatsResult.recordset.map(row => ({
      gender: row.gender || 'Không xác định',
      count: row.count || 0
    }));

    // Query 6: Phân nhóm tuổi từ ngày sinh dob (Phân bố độ tuổi)
    const ageStatsResult = await pool.request()
      .query(`
        SELECT
          CASE
            WHEN DATEDIFF(YEAR, dob, GETDATE()) <= 5 THEN 'mam_non'
            WHEN DATEDIFF(YEAR, dob, GETDATE()) BETWEEN 6 AND 14 THEN 'hoc_sinh'
            WHEN DATEDIFF(YEAR, dob, GETDATE()) BETWEEN 15 AND 18 THEN 'thpt'
            WHEN DATEDIFF(YEAR, dob, GETDATE()) BETWEEN 19 AND 60 THEN 'lao_dong'
            ELSE 'cao_tuoi'
          END AS age_group,
          COUNT(*) as count
        FROM [HouseholdMember]
        WHERE dob IS NOT NULL
        GROUP BY
          CASE
            WHEN DATEDIFF(YEAR, dob, GETDATE()) <= 5 THEN 'mam_non'
            WHEN DATEDIFF(YEAR, dob, GETDATE()) BETWEEN 6 AND 14 THEN 'hoc_sinh'
            WHEN DATEDIFF(YEAR, dob, GETDATE()) BETWEEN 15 AND 18 THEN 'thpt'
            WHEN DATEDIFF(YEAR, dob, GETDATE()) BETWEEN 19 AND 60 THEN 'lao_dong'
            ELSE 'cao_tuoi'
          END
      `);
    
    // Format age_stats: { mam_non: 10, hoc_sinh: 50, thpt: 30, lao_dong: 200, cao_tuoi: 100 }
    const age_stats = {
      mam_non: 0,
      hoc_sinh: 0,
      thpt: 0,
      lao_dong: 0,
      cao_tuoi: 0
    };
    
    ageStatsResult.recordset.forEach(row => {
      const ageGroup = row.age_group;
      const count = row.count || 0;
      if (ageGroup && age_stats.hasOwnProperty(ageGroup)) {
        age_stats[ageGroup] = count;
      }
    });

    // Trả về JSON với đầy đủ các key
    res.json({
      total_households: total_households,
      total_residents: total_residents,
      tam_tru_count: tam_tru_count,
      pending_requests: pending_requests,
      gender_stats: gender_stats,
      age_stats: age_stats
    });
  } catch (err) {
    console.error('❌ Lỗi khi lấy số liệu thống kê:', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getDashboardStats,
};

