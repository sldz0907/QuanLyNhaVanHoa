const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  user: process.env.DB_USER || 'api_user',
  password: process.env.DB_PASSWORD || '1234567890',
  database: process.env.DB_DATABASE || 'NVHDB',
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: false, // Sử dụng true nếu kết nối Azure SQL
    trustServerCertificate: true, // Bỏ qua chứng chỉ SSL (cho development)
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Tạo connection pool - KHÔNG khởi tạo ở top-level
let pool = null;
let isConnecting = false;
let connectionPromise = null;

const getPool = async () => {
  try {
    // Nếu đã có pool, trả về ngay (không cần kiểm tra connected vì mssql tự quản lý)
    if (pool) {
      return pool;
    }
    
    // Nếu đang trong quá trình kết nối, đợi promise hiện tại
    if (isConnecting && connectionPromise) {
      return await connectionPromise;
    }
    
    // Tạo kết nối mới (chỉ 1 lần)
    isConnecting = true;
    connectionPromise = sql.connect(dbConfig).then((connectedPool) => {
      pool = connectedPool;
      isConnecting = false;
      return pool;
    }).catch((error) => {
      isConnecting = false;
      connectionPromise = null;
      throw error;
    });
    
    return await connectionPromise;
  } catch (error) {
    isConnecting = false;
    connectionPromise = null;
    console.error('❌ Lỗi kết nối database:', error);
    throw error;
  }
};

// Đóng kết nối
const closePool = async () => {
  try {
    if (pool) {
      await pool.close();
      pool = null;
      console.log('✅ Đã đóng kết nối database');
    }
  } catch (error) {
    console.error('❌ Lỗi đóng kết nối:', error);
  }
};

module.exports = {
  getPool,
  closePool,
  sql,
};


