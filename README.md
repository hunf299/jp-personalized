# JP Personalized App

App học tiếng Nhật cá nhân hóa (CSV Upload → Menu tính năng).
Stack: Next.js (pages router) + MUI + file JSON lưu ở `.data/` (mặc định).

## Chạy dự án
```bash
npm i
npm run dev
# http://localhost:3000
```

## Cấu hình
Tạo `.env.local` nếu muốn thay thư mục dữ liệu:
```
DATA_DIR=.data
```

## Import CSV
- Headers: `front,back,category`
- Riêng `grammar` có thể thêm `related_rules` (ví dụ: `Vて`)

Upload ở trang **Home** theo từng loại.

## API
- `POST /api/import/csv?type=vocab|kanji|grammar|particle` body `{ csv: "..." }`
- `GET /api/cards` → danh sách thẻ
- `POST /api/review/log` → `{ card, quality }`
- `GET /api/stats` → đếm số thẻ theo loại

## Lưu ý
- Mặc định sử dụng JSON file `.data/db.json`. File `schema.sql` cung cấp nếu bạn muốn migrate sang SQLite.

## Ứng dụng iOS
- Mã nguồn nằm tại `ios/JPApp` với giao diện UIKit theo phong cách liquid glass.
- Mở `ios/JPApp/JPApp.xcodeproj` bằng Xcode 15+, chỉnh Development Team và chạy trên thiết bị/simulator iOS 17 trở lên.
- Ứng dụng sử dụng chung API Next.js (`/api/stats`) và có thể cấu hình biến môi trường `JP_BACKEND_URL` trong Xcode để trỏ tới backend triển khai.
