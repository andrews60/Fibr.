// Any component can call showToast(...) to pop up a message.
// <Toaster /> listens for these and draws them bottom-right.

export type ToastType = "sent" | "accepted" | "was-accepted" | "info";
export type ToastInput = { type: ToastType; title: string; body?: string };

export const TOAST_EVENT = "fibr:toast";
export const FRIENDS_CHANGED = "fibr:friends-changed";

export function showToast(toast: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: toast }));
}
