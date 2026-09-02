export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function uid(prefix = "item") {
  const value = globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${value}`;
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

export function safeUrl(value = "") {
  try {
    const url = new URL(value, location.origin);
    return ["http:", "https:", "tel:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function formatDate(value, locale = "en-IN", options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatTime(value, locale = "en-IN") {
  if (!value) return "";
  const [hours = "0", minutes = "0"] = String(value).split(":");
  const h = Number(hours);
  const m = Number(minutes);
  if (Number.isNaN(h) || Number.isNaN(m)) return String(value);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsText(file);
  });
}

export function debounce(callback, delay = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

export function todayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

export function isValidPhone(phone) {
  return !phone || /^[+\d][\d\s()-]{5,20}$/.test(phone);
}

export function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

export async function compressImage(source, maxDimension = 800, quality = 0.82) {
  if (!source) return "";
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Image compression failed. Use a valid JPEG, PNG, or WebP image."));
    if (typeof source === "string") {
      img.src = source;
    } else if (source instanceof Blob || source instanceof File) {
      const reader = new FileReader();
      reader.onload = () => { img.src = String(reader.result); };
      reader.onerror = () => reject(new Error("Could not read image file."));
      reader.readAsDataURL(source);
    } else if (source instanceof HTMLCanvasElement) {
      resolve(source.toDataURL("image/jpeg", quality));
    } else {
      resolve("");
    }
  });
}

export function analyzePhotoQuality(canvasOrImg) {
  try {
    let canvas = canvasOrImg;
    if (canvasOrImg instanceof HTMLImageElement) {
      canvas = document.createElement("canvas");
      canvas.width = Math.min(canvasOrImg.naturalWidth || 300, 300);
      canvas.height = Math.min(canvasOrImg.naturalHeight || 300, 300);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(canvasOrImg, 0, 0, canvas.width, canvas.height);
    }
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    let totalLuminance = 0;
    let minLum = 255;
    let maxLum = 0;
    const pixelCount = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }
    const avgLuminance = totalLuminance / pixelCount;
    const contrast = maxLum - minLum;
    if (avgLuminance < 45) {
      return { isFine: false, status: "dark", message: "Photo is too dark. Take photo in a brighter area." };
    }
    if (avgLuminance > 220) {
      return { isFine: false, status: "bright", message: "Photo is washed out or overexposed. Reduce lighting." };
    }
    if (contrast < 40) {
      return { isFine: false, status: "blurry", message: "Photo lacks contrast or detail. Hold camera still and retake." };
    }
    return { isFine: true, status: "fine", message: "Photo quality looks great!" };
  } catch {
    return { isFine: true, status: "unknown", message: "Photo loaded successfully." };
  }
}

