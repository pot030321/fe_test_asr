const byId = (id) => document.getElementById(id);
const apiBase = byId("apiBase");
const tokenInput = byId("token");
const audioInput = byId("audio");
const statusEl = byId("status");
let selectedAudio = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let previewUrl = null;

apiBase.value = localStorage.getItem("asr-api-base") || "";
tokenInput.value = sessionStorage.getItem("asr-api-token") || "";

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
}

function normalizedBase() {
  const value = apiBase.value.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Nhập Backend API URL trước.");
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Backend URL phải bắt đầu bằng http:// hoặc https://.");
  return value;
}

function setAudio(file) {
  selectedAudio = file;
  if (!file) return;
  byId("fileHint").textContent = `${file.name} · ${(file.size / 1048576).toFixed(2)} MB`;
  byId("preview").hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  byId("preview").src = previewUrl;
  byId("preview").hidden = false;
  setStatus("Audio đã sẵn sàng.");
}

async function checkBackend(base) {
  byId("connectionState").textContent = "Đang kiểm tra backend…";
  try {
    const response = await fetch(`${base}/healthz`, { method: "GET", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    byId("connectionState").textContent = `Backend sẵn sàng · ${data.model || "ASR API"}`;
  } catch (error) {
    byId("connectionState").textContent = `Chưa kết nối được · ${error.message}`;
  }
}

apiBase.addEventListener("change", () => {
  try {
    const base = normalizedBase();
    localStorage.setItem("asr-api-base", base);
    checkBackend(base);
  } catch (error) {
    byId("connectionState").textContent = error.message;
  }
});

audioInput.addEventListener("change", () => setAudio(audioInput.files?.[0] || null));

byId("recordStart").addEventListener("click", async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error("Trình duyệt chưa hỗ trợ ghi âm. Hãy chọn file audio.");
    }
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" } : {};
    mediaRecorder = new MediaRecorder(mediaStream, options);
    recordedChunks = [];
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) recordedChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", () => {
      const type = mediaRecorder.mimeType || "audio/webm";
      const extension = type.includes("ogg") ? "ogg" : "webm";
      setAudio(new File(recordedChunks, `recording-${Date.now()}.${extension}`, { type }));
      mediaStream?.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }, { once: true });
    mediaRecorder.start();
    byId("recordStart").disabled = true;
    byId("recordStop").disabled = false;
    byId("recordState").textContent = "Đang ghi âm… bấm Dừng ghi để gửi lên nhận dạng.";
    setStatus("Đang ghi âm từ microphone.");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

byId("recordStop").addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  byId("recordStart").disabled = false;
  byId("recordStop").disabled = true;
  byId("recordState").textContent = "Bản ghi đã sẵn sàng để gửi.";
});

byId("transcribe").addEventListener("click", async () => {
  if (!selectedAudio) return setStatus("Chọn file hoặc ghi âm trước.", "error");
  if (selectedAudio.size > 100 * 1024 * 1024) return setStatus("File vượt giới hạn 100 MB.", "error");
  const token = tokenInput.value.trim();
  if (!token) return setStatus("Nhập access token do người quản lý backend cấp.", "error");

  let base;
  try { base = normalizedBase(); }
  catch (error) { return setStatus(error.message, "error"); }

  localStorage.setItem("asr-api-base", base);
  sessionStorage.setItem("asr-api-token", token);
  const form = new FormData();
  form.append("file", selectedAudio, selectedAudio.name);
  form.append("language", byId("language").value);

  const button = byId("transcribe");
  button.disabled = true;
  button.firstElementChild.textContent = "Đang upload và nhận dạng…";
  setStatus("Đang gửi audio tới backend.");
  const started = performance.now();
  try {
    const response = await fetch(`${base}/api/transcribe`, {
      method: "POST",
      headers: { "X-ASR-Token": token },
      body: form,
      cache: "no-store",
    });
    const clientE2e = (performance.now() - started) / 1000;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Request thất bại (HTTP ${response.status}).`);

    byId("transcript").value = data.text || "";
    byId("mAudio").textContent = `${Number(data.audio_s || 0).toFixed(2)} s`;
    byId("mInference").textContent = `${Number(data.inference_s || 0).toFixed(2)} s`;
    byId("mServer").textContent = `${Number(data.request_s || 0).toFixed(2)} s`;
    byId("mE2e").textContent = `${clientE2e.toFixed(2)} s`;
    byId("mQueue").textContent = `${Number(data.queue_s || 0).toFixed(2)} s`;
    byId("mRtf").textContent = Number(data.rtf || 0).toFixed(3);
    const confidence = data.language_probability == null
      ? "" : ` · độ tin cậy ${(Number(data.language_probability) * 100).toFixed(1)}%`;
    byId("detected").textContent = `Ngôn ngữ: ${data.language_name || data.language || "—"}${confidence} · file ${(Number(data.size_mb || 0)).toFixed(2)} MB`;
    setStatus("Nhận dạng hoàn tất.", "success");
    byId("connectionState").textContent = `Backend sẵn sàng · request ID ${data.request_id || "đã xử lý"}`;
  } catch (error) {
    setStatus(`${error.message} Nếu báo lỗi CORS, kiểm tra ASR_ALLOWED_ORIGIN_REGEX ở backend.`, "error");
  } finally {
    button.disabled = false;
    button.firstElementChild.textContent = "Chạy nhận dạng";
  }
});

byId("copy").addEventListener("click", async () => {
  const text = byId("transcript").value;
  if (!text) return;
  try { await navigator.clipboard.writeText(text); setStatus("Đã copy transcript.", "success"); }
  catch { setStatus("Không thể copy trong trình duyệt này.", "error"); }
});

byId("download").addEventListener("click", () => {
  const text = byId("transcript").value;
  if (!text) return;
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "asr-transcript.txt";
  link.click();
  URL.revokeObjectURL(url);
});

if (apiBase.value) checkBackend(apiBase.value);
