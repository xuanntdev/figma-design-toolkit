// Môi trường chụp, đọc từ biến môi trường (không phụ thuộc repo nào khác):
//   CAPTURE_BASE_URL       URL gốc của web cần chụp. Bỏ trống = tự chạy trang mẫu capture/sample-site (nhóm `sample`).
//   CAPTURE_STORAGE_STATE  (tuỳ chọn) tệp storageState của Playwright (cookie/localStorage đã đăng nhập) để chụp màn sau đăng nhập.
//   CAPTURE_LOCALE / CAPTURE_TIMEZONE  (tuỳ chọn) mặc định vi-VN / Asia/Ho_Chi_Minh.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startSampleServer } from './sample-server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KIT_ROOT = path.resolve(HERE, '../..');

export async function loadEnv() {
  let baseUrl = process.env.CAPTURE_BASE_URL;
  let stop = async () => {};
  if (!baseUrl) {
    const server = await startSampleServer();
    baseUrl = server.url;
    stop = server.close;
  }
  const storageState = process.env.CAPTURE_STORAGE_STATE || undefined;
  if (storageState && !fs.existsSync(storageState)) throw new Error(`Không thấy CAPTURE_STORAGE_STATE: ${storageState}`);
  return {
    baseUrl, storageState, stop,
    locale: process.env.CAPTURE_LOCALE || 'vi-VN',
    timezone: process.env.CAPTURE_TIMEZONE || 'Asia/Ho_Chi_Minh',
  };
}

/** Tuỳ chọn kênh trình duyệt cho chromium.launch: mặc định Chrome cài sẵn; CAPTURE_CHANNEL="" dùng Chromium của Playwright. */
export function channelOption() {
  const channel = process.env.CAPTURE_CHANNEL ?? 'chrome';
  return channel ? { channel } : {};
}
