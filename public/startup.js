// Runs independently of the application bundle, including on a failed download.
(() => {
  window.supportosRecover = async () => {
    const cleanup = async () => {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.filter(registration => registration.scope === `${location.origin}/`).map(registration => registration.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => (key.startsWith("workbox-precache-") && key.endsWith(`${location.origin}/`)) || key === "supportos-assets-v1").map(key => caches.delete(key)));
      }
    };
    // Recovery must still work if a browser cache API is unavailable or hangs.
    await Promise.race([cleanup().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 2500))]);
    location.reload();
  };
  const showFailure = () => {
    const message = document.getElementById("startup-message");
    const action = document.getElementById("startup-retry");
    if (message) message.textContent = "Не удалось загрузить приложение. Проверьте соединение и повторите попытку.";
    if (action) action.hidden = false;
  };
  document.getElementById("startup-retry")?.addEventListener("click", () => void window.supportosRecover());
  window.addEventListener("error", showFailure, true);
  window.addEventListener("unhandledrejection", showFailure);
  setTimeout(showFailure, 15000);
})();
