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
let metricsTimer = null;
let metricsLoading = false;

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

function formatSeconds(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} s` : "—";
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function setMonitorStatus(message, kind = "") {
  const status = byId("monitorStatus");
  status.textContent = message;
  status.className = `monitor-status ${kind}`.trim();
}

function renderMetrics(data) {
  const recent = Array.isArray(data.recent_requests) ? data.recent_requests : [];
  const successful = recent.filter((item) => Number(item.status) < 400 && Number.isFinite(Number(item.request_s)));
  byId("mActive").textContent = String(Number(data.active_requests || 0));
  byId("mSlots").textContent = `${Number(data.processing_requests || 0)} / ${Number(data.max_inflight || 0)}`;
  byId("mWaiting").textContent = String(Number(data.waiting_requests || 0));
  byId("mTotal").textContent = String(Number(data.total_requests || 0));
  byId("mFailed").textContent = String(Number(data.failed_requests || 0));
  const p95 = percentile(successful.map((item) => Number(item.request_s)), 0.95);
  byId("mP95").textContent = p95 == null ? "—" : formatSeconds(p95);

  const rows = byId("requestRows");
  rows.replaceChildren();
  if (!recent.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.className = "empty-row";
    cell.textContent = "Chưa có request nào sau khi BE khởi động.";
    row.append(cell);
    rows.append(row);
    return;
  }

  for (const item of recent.slice(0, 30)) {
    const row = document.createElement("tr");
    const timestamp = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "—";
    const statusCode = Number(item.status || 0);
    const values = [
      timestamp,
      item.request_id || "—",
      statusCode ? `${statusCode} ${statusCode < 400 ? "OK" : "error"}` : "—",
      formatSeconds(item.audio_s),
      formatSeconds(item.queue_s),
      formatSeconds(item.inference_s),
      formatSeconds(item.request_s),
      Number.isFinite(Number(item.rtf)) ? Number(item.rtf).toFixed(3) : "—",
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      if (index === 2) cell.className = statusCode < 400 ? "ok" : "failed";
      row.append(cell);
    });
    rows.append(row);
  }
}

async function refreshMetrics() {
  if (metricsLoading) return;
  const token = tokenInput.value.trim();
  if (!token) {
    setMonitorStatus("Nhập access token để xem request.");
    return;
  }

  let base;
  try { base = normalizedBase(); }
  catch (error) { setMonitorStatus(error.message, "error"); return; }

  metricsLoading = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${base}/api/metrics`, {
      headers: { "X-ASR-Token": token },
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    renderMetrics(data);
    setMonitorStatus(`Đang cập nhật · ${new Date().toLocaleTimeString()}`, "live");
  } catch (error) {
    const message = error.name === "AbortError" ? "quá 8 giây không phản hồi" : error.message;
    setMonitorStatus(`Không tải được metrics · ${message}`, "error");
  } finally {
    clearTimeout(timeout);
    metricsLoading = false;
  }
}

function startMetricsPolling() {
  if (metricsTimer) clearInterval(metricsTimer);
  refreshMetrics();
  metricsTimer = setInterval(refreshMetrics, 2500);
}

apiBase.addEventListener("change", () => {
  try {
    const base = normalizedBase();
    localStorage.setItem("asr-api-base", base);
    checkBackend(base);
    startMetricsPolling();
  } catch (error) {
    byId("connectionState").textContent = error.message;
  }
});

tokenInput.addEventListener("change", () => {
  const token = tokenInput.value.trim();
  if (token) sessionStorage.setItem("asr-api-token", token);
  else sessionStorage.removeItem("asr-api-token");
  startMetricsPolling();
});
byId("refreshMetrics").addEventListener("click", refreshMetrics);

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
    refreshMetrics();
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

if (apiBase.value) {
  checkBackend(apiBase.value);
  startMetricsPolling();
}
