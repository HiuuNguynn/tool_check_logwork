# Backlog Logwork Report

Công cụ thống kê ticket Backlog để kiểm tra logwork trước khi chốt performance.
Đọc trực tiếp từ Backlog API, không ghi gì lên Backlog.

## Tool làm gì

**Bảng theo ticket** — mỗi dòng một ticket với đầy đủ các cột cần đối chiếu:

| Key | Summary | Start Date | Due Date | Actual End-date | Estimate | Actual | Re-estimate | Status | Rule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

**Bảng theo ngày** — gom ticket theo ngày làm việc, cộng tổng Actual hours, đối chiếu
với mốc 8h/ngày, và nếu có cấu hình ACMS token thì đối chiếu thêm với **Time dự án**
(tool báo cáo công việc ACMS) và **Chấm công** (hệ thống chấm công ACMS). Bấm vào một
ngày để xem danh sách ticket của ngày đó.

**Tab Đối chiếu chấm công** — bảng gọn riêng chỉ để soi 2 con số theo từng ngày
(Time dự án / Chấm công) và kết quả Khớp/Lệch, không lẫn danh sách ticket, Actual
Hours Backlog hay rule 8h/ngày. Có nút **Chỉ hiện ngày lệch** để lọc nhanh những
ngày cần sửa.

Tool lấy **tất cả loại ticket**, chỉ loại trừ **GTask** (ticket gộp/umbrella dùng để
tổng hợp nhiều ticket con — hours của nó là cộng dồn nên tính riêng sẽ bị trùng lặp).

### Rule được kiểm tra

1. `Start Date` = `Due Date` = `Actual End-date`
2. Nếu `Estimate Hours` = `Actual Hours` (làm đúng dự tính) thì không cần check gì thêm.
   Nếu khác nhau (hoặc chưa có Estimate) thì bắt buộc `Re-estimate hours` = `Actual Hours`
   — tức khi phát sinh chênh lệch, phải cập nhật lại số giờ ước tính cho khớp thực tế.
3. Mỗi ngày làm việc phải đủ **8h** (số giờ chuẩn đổi được trong Cài đặt)
4. Theo ngày: **Actual Hours (Backlog) = Time dự án (ACMS) = Chấm công (ACMS)** —
   chỉ áp dụng khi đã cấu hình ACMS token, xem [ACMS token](#acms-token-chấm-công--time-dự-án)

Ngày **nghỉ lễ** hoặc **nghỉ phép** (nghỉ nguyên lương) được bỏ qua toàn bộ rule 3 và 4
— không bắt đủ 8h, không đối chiếu 3 nguồn — chỉ note lại là "Nghỉ lễ" hoặc "Nghỉ phép"
thay vì báo lệch. Nghỉ không lương vẫn bị check bình thường. Xem thêm ở
[Nhận diện ngày nghỉ](#nhận-diện-ngày-nghỉ-từ-acms).

Ô nào lệch sẽ được tô nền đỏ và ghi rõ lý do ở cột `Rule` (ticket) hoặc cột
`Đối chiếu 3 nguồn` (ngày).

### Bảng màu theo ngày

| Màu | Ý nghĩa |
| --- | --- |
| 🟩 Xanh | Đủ 8h |
| 🟥 Đỏ | Thiếu giờ, ngày làm việc chưa log giờ nào, hoặc 3 nguồn lệch nhau |
| 🟨 Vàng | Dư giờ (> 8h) |
| ⬜ Xám | Thứ 7 / Chủ nhật |
| 🟦 Xanh dương | Nghỉ lễ / nghỉ phép (không check) |

## Chạy lần đầu

```bash
npm install
npm run dev
```

Mở http://localhost:3000 → hộp thoại **Cài đặt** tự hiện lên:

1. **Backlog domain** — ví dụ `amelainc.backlog.com` (gõ `amelainc` cũng được)
2. **API key cá nhân** — lấy tại Backlog → avatar → *Personal Settings* → *API* → *Register new API key*
3. Bấm **Kiểm tra kết nối** để chắc chắn key đúng, rồi **Lưu**

API key được lưu trong `localStorage` của trình duyệt từng người và chỉ đi qua
server của app để gọi thẳng sang Backlog — không ghi ra file, không nằm trên URL.

## Dùng cho cả team

Deploy một lần, cả team vào cùng một URL và **mỗi người tự nhập API key của mình**.
Ai nhìn thấy gì trên Backlog thì tool hiển thị đúng chừng đó, không ai mượn quyền của ai.

Điền sẵn domain để đồng đội khỏi phải gõ — tạo file `.env.local`:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_BACKLOG_DOMAIN=amelainc.backlog.com
```

Build và chạy production:

```bash
npm run build && npm start
```

### Trường hợp muốn dùng chung một key

Nếu chỉ chạy nội bộ một mình hoặc muốn cả team xài chung một tài khoản, đặt thêm
vào `.env.local`:

```env
BACKLOG_DOMAIN=amelainc.backlog.com
BACKLOG_API_KEY=<api key>
```

Khi đó app tự kết nối, không cần ai nhập gì. Key trong trình duyệt (nếu có) vẫn
được ưu tiên hơn key trong `.env`.

## Bộ lọc

- **Project** / **Người thực hiện** — chọn nhiều, để trống là lấy tất cả
- **Từ ngày / Đến ngày** — kèm nút nhanh *Tháng này*, *Tháng trước*, *7 ngày gần nhất*
- **Trạng thái** — Open / In Progress / Resolved / Closed
- **Hiện cả ngày không có ticket** — để lộ ra những ngày quên log
- **Tính cả T7/CN** — mặc định tắt
- **Chỉ ticket sai rule** — lọc nhanh danh sách cần sửa

Nút **Xuất CSV** xuất đúng bảng đang xem (kèm BOM nên mở bằng Excel không lỗi font).

## Custom field

`Re-estimate hours` và `Actual End-date` là **custom field**, mỗi project khai báo riêng.
Tool dò theo tên, bỏ qua khác biệt hoa thường / dấu cách / dấu gạch ngang.

Project **không** khai báo field thì cột hiện `n/a` và **không** bị tính là vi phạm —
tránh báo sai cho những project vốn dĩ không có field đó.

Nếu project của bạn đặt tên khác, sửa trong **Cài đặt → Tên custom field**.

## ACMS token (chấm công + time dự án)

Không bắt buộc — để trống thì bảng theo ngày vẫn chạy bình thường, chỉ bỏ qua
2 cột và rule đối chiếu 3 nguồn.

Cách lấy token của riêng bạn:

1. Mở `me.amela.vn`, đăng nhập
2. Mở DevTools (F12) → tab **Network**
3. Thao tác gì đó trên trang (VD: mở tab "Chấm công" hoặc "Báo cáo công việc")
4. Tìm một request gọi tới `me-presentation.amela.vn`, xem tab **Headers**
5. Copy giá trị header `Authorization`, bỏ chữ `Bearer ` ở đầu
6. Dán vào **Cài đặt → ACMS token**

Token là JWT nên khi dán vào, app tự giải mã ngay trong trình duyệt (không gọi
mạng) để hiện `user_id`, phòng ban và thời điểm hết hạn — báo động đỏ nếu token
đã hết hạn. Token Amela thường hết hạn sau vài tháng, hết hạn thì lấy lại theo
đúng các bước trên.

Cũng có thể đặt `ACMS_TOKEN` trong `.env.local` theo kiểu tự host một token
chung, tương tự `BACKLOG_API_KEY`.

### Nhận diện ngày nghỉ từ ACMS

API chấm công (`time-sheet`) không có field "nghỉ lễ" riêng, nên tool suy luận
từ các field sẵn có trên từng bản ghi trong ngày:

| Field | Kết luận |
| --- | --- |
| `paid_leave` có giá trị | **Nghỉ phép** |
| `unpaid_leave` có giá trị | Nghỉ không lương — **vẫn check bình thường** |
| Không `checkin`, không `checkout`, cũng không có `paid_leave`/`unpaid_leave` | **Nghỉ lễ** (suy đoán: cả công ty nghỉ nên không ai chấm công) |

Ngày rơi vào 2 trường hợp đầu (`Nghỉ phép`/`Nghỉ lễ`) sẽ được note lại đúng loại
thay vì báo "Thiếu giờ" hay "Lệch". Vì đây là suy luận qua field sẵn có (ACMS
không expose field xác nhận trực tiếp), nếu gặp ngày bị gắn nhãn sai, báo lại
để tinh chỉnh logic tại `detectLeaveType()` trong
[src/lib/acms.ts](src/lib/acms.ts).

## Cấu trúc mã nguồn

```
src/
  app/
    api/backlog/{me,projects,users,issues}/route.ts   Route handler gọi Backlog API
    api/acms/report/route.ts                          Route handler gọi ACMS API
    page.tsx
  components/
    ReportApp.tsx      Điều phối state, lọc, xuất CSV
    FilterBar.tsx      Bộ lọc
    DailyTable.tsx     Bảng theo ngày (bung ra xem ticket)
    TicketTable.tsx    Bảng theo ticket
    AttendanceCompareTable.tsx  Tab đối chiếu chấm công (gọn, không kèm ticket)
    SummaryCards.tsx   Thẻ tổng quan
    SettingsDialog.tsx Cấu hình kết nối
    MultiSelect.tsx
  lib/
    backlog.ts   Client gọi Backlog API (server-side, có phân trang)
    acms.ts      Client gọi ACMS API (server-side, giải mã user_id từ JWT)
    report.ts    Map issue → dòng báo cáo, kiểm tra rule, gom theo ngày
    settings.ts  Đọc/ghi cấu hình trong localStorage
    date.ts      Tiện ích ngày tháng
    csv.ts       Xuất CSV
```

## Ghi chú kỹ thuật

Backlog không lọc được theo custom field `Actual End-date`, và một ticket sai rule
có thể lệch giữa `startDate` và `dueDate`. Nên app truy vấn hai lần (theo `startDate`
và theo `dueDate`) với khoảng ngày nới rộng ±31 ngày, gộp kết quả rồi lọc chính xác
lại phía ứng dụng. Nếu vượt 2500 ticket, app hiện cảnh báo kết quả đã bị cắt bớt —
lúc đó nên thu hẹp khoảng ngày hoặc lọc theo người thực hiện.

Ngày dùng để gom nhóm là `Actual End-date`; thiếu thì lùi về `Due Date`, rồi `Start Date`.
