# Quick Start

## 1. Supabase

1. Tạo Supabase project.
2. Mở SQL Editor.
3. Nếu database mới: chạy toàn bộ `database_schema.sql`.
4. Nếu database cũ: chạy các `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` và index ở cuối file để không mất dữ liệu.

Không drop table, truncate table hoặc xóa dữ liệu khi migrate.

## 2. Environment

Tạo `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Production/Vercel không cần đặt `NEXT_PUBLIC_API_URL` nếu API chạy cùng app.

## 3. Run

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

## 4. Test nhanh

1. Đăng ký tài khoản.
2. Tạo topic.
3. Vào Nhiệm vụ, tạo root task.
4. Chọn root task, tạo task con nhiều cấp.
5. Tick leaf task và kiểm tra task cha tự đổi trạng thái khi mọi task con hoàn thành.
6. Thêm session vào task và đổi trạng thái đúng giờ/trễ giờ.
7. Vào Lịch để xem session và deadline.
8. Vào Phân tích để xem thống kê task/session.

## 5. Cấu trúc chính

```text
app/
  api/          API routes
  components/   UI components
  lib/          Supabase client, API client, store
  globals.css   Tailwind globals
database_schema.sql
```

## 6. Verify

```bash
npm run build
```
