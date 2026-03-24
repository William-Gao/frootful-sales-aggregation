// Remove all header buttons/controls except the logo
(function () {
  function hideHeaderControls() {
    const header = document.querySelector('header');
    if (!header) return;

    // Hide all buttons, links, labels, inputs, and svgs in the header
    header.querySelectorAll('button, a, label, input, svg').forEach(function (el) {
      el.style.display = 'none';
    });

    // But keep the logo image visible
    header.querySelectorAll('img').forEach(function (img) {
      img.style.display = '';
      // Also make sure the logo's parent link is visible
      var parent = img.closest('a');
      if (parent) parent.style.display = '';
    });
  }

  // Run immediately and keep checking for a bit (Chainlit renders async)
  hideHeaderControls();
  var attempts = 0;
  var interval = setInterval(function () {
    hideHeaderControls();
    attempts++;
    if (attempts > 20) clearInterval(interval);
  }, 200);

  // Also observe DOM changes to catch any re-renders
  var observer = new MutationObserver(function () {
    hideHeaderControls();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
