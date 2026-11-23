# Chạy CLASS POINT trên máy GVCN

Chế độ này chạy NestJS API ngay trên máy Windows của GVCN và mở giao diện trong
cửa sổ app Microsoft Edge. API chỉ nghe trên `127.0.0.1`, nên máy khác trong mạng
không thể truy cập trực tiếp. Không cần public API server.

## Cần chuẩn bị

- Node.js đã cài trên máy.
- File `.env` ở thư mục dự án, với `DATABASE_URL` trỏ tới database Neon hiện có
  (connection string pooled) và hai JWT secret riêng biệt, mỗi secret tối thiểu
  32 ký tự.
- Máy có Internet để backend kết nối Neon. Điểm và danh sách lớp vẫn được lưu trên
  Neon; ứng dụng không đồng bộ dữ liệu khi offline.

Không đưa `.env` lên GitHub. Nếu `.env` chưa tồn tại, sao chép `.env.example` thành
`.env`, sau đó điền các giá trị cần thiết.

## Lần chạy đầu

Nếu database chưa áp dụng các migration hiện có, mở PowerShell ở thư mục dự án và
chạy lệnh này một lần:

```powershell
npm.cmd run prisma:migrate:deploy
```

GVCN cần có tài khoản và quyền HOMEROOM_TEACHER trong lớp. Nếu database Neon chưa có
lớp/tài khoản GVCN, cấu hình bootstrap seed theo hướng dẫn trong `prisma/README.md`.

## Mở ứng dụng

Nhấp đúp `Start-Class-Point.bat`. Launcher sẽ tạo Prisma Client, build backend và
frontend, khởi động API trên `127.0.0.1:3000`, rồi mở CLASS POINT trong cửa sổ Edge.
Giữ cửa sổ terminal mở trong lúc sử dụng; nhấn `Ctrl+C` ở cửa sổ đó để dừng server.

Lần chạy sau vẫn build lại ứng dụng trước khi mở. Nếu cổng 3000 đang được một ứng
dụng khác sử dụng, đóng ứng dụng đó rồi chạy launcher lại.

## Dữ liệu và sao lưu

Ứng dụng trên máy GVCN chỉ là giao diện và API cục bộ. Database vẫn nằm trên Neon,
nên cần Internet. Sao lưu dữ liệu bằng chức năng backup của Neon hoặc xuất database;
không xóa `.env` trước khi lưu connection string an toàn.
