# Life Management System

Ứng dụng quản lý lịch, nhiệm vụ dạng cây và dữ liệu tập trung theo ngày.

## Tính năng chính

- Đăng nhập và đăng ký bằng username/password.
- Dashboard tổng quan với điều hướng: Tổng quan, Lịch, Nhiệm vụ, Phân tích, Cài đặt.
- Calendar kiểu Google Calendar, hiển thị deadline như task chip.
- Calendar hiển thị ngày thực hiện của task bằng chip xanh dương và deadline bằng chip đỏ.
- Task là phân hệ độc lập, không còn phụ thuộc tháng.
- Mỗi chủ đề có thể có nhiều root task, tương ứng nhiều cây task riêng.
- Task hỗ trợ cây nhiều cấp: root task, task con và các cấp nhỏ hơn.
- Task cha không tick thủ công; trạng thái hoàn thành được tính từ toàn bộ task con.
- Leaf task có thể đặt trạng thái: chưa hoàn thành, đang thực hiện hoặc hoàn thành.
- Task hoàn thành tự động chuyển sang nền xanh lá dễ đọc.
- Task đang thực hiện tự động chuyển sang nền xanh dương dễ đọc.
- Analytics và workspace thống kê task hoàn thành, task chưa hoàn thành, task đang thực hiện, giờ tập trung và task quá hạn.

## Tech Stack

- Next.js 16, React 18, TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Zustand
- Recharts
- Lucide React

## Cài đặt

1. Cài dependencies:

```bash
npm install
```

2. Tạo `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

3. Chạy schema trong `database_schema.sql` bằng Supabase SQL Editor.

Với database cũ, chỉ chạy phần migration non-destructive ở cuối file nếu các bảng đã tồn tại.

4. Chạy dev server:

```bash
npm run dev
```

Mở `http://localhost:3000`.

## Schema chính

### Tasks

- `parent_task_id`: task cha, null nghĩa là root task.
- `start_date`: ngày thực hiện task, hiển thị màu xanh dương trên lịch.
- `deadline`: hạn task, hiển thị màu đỏ trên lịch.
- `sort_order`: thứ tự hiển thị trong cùng một cấp.
- `archived_at`: dùng để lưu trữ thay vì xóa cứng.
- `status`: `not_completed`, `in_progress` hoặc `completed`; chỉ dùng trực tiếp cho leaf task.
- `effective_status`: được API tính toán cho task cha.

### Dates

- `focused_minutes`: số phút tập trung trong ngày.
- `key_of_success`: điểm chất lượng/ngày.
- Bảng `sessions` cũ có thể còn trong database để giữ dữ liệu legacy, nhưng UI hiện tại không dùng session.

## Kiểm tra

```bash
npm run build
```

Không dùng thao tác destructive trên Supabase/Coolify/VPS khi migrate dữ liệu thật.
