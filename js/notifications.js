import { escapeHtml, uid } from "./utils.js";

export function toast(message, options = {}) {
  const { type = "info", actionLabel = "", onAction = null, duration = 4500 } = options;
  const region = document.getElementById("toast-region");
  if (!region) return;
  const id = uid("toast");
  const element = document.createElement("div");
  element.className = "toast";
  element.dataset.type = type;
  element.id = id;
  element.setAttribute("role", type === "error" ? "alert" : "status");
  element.innerHTML = `
    <span>${escapeHtml(message)}</span>
    ${actionLabel ? `<button class="button button-small button-secondary" type="button">${escapeHtml(actionLabel)}</button>` : ""}
  `;
  region.append(element);
  const remove = () => element.remove();
  if (actionLabel) {
    element.querySelector("button")?.addEventListener("click", () => {
      onAction?.();
      remove();
    }, { once: true });
  }
  setTimeout(remove, duration);
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    return { state: "unsupported", message: "Browser notifications are not supported." };
  }
  if (Notification.permission === "granted") return { state: "granted" };
  if (Notification.permission === "denied") return { state: "denied", message: "Notifications are blocked in browser settings." };
  const result = await Notification.requestPermission();
  return { state: result };
}

export function showLocalNotification(title, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  new Notification(title, {
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    ...options
  });
  return true;
}
