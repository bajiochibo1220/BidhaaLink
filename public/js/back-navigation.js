// Keep back controls useful when a page is opened from a feed, a shop,
// or a direct link. The anchor's href remains the reliable fallback.
(function () {
  document.addEventListener('click', function (event) {
    const link = event.target.closest('a[data-context-back]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    let previous;
    try {
      previous = new URL(document.referrer);
    } catch (_) {
      return;
    }

    if (previous.origin !== window.location.origin || previous.href === window.location.href || window.history.length < 2) return;
    event.preventDefault();
    window.history.back();
  });
})();
