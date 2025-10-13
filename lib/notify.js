// lib/notify.js
export function notifyPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    return Notification.permission;
}

export async function requestNotifyPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    try {
        const p = await Notification.requestPermission();
        return p;
    } catch {
        return 'denied';
    }
}

export function sendNotification(title, options = {}) {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission !== 'granted') return false;

    // Safari/iOS: yêu cầu đang có 1 tab mở foreground hoặc PWA; đây là giới hạn trình duyệt.
    try {
        // dùng tag + renotify để tránh spam khi nhiều client cùng phát
        const opts = { silent: false, renotify: true, ...options };
        new Notification(title, opts);
        return true;
    } catch {
        return false;
    }
}
