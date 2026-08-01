(function () {
  function requestFullscreenAccess() {
    if (window.topicTableAuth && typeof window.topicTableAuth.requestAccess === 'function') {
      return window.topicTableAuth.requestAccess({
        message: 'Enter the team code to enter or exit full screen.',
        errorMessage: 'Incorrect code. Full screen access denied.'
      });
    }

    return Promise.resolve(false);
  }

  function getLabel() {
    return document.fullscreenElement ? 'Exit Full Screen' : 'Full Screen';
  }

  async function toggleFullScreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    var target = document.documentElement || document.body;
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    }
  }

  function createButton() {
    if (document.body && document.body.dataset && document.body.dataset.disableSiteFullscreen === 'true') {
      return;
    }

    if (document.getElementById('siteFullscreenToggle')) {
      return;
    }

    var button = document.createElement('button');
    button.id = 'siteFullscreenToggle';
    button.type = 'button';
    button.className = 'btn btn-secondary small fullscreen-toggle-btn';
    button.setAttribute('data-tts-ignore', 'true');
    button.textContent = getLabel();

    button.addEventListener('click', function () {
      toggleFullScreen().catch(function () {
        // Ignore fullscreen permission or browser support failures.
      });
    });

    document.body.appendChild(button);

    function syncLabel() {
      button.textContent = getLabel();
    }

    document.addEventListener('fullscreenchange', syncLabel);
    syncLabel();
  }

  window.topicTableFullscreen = {
    toggle: toggleFullScreen
  };

  // Capture clicks so fullscreen actions are protected once per click.
  document.addEventListener('click', function (event) {
    var fullscreenControl = event.target.closest('#fullscreenBtn, #siteFullscreenToggle');
    if (!fullscreenControl) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    requestFullscreenAccess().then(function (isAllowed) {
      if (!isAllowed) {
        return;
      }

      toggleFullScreen().catch(function () {
        // Ignore fullscreen permission or browser support failures.
      });
    });
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();