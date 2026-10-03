(function () {
  const promptBox = document.getElementById('pwaInstallPrompt');
  if (!promptBox) return;

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
        .catch((error) => console.warn('BidhaaLink offline support could not start:', error));
    });
  }

  const installButton = document.getElementById('pwaInstallButton');
  const dismissButton = document.getElementById('pwaInstallDismiss');
  const message = document.getElementById('pwaInstallMessage');
  const storageKey = 'bidhaalink-install-prompt-dismissed';
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const isAppleMobile = /iPhone|iPad|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

  if (standalone || sessionStorage.getItem(storageKey) === '1') return;

  let deferredInstallPrompt = null;

  function showPrompt() {
    promptBox.hidden = false;
  }

  function hidePrompt() {
    promptBox.hidden = true;
  }

  if (isAppleMobile) {
    if (message) message.textContent = 'In Safari, tap Share, then choose Add to Home Screen.';
    if (installButton) installButton.hidden = true;
    showPrompt();
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installButton) installButton.hidden = false;
    if (message) message.textContent = 'Add BidhaaLink to your home screen or apps.';
    showPrompt();
  });

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      hidePrompt();
    });
  }

  if (dismissButton) {
    dismissButton.addEventListener('click', () => {
      sessionStorage.setItem(storageKey, '1');
      hidePrompt();
    });
  }

  window.addEventListener('appinstalled', hidePrompt);
})();
