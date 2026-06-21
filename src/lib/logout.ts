// src/lib/logout.ts

export async function performLogout() {
  // 1. Запускаем отписку от пушей в фоне (не блокируем выполнение функции через await)
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
    // Оборачиваем в анонимную функцию, чтобы не ждать завершения
    (async () => {
      try {
        // getRegistration() не зависает навечно, в отличие от .ready
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.pushManager) {
          const sub = await reg.pushManager.getSubscription();
          
          if (sub) {
            await fetch('/api/push/subscribe', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: sub.endpoint }),
            }).catch(() => {}); // Игнорируем ошибки сети
            
            await sub.unsubscribe();
          }
        }
      } catch (err) {
        console.warn('[Logout] Не удалось отписаться от пушей:', err);
      }
    })();
  }

  // 2. Гарантированно выполняем сам логаут
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Ошибка сервера при выходе', err);
  } finally {
    // 3. В любом случае перекидываем пользователя на страницу входа
    window.location.replace('/login');
  }
}