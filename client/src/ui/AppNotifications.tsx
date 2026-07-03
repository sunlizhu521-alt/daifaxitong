import { useEffect, useState } from "react";

type NotificationVariant = "success" | "error";

type NotificationDetail = {
  variant: NotificationVariant;
  message: string;
};

type NotificationItem = NotificationDetail & {
  id: number;
};

const NOTIFICATION_EVENT = "app:notification";

export function notifyApp(detail: NotificationDetail) {
  window.dispatchEvent(new CustomEvent<NotificationDetail>(NOTIFICATION_EVENT, { detail }));
}

export function AppNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    function handleNotify(event: Event) {
      const detail = (event as CustomEvent<NotificationDetail>).detail;
      if (!detail?.message) return;
      const id = Date.now() + Math.random();
      setItems((current) => [...current, { ...detail, id }].slice(-4));
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 3600);
    }

    window.addEventListener(NOTIFICATION_EVENT, handleNotify);
    return () => window.removeEventListener(NOTIFICATION_EVENT, handleNotify);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="notification-stack" role="status" aria-live="polite">
      {items.map((item) => (
        <div className={`notification-toast ${item.variant}`} key={item.id}>
          <strong>{item.variant === "success" ? "成功" : "失败"}</strong>
          <span>{item.message}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
