type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

type ToastListener = (toast: Toast) => void;
const listeners = new Set<ToastListener>();

export const toast = {
  show(message: string, type: ToastType = 'info', duration: number = 4000) {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, message, type, duration };
    listeners.forEach(l => l(newToast));
    return id;
  },
  success(message: string, duration?: number) {
    return this.show(message, 'success', duration);
  },
  error(message: string, duration?: number) {
    return this.show(message, 'error', duration);
  },
  info(message: string, duration?: number) {
    return this.show(message, 'info', duration);
  },
  warning(message: string, duration?: number) {
    return this.show(message, 'warning', duration);
  },
  subscribe(listener: ToastListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
