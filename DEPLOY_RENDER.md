# Đưa CLASS POINT lên public bằng Render Free

Phương án này chạy NestJS API và giao diện React trong cùng một Docker Web Service, đồng thời giữ PostgreSQL trên Neon hiện tại. Không tạo cơ sở dữ liệu Render mới để tránh chuyển hoặc làm mất dữ liệu.

## Giới hạn cần biết

- Render Free không tính phí cố định cho Web Service, nhưng không phải gói production: chỉ chạy một instance và không hỗ trợ scale nhiều instance.
- Service tự ngủ sau 15 phút không có truy cập. Lượt truy cập đầu tiên sau khi ngủ có thể phải chờ khoảng một phút để service chạy lại.
- Vì chỉ có một instance cấu hình thấp, không thể cam kết xử lý tốt 50–60 lượt đăng ký đồng thời. Hãy xem đây là phương án public để thử nghiệm/ra mắt ban đầu, không phải bảo đảm SLA.
- Nếu chưa thêm phương thức thanh toán mà chạm hạn mức miễn phí của Render, dịch vụ/build có thể bị tạm dừng thay vì tự tính tiền. Theo dõi Usage trong Render Dashboard.
- Neon Free hiện cấp 1 GB lưu trữ và 100 CU-hours mỗi project mỗi tháng. Theo dõi quota Neon khi lớp hoạt động thường xuyên.

## 1. Chuẩn bị database

Giữ database Neon hiện có. Trong `DATABASE_URL`, dùng connection string pooled của Neon (hostname có `-pooler`) và không đưa giá trị này vào GitHub.

Trước lần deploy đầu, chạy từ PowerShell ở thư mục dự án để áp dụng các migration đang có:

```powershell
npm.cmd run prisma:migrate:deploy
```

Lệnh này áp dụng migration lên database trong `DATABASE_URL` của `.env`. Nếu kết nối Neon lỗi, dừng ở đây và xử lý kết nối trước; không tạo một database trống thay thế.

## 2. Đưa source lên GitHub riêng tư

Render cần đọc source từ repository. Tạo một repository **Private** trên GitHub rồi chạy tại thư mục gốc dự án:

```powershell
git init
git add .
git commit -m "Prepare CLASS POINT for Render"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/class-point.git
git push -u origin main
```

`.gitignore` đã loại `.env`, dependencies và build output. Trước khi `git push`, kiểm tra `.env` không nằm trong danh sách staged:

```powershell
git status --short
```

## 3. Tạo Render Blueprint

1. Đăng nhập Render và kết nối GitHub repository riêng tư.
2. Chọn **New → Blueprint**, chọn repository vừa push. Render sẽ đọc `render.yaml` ở thư mục gốc.
3. Khi được hỏi các biến bí mật, nhập trực tiếp trong Render Dashboard:
   - `DATABASE_URL`: connection string pooled của Neon.
   - `JWT_ACCESS_SECRET`: secret hiện tại trong `.env`.
   - `JWT_REFRESH_SECRET`: secret hiện tại trong `.env`.
4. Tạo Blueprint và chờ Docker build/deploy hoàn tất.

Không gửi các giá trị trên trong chat, commit vào repository, hoặc thêm vào Dockerfile.

## 4. Mở ứng dụng

Render sẽ cấp URL dạng `https://<service-name>.onrender.com`:

- Web: mở URL gốc.
- Swagger: thêm `/api/docs`.
- App mobile: trỏ API base URL đến `https://<service-name>.onrender.com/api`.

Nếu deploy báo lỗi kết nối database, kiểm tra Neon đã cho phép kết nối từ dịch vụ ngoài, `DATABASE_URL` là pooled URL đúng, và migration đã chạy thành công.

## Vận hành

- Với gói free, không tạo nhiều instance; tính năng scale không có trên plan này.
- Không dùng Render Free Postgres cho dữ liệu lớp: database free của Render hết hạn sau 30 ngày và không có backup.
- Khi có thể nâng cấp, cần nâng service lên compute phù hợp để bỏ sleep và scale cho các đợt đăng ký đông.

Tài liệu: [Render Free](https://render.com/docs/free), [Render Blueprint](https://render.com/docs/blueprint-spec), [Neon Free Plan](https://neon.com/pricing).
