# Hệ thống Quản lý Tổ dân phố 7 (TDP7)

Hệ thống quản lý điện tử cho Tổ dân phố 7, hỗ trợ quản lý cư dân, hộ khẩu, đặt lịch nhà văn hóa, phản ánh và các dịch vụ hành chính khác.

## 🚀 Tính năng chính

### Dành cho Cư dân
- **Quản lý hộ khẩu**: Xem thông tin hộ khẩu và thành viên trong gia đình
- **Khai báo & Biểu mẫu**: Khai báo tạm trú, tạm vắng, biến động nhân khẩu
- **Đặt lịch Nhà văn hóa**: Đặt lịch sử dụng hội trường, sân thể thao với thanh toán QR
- **Tin tức & Sự kiện**: Xem thông báo, lịch họp, sự kiện của tổ dân phố
- **Phản ánh & Góp ý**: Gửi phản ánh về các vấn đề trong khu vực

### Dành cho Quản trị viên
- **Quản lý Cư dân & Hộ khẩu**: Quản lý toàn bộ thông tin cư dân và hộ gia đình
- **Phê duyệt Yêu cầu**: Duyệt các yêu cầu từ cư dân (tạm trú, tạm vắng, đặt lịch)
- **Báo cáo & Thống kê**: Xem báo cáo tổng hợp, thống kê nhân khẩu, xuất báo cáo
- **Quản lý Tài sản**: Quản lý tài sản công cộng (hội trường, thiết bị)
- **Dashboard**: Tổng quan hệ thống với biểu đồ và số liệu thống kê

## 🛠️ Công nghệ sử dụng

### Frontend
- **React 18** + **TypeScript** - Framework và ngôn ngữ
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI Component library
- **React Router** - Routing
- **Axios** - HTTP client

### Backend
- **Node.js** + **Express** - Server framework
- **SQL Server** - Database
- **JWT** - Authentication
- **bcryptjs** - Password hashing

## 📦 Cài đặt

### Yêu cầu hệ thống
- Node.js >= 18.x
- SQL Server 2019+
- npm hoặc yarn

### Backend Setup

```bash
cd "BE TDP 7/Admin"
npm install

# Tạo file .env
cp .env.example .env
# Cập nhật thông tin database trong .env

# Chạy database script
# Thực thi file script.sql trong SQL Server

# Chạy server
npm run dev  # Development mode
npm start    # Production mode
```

Backend chạy tại: `http://localhost:5000`

### Frontend Setup

```bash
cd "FE TDP7"
npm install
npm run dev
```

Frontend chạy tại: `http://localhost:5173`

## 🔐 Tài khoản mặc định

- **Admin**: `admin@gmail.com` / `admin123`
- **User**: `test@gmail.com` / `123456`

## 📁 Cấu trúc dự án

```
QuanLyNhaVanHoa-main/
├── BE TDP 7/              # Backend API
│   └── Admin/
│       ├── controllers/   # Business logic
│       ├── routes/        # API routes
│       ├── middleware/    # Auth middleware
│       └── server.js      # Entry point
├── FE TDP7/               # Frontend React
│   └── src/
│       ├── pages/         # Page components
│       ├── components/    # Reusable components
│       ├── services/      # API services
│       └── contexts/      # React contexts
└── script.sql            # Database schema
```
