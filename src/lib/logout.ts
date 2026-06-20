// src/lib/logout.ts

export async function performLogout() {
    try {
      // 1. Отписываем устройство от пушей перед выходом
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        
        if (sub) {
          // Удаляем токен из базы
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {}); // игнорируем ошибку сети
          
          // Удаляем подписку в браузере
          await sub.unsubscribe();
        }
      }
  
      // 2. Делаем обычный логаут
      await fetch('/api/auth/logout', { method: 'POST' });
      
      // 3. Перенаправляем на страницу входа
      window.location.replace('/login');
    } catch (err) {
      console.error('Ошибка при выходе', err);
      window.location.replace('/login');
    }
  }