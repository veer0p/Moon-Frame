import { useCallback } from 'react';
import { create } from 'zustand';

// Notification store using Zustand
const useNotificationStore = create((set) => ({
    notifications: [],
    addNotification: (notification) => set((state) => ({
        notifications: [...state.notifications, notification]
    })),
    removeNotification: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
    })),
    clearAll: () => set({ notifications: [] })
}));

export const useNotifications = () => {
    const { notifications, addNotification, removeNotification, clearAll } = useNotificationStore();

    const showNotification = useCallback((message, type = 'info', duration = 3000) => {
        const id = Date.now() + Math.random();
        const notification = {
            id,
            message,
            type, // 'success', 'error', 'warning', 'info'
            duration,
            createdAt: Date.now()
        };

        // Add to store - we need to modify the store action to accept the full object or just pass the ID
        // But simpler is to just update the store action to accept an ID or generate it there.
        // Let's modify the store action in a separate edit, or just pass the ID here if we change the store.
        // Actually, let's just generate ID here and pass it to addNotification.

        addNotification(notification);

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                removeNotification(id);
            }, duration);
        }

        return id;
    }, [addNotification, removeNotification]);

    const success = useCallback((message, duration) => {
        return showNotification(message, 'success', duration);
    }, [showNotification]);

    const error = useCallback((message, duration) => {
        return showNotification(message, 'error', duration);
    }, [showNotification]);

    const warning = useCallback((message, duration) => {
        return showNotification(message, 'warning', duration);
    }, [showNotification]);

    const info = useCallback((message, duration) => {
        return showNotification(message, 'info', duration);
    }, [showNotification]);

    return {
        notifications,
        showNotification,
        success,
        error,
        warning,
        info,
        removeNotification,
        clearAll
    };
};
