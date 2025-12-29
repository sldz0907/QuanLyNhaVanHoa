const { getPool, closePool, sql } = require('./dbConfig');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Script seed dữ liệu mẫu cho database
 * Chạy: npm run seed
 */

async function seed() {
  let pool;
  
  try {
    console.log('🌱 Bắt đầu seed dữ liệu...\n');
    
    // Kết nối database
    pool = await getPool();
    console.log('✅ Đã kết nối database\n');
    
    // ============================================
    // 1. XÓA DỮ LIỆU CŨ (theo thứ tự để tránh lỗi khóa ngoại)
    // ============================================
    console.log('🗑️  Đang xóa dữ liệu cũ...');
    
    try {
      // Xóa Booking trước (nếu có)
      await pool.request().query('DELETE FROM [Booking]');
      console.log('   ✓ Đã xóa Booking');
    } catch (error) {
      console.log('   ⚠️  Bảng Booking không tồn tại hoặc đã trống');
    }
    
    try {
      // Xóa HouseholdMember
      await pool.request().query('DELETE FROM [HouseholdMember]');
      console.log('   ✓ Đã xóa HouseholdMember');
    } catch (error) {
      console.log('   ⚠️  Bảng HouseholdMember không tồn tại hoặc đã trống');
    }
    
    try {
      // Xóa User
      await pool.request().query('DELETE FROM [User]');
      console.log('   ✓ Đã xóa User');
    } catch (error) {
      console.log('   ⚠️  Bảng User không tồn tại hoặc đã trống');
    }
    
    try {
      // Xóa Household
      await pool.request().query('DELETE FROM [Household]');
      console.log('   ✓ Đã xóa Household');
    } catch (error) {
      console.log('   ⚠️  Bảng Household không tồn tại hoặc đã trống');
    }
    
    console.log('✅ Đã xóa sạch dữ liệu cũ\n');
    
    // ============================================
    // 2. TẠO DỮ LIỆU MỚI
    // ============================================
    console.log('📝 Đang tạo dữ liệu mẫu...\n');
    
    // --- 2.1. Tạo Household ---
    console.log('🏠 Tạo Household...');
    const household1Id = crypto.randomUUID();
    const household2Id = crypto.randomUUID();
    
    const household1Request = pool.request();
    household1Request.input('id', sql.NVarChar, household1Id);
    household1Request.input('code', sql.NVarChar, 'TDP7-2024-001');
    household1Request.input('address', sql.NVarChar, 'Số 123, Đường ABC, Phường XYZ, Quận 1, TP.HCM');
    household1Request.input('area', sql.Float, 60.5);
    
    await household1Request.query(`
      INSERT INTO [Household] (id, code, address, area, created_at)
      VALUES (@id, @code, @address, @area, GETDATE())
    `);
    console.log(`   ✓ Đã tạo Household 1: ${household1Id} (${household1Request.parameters.code.value})`);
    
    const household2Request = pool.request();
    household2Request.input('id', sql.NVarChar, household2Id);
    household2Request.input('code', sql.NVarChar, 'TDP7-2024-002');
    household2Request.input('address', sql.NVarChar, 'Số 456, Đường DEF, Phường UVW, Quận 2, TP.HCM');
    household2Request.input('area', sql.Float, 45.0);
    
    await household2Request.query(`
      INSERT INTO [Household] (id, code, address, area, created_at)
      VALUES (@id, @code, @address, @area, GETDATE())
    `);
    console.log(`   ✓ Đã tạo Household 2: ${household2Id} (${household2Request.parameters.code.value})\n`);
    
    // --- 2.2. Tạo Admin ---
    console.log('👤 Tạo Admin...');
    const adminId = crypto.randomUUID();
    const adminPassword = '123456';
    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    
    const adminRequest = pool.request();
    adminRequest.input('id', sql.NVarChar, adminId);
    adminRequest.input('full_name', sql.NVarChar, 'Quản trị viên');
    adminRequest.input('email', sql.NVarChar, 'admin@gmail.com');
    adminRequest.input('password', sql.NVarChar, hashedAdminPassword);
    adminRequest.input('phone', sql.NVarChar, '0901234567');
    adminRequest.input('role', sql.NVarChar, 'admin');
    adminRequest.input('status', sql.NVarChar, 'active');
    
    await adminRequest.query(`
      INSERT INTO [User] (id, full_name, email, password, phone, role, status, created_at)
      VALUES (@id, @full_name, @email, @password, @phone, @role, @status, GETDATE())
    `);
    console.log(`   ✓ Đã tạo Admin: ${adminId} (admin@gmail.com / ${adminPassword})\n`);
    
    // --- 2.3. Tạo User 1 (Chủ hộ) ---
    console.log('👨 Tạo User 1 (Chủ hộ)...');
    const user1Id = crypto.randomUUID();
    const user1Password = '123456';
    const hashedUser1Password = await bcrypt.hash(user1Password, 10);
    
    const user1Request = pool.request();
    user1Request.input('id', sql.NVarChar, user1Id);
    user1Request.input('full_name', sql.NVarChar, 'Nguyễn Văn A');
    user1Request.input('email', sql.NVarChar, 'test@gmail.com');
    user1Request.input('password', sql.NVarChar, hashedUser1Password);
    user1Request.input('phone', sql.NVarChar, '0912345678');
    user1Request.input('role', sql.NVarChar, 'user');
    user1Request.input('status', sql.NVarChar, 'active');
    user1Request.input('household_id', sql.NVarChar, household1Id);
    user1Request.input('dob', sql.NVarChar, '1990-01-15');
    user1Request.input('gender', sql.NVarChar, 'Nam');
    user1Request.input('cccd', sql.NVarChar, '001234567890');
    user1Request.input('job', sql.NVarChar, 'Kỹ sư');
    user1Request.input('workplace', sql.NVarChar, 'Công ty ABC');
    
    await user1Request.query(`
      INSERT INTO [User] (id, full_name, email, password, phone, role, status, household_id, dob, gender, cccd, job, workplace, created_at)
      VALUES (@id, @full_name, @email, @password, @phone, @role, @status, @household_id, @dob, @gender, @cccd, @job, @workplace, GETDATE())
    `);
    console.log(`   ✓ Đã tạo User 1: ${user1Id} (test@gmail.com / ${user1Password})`);
    console.log(`   ✓ Gán vào Household 1\n`);
    
    // --- 2.4. Tạo User 2 (Vợ) ---
    console.log('👩 Tạo User 2 (Vợ)...');
    const user2Id = crypto.randomUUID();
    const user2Password = '123456';
    const hashedUser2Password = await bcrypt.hash(user2Password, 10);
    
    const user2Request = pool.request();
    user2Request.input('id', sql.NVarChar, user2Id);
    user2Request.input('full_name', sql.NVarChar, 'Trần Thị B');
    user2Request.input('email', sql.NVarChar, 'wife@gmail.com');
    user2Request.input('password', sql.NVarChar, hashedUser2Password);
    user2Request.input('phone', sql.NVarChar, '0923456789');
    user2Request.input('role', sql.NVarChar, 'user');
    user2Request.input('status', sql.NVarChar, 'active');
    user2Request.input('household_id', sql.NVarChar, household1Id);
    user2Request.input('dob', sql.NVarChar, '1992-05-20');
    user2Request.input('gender', sql.NVarChar, 'Nữ');
    user2Request.input('cccd', sql.NVarChar, '001234567891');
    user2Request.input('job', sql.NVarChar, 'Giáo viên');
    user2Request.input('workplace', sql.NVarChar, 'Trường THPT XYZ');
    
    await user2Request.query(`
      INSERT INTO [User] (id, full_name, email, password, phone, role, status, household_id, dob, gender, cccd, job, workplace, created_at)
      VALUES (@id, @full_name, @email, @password, @phone, @role, @status, @household_id, @dob, @gender, @cccd, @job, @workplace, GETDATE())
    `);
    console.log(`   ✓ Đã tạo User 2: ${user2Id} (wife@gmail.com / ${user2Password})`);
    console.log(`   ✓ Gán vào Household 1\n`);
    
    // --- 2.5. Đồng bộ vào HouseholdMember ---
    console.log('🔄 Đồng bộ vào HouseholdMember...');
    
    // Member 1: Nguyễn Văn A (Chủ hộ)
    const member1Id = crypto.randomUUID();
    const member1Request = pool.request();
    member1Request.input('id', sql.NVarChar, member1Id);
    member1Request.input('household_id', sql.NVarChar, household1Id);
    member1Request.input('name', sql.NVarChar, 'Nguyễn Văn A');
    member1Request.input('role', sql.NVarChar, 'Chủ hộ');
    member1Request.input('dob', sql.NVarChar, '1990-01-15');
    member1Request.input('gender', sql.NVarChar, 'Nam');
    member1Request.input('idCard', sql.NVarChar, '001234567890');
    member1Request.input('occupation', sql.NVarChar, 'Kỹ sư');
    member1Request.input('workplace', sql.NVarChar, 'Công ty ABC');
    
    await member1Request.query(`
      INSERT INTO [HouseholdMember] (id, household_id, name, role, dob, gender, idCard, occupation, workplace)
      VALUES (@id, @household_id, @name, @role, @dob, @gender, @idCard, @occupation, @workplace)
    `);
    console.log(`   ✓ Đã tạo HouseholdMember 1: ${member1Id} (Nguyễn Văn A - Chủ hộ)`);
    
    // Member 2: Trần Thị B (Vợ)
    const member2Id = crypto.randomUUID();
    const member2Request = pool.request();
    member2Request.input('id', sql.NVarChar, member2Id);
    member2Request.input('household_id', sql.NVarChar, household1Id);
    member2Request.input('name', sql.NVarChar, 'Trần Thị B');
    member2Request.input('role', sql.NVarChar, 'Vợ/Chồng');
    member2Request.input('dob', sql.NVarChar, '1992-05-20');
    member2Request.input('gender', sql.NVarChar, 'Nữ');
    member2Request.input('idCard', sql.NVarChar, '001234567891');
    member2Request.input('occupation', sql.NVarChar, 'Giáo viên');
    member2Request.input('workplace', sql.NVarChar, 'Trường THPT XYZ');
    
    await member2Request.query(`
      INSERT INTO [HouseholdMember] (id, household_id, name, role, dob, gender, idCard, occupation, workplace)
      VALUES (@id, @household_id, @name, @role, @dob, @gender, @idCard, @occupation, @workplace)
    `);
    console.log(`   ✓ Đã tạo HouseholdMember 2: ${member2Id} (Trần Thị B - Vợ/Chồng)\n`);
    
    // ============================================
    // 3. HOÀN TẤT
    // ============================================
    console.log('✅ Seed dữ liệu hoàn tất!\n');
    console.log('📊 Tóm tắt:');
    console.log('   - 2 Household');
    console.log('   - 1 Admin (admin@gmail.com / 123456)');
    console.log('   - 2 User thường:');
    console.log('     + test@gmail.com / 123456 (Chủ hộ)');
    console.log('     + wife@gmail.com / 123456 (Vợ)');
    console.log('   - 2 HouseholdMember (đã đồng bộ)\n');
    
  } catch (error) {
    console.error('❌ Lỗi khi seed dữ liệu:', error);
    throw error;
  } finally {
    // Đóng kết nối
    await closePool();
  }
}

// Chạy seed
seed()
  .then(() => {
    console.log('🎉 Hoàn thành!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Lỗi:', error);
    process.exit(1);
  });

