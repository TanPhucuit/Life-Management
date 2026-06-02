# Life Management System

Ứng dụng quản lý lịch, nhiệm vụ dạng cây và session làm việc cá nhân.

## Tính năng chính

- Đăng nhập và đăng ký bằng username/password.
- Dashboard tổng quan với điều hướng: Tổng quan, Lịch, Nhiệm vụ, Phân tích, Cài đặt.
- Calendar kiểu Google Calendar, hiển thị session như event và deadline như task chip.
- Task là phân hệ độc lập, không còn phụ thuộc tháng.
- Task hỗ trợ cây nhiều cấp: root task, task con và các cấp nhỏ hơn.
- Task cha không tick thủ công; trạng thái hoàn thành được tính từ toàn bộ task con.
- Leaf task có thể tick hoàn thành hoặc chưa hoàn thành.
- Mỗi task có nhiều session; trạng thái session đúng giờ/trễ giờ độc lập với task.
- Analytics thống kê task hoàn thành, root task đang chạy, session đúng giờ, tổng thời lượng và task quá hạn.

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
- `sort_order`: thứ tự hiển thị trong cùng một cấp.
- `archived_at`: dùng để lưu trữ thay vì xóa cứng.
- `status`: chỉ dùng trực tiếp cho leaf task.
- `effective_status`: được API tính toán cho task cha.

### Sessions

- `task_id`: session thuộc về một task bất kỳ trong cây.
- `session_name`: tên session.
- `start_time`, `end_time`, `session_date`: thời gian session.
- `in_time_status`: `in_time` hoặc `out_time`.
- `focused_minutes`, `key_of_success`: dữ liệu bổ sung cho thống kê.

## Kiểm tra

```bash
npm run build
```

Không dùng thao tác destructive trên Supabase/Coolify/VPS khi migrate dữ liệu thật.
