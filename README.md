# Trợ lý Lịch họp — bản web (GitHub Pages)

Bản web **đọc-only** của app nội bộ "Trợ lý Lịch họp": xem lịch tuần của ban lãnh đạo
và tìm khung giờ họp trống (kèm phòng trống / phòng có cầu truyền hình).

🔒 **Dữ liệu được mã hoá**: file `docs/data/snapshot.json.enc` là JSON mã hoá
AES-256-GCM (khóa suy xuất PBKDF2-HMAC-SHA256, 150.000 vòng). **Mật khẩu không nằm
trên GitHub** — chỉ người có mật khẩu (đặt trong app nội bộ khi bấm *Lên GitHub*)
mở được. Trang giải mã ngay trong trình duyệt (Web Crypto), không gửi mật khẩu đi đâu.

## Cách dùng
1. Mở app nội bộ → bấm **⬆ Lên GitHub** → nhập mật khẩu web (lần đầu bạn tự đặt).
2. App tổng hợp lịch (cache), mã hoá, đẩy lên repo này (1 commit).
3. Mở https://hntna.github.io/lich-hop/ → nhập mật khẩu → dùng như app (chế độ xem).

Cập nhật mới chỉ có sau khi bấm đẩy lại trong app (trang không gọi bot trực tiếp).

## Cấu trúc
```
docs/
  index.html   # khung trang (cửa mật khẩu + 2 tab)
  style.css
  app.js       # giải mã AES-GCM + render lịch + tìm khung giờ
  data/snapshot.json.enc   # snapshot mã hoá (do app đẩy lên)
```
