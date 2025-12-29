# TDP7 Admin Backend API

Backend API server cho ứng dụng quản lý Tổ dân phố 7.

## Cài đặt

1. Cài đặt dependencies:
```bash
npm install
```

2. Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```

3. Cập nhật thông tin database trong file `.env`:
```env
DB_SERVER=localhost
DB_USER=api_user
DB_PASSWORD=1234567890
DB_DATABASE=NVHDB
DB_PORT=1433
PORT=5000
```

## Chạy ứng dụng

### Development mode (với nodemon):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

Server sẽ chạy tại: `http://localhost:5000`

## API Endpoints

### Health Check
- **GET** `/api/health` - Kiểm tra trạng thái server và database

### Users
- **GET** `/api/users` - Lấy danh sách tất cả users từ bảng [User]

## Cấu trúc thư mục

```
Admin/
├── .env                 # File cấu hình môi trường (tạo từ .env.example)
├── .env.example         # Template file cấu hình
├── .gitignore          # Git ignore file
├── dbConfig.js         # Cấu hình kết nối SQL Server
├── server.js           # File chính chạy Express server
├── package.json        # Dependencies và scripts
└── README.md           # Tài liệu này
```

## Lưu ý

- Đảm bảo SQL Server đang chạy và có thể kết nối
- Database `NVHDB` phải tồn tại
- User `api_user` phải có quyền truy cập database
- Port 5000 phải không bị chiếm dụng

## Troubleshooting

### Lỗi kết nối database:
- Kiểm tra SQL Server đang chạy
- Kiểm tra thông tin trong file `.env`
- Kiểm tra firewall có chặn port 1433 không
- Kiểm tra user có quyền truy cập database không

### Lỗi "Cannot find module":
- Chạy `npm install` để cài đặt dependencies

