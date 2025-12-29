const jwt = require('jsonwebtoken');

/**
 * Middleware xác thực JWT token
 * Kiểm tra header Authorization và verify token
 */
const verifyToken = (req, res, next) => {
  try {
    // Lấy token từ header Authorization
    const authHeader = req.headers.authorization;

    // Kiểm tra có header Authorization không
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Không tìm thấy token. Vui lòng đăng nhập.',
      });
    }

    // Kiểm tra format "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        message: 'Định dạng token không hợp lệ. Sử dụng format: "Bearer <token>"',
      });
    }

    const token = parts[1];

    // Verify token với JWT_SECRET
    const secretKey = process.env.JWT_SECRET || 'secret_mac_dinh';
    
    jwt.verify(token, secretKey, (err, decoded) => {
      if (err) {
        // Token không hợp lệ hoặc đã hết hạn
        return res.status(403).json({
          success: false,
          message: 'Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
          error: err.message,
        });
      }

      // Token hợp lệ, gán thông tin user vào req.user
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error('❌ Lỗi trong middleware verifyToken:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi xác thực token',
      error: error.message,
    });
  }
};

// Alias để code dễ đọc hơn
const authenticateToken = verifyToken;

module.exports = {
  verifyToken,
  authenticateToken,
};

