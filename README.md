# Test ASR — Frontend

Giao diện HTML/CSS/JavaScript tĩnh để gửi audio tới backend ASR, xem transcript, đo thời gian và theo dõi request/CCU. Không cần Node.js, package install hoặc lệnh build.

## Chạy FE trên máy local

~~~bash
git clone https://github.com/pot030321/fe_test_asr.git
cd fe_test_asr
python3 -m http.server 8000 --bind 127.0.0.1
~~~

Mở **http://127.0.0.1:8000**. Chạy backend riêng theo hướng dẫn trong repo [be_test_asr](https://github.com/pot030321/be_test_asr). Với backend cùng máy, nhập:

- Backend API URL: **http://127.0.0.1:8767**
- Access token: giá trị **ASR_API_TOKEN** do người chạy BE tạo

Chọn audio hoặc ghi âm, chọn tự nhận diện/tiếng Việt/English, rồi bấm Chạy nhận dạng. Giao diện hỗ trợ file tối đa 100 MB. Ghi âm được gửi sau khi nhấn Dừng ghi; đây là nhận dạng trên audio hoàn chỉnh, không hiển thị transcript streaming từng phần.

Nếu chạy FE và BE ở hai máy khác nhau, nhập địa chỉ BE mà trình duyệt có thể truy cập và cấu hình origin FE trong CORS ở BE. Nếu dùng **localhost** thay **127.0.0.1**, hoặc đổi port 8000, origin cũng phải đổi tương ứng. Microphone cần secure context: HTTPS hoặc localhost.

## Triển khai trên Vercel

1. Import repo **pot030321/fe_test_asr** vào Vercel.
2. Chọn framework preset **Other**. Để trống build command; phục vụ các file tĩnh ở thư mục gốc repo.
3. Deploy, sau đó nhập HTTPS origin của BE và access token trên trang.

FE gọi trực tiếp từ trình duyệt tới **GET /healthz**, **POST /api/transcribe** và **GET /api/metrics**. BE cần có HTTPS URL truy cập được từ trình duyệt hoặc mạng VPN tương ứng; Vercel không thể gọi IP private của server thay mặt browser. CORS BE phải cho phép origin Vercel đã deploy.

## Token, audio và chỉ số

- Backend URL được lưu trong local storage của trình duyệt.
- Token chỉ lưu trong session storage của tab hiện tại. Không đưa token vào source code hoặc biến Vercel public.
- Audio được gửi trực tiếp từ browser tới BE để nhận dạng; FE không tải audio lên dịch vụ trung gian.
- RTF là thời gian inference chia cho thời lượng audio; không gồm queue hoặc upload/mạng. Client E2E gồm upload và phản hồi mạng.
- Request monitor đọc metrics từ BE mỗi 2.5 giây. Lịch sử hiển thị đến từ RAM của BE và reset khi BE restart.

## Xử lý lỗi

- Không kết nối: kiểm tra Backend API URL, trạng thái BE và HTTPS/VPN nếu BE ở máy khác.
- HTTP 401: nhập token đúng với cấu hình BE.
- Lỗi CORS: thêm origin chính xác của FE vào **ASR_ALLOWED_ORIGINS** trên BE rồi restart BE.
- Microphone không mở: dùng HTTPS hoặc localhost và cấp quyền microphone cho trình duyệt.
