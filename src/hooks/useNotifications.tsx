import { useSettings } from './useSettings';

export const useNotifications = () => {
  const { requestNotifications, pushNotifications } = useSettings();

  const showNotification = (title: string, options?: NotificationOptions) => {
    // Only show notifications if enabled and supported
    if (!requestNotifications || !('Notification' in window)) {
      return;
    }

    // Check if user has granted permission
    if (Notification.permission === 'granted' && pushNotifications) {
      new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options,
      });
    }
  };

  const showRequestCompleteNotification = (videoTitle?: string) => {
    showNotification('YouTube Summary Complete', {
      body: videoTitle 
        ? `Your summary for "${videoTitle}" is ready!`
        : 'Your YouTube summary is ready!',
      tag: 'request-complete',
    });
  };

  return {
    showNotification,
    showRequestCompleteNotification,
  };
};