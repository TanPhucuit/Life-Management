# Frontend Guide

## UI direction

Giao diện theo hướng productivity platform hiện đại, tham chiếu Stitch project `projects/10361257389500920755`.

- Light-first, nền trắng/xám nhạt.
- Layout dày thông tin nhưng dễ quét.
- Card và control dùng bo góc nhỏ, khoảng 6-8px.
- Không dùng glassmorphism nặng hoặc gradient trang trí.
- Desktop ưu tiên sidebar, workspace chính, inspector.
- Mobile dùng bottom navigation và nội dung xếp dọc.

## Main screens

### Dashboard

`Dashboard.tsx` là shell chính sau đăng nhập:

- Tổng quan
- Lịch
- Nhiệm vụ
- Phân tích
- Cài đặt

App không còn bắt buộc chọn tháng trước khi vào dashboard.

### Task Workspace

`TaskManager.tsx` triển khai task tree:

- Sidebar topic.
- Top toolbar với search và quick create.
- Cột ngang theo cấp task.
- Inspector bên phải cho task đang chọn.
- Modal tạo root task hoặc task con.
- Modal thêm session.

Quy tắc:

- Root task là task không có `parent_task_id`.
- Task cha không tick thủ công.
- Leaf task mới có checkbox.
- Completion của task cha được tính từ task con.
- Delete trong UI là archive.

### Calendar

`CalendarView.tsx` hiển thị:

- Session như event pill.
- Deadline task như chip màu cam.
- Click ngày mở `DayDetailsPage`.

### Analytics

`Analytics.tsx` thống kê:

- Completed leaf tasks.
- Active root tasks.
- On-time sessions.
- Total session duration.
- Overdue leaf tasks.
- Session trend.
- Completion by topic.

## Design notes

- Dùng Lucide icons.
- Text Tiếng Việt phải lưu UTF-8.
- Không để text tràn khỏi card/button trên mobile.
- Các view quan trọng cần responsive cho desktop và mobile.
