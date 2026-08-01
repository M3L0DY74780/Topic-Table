(function () {
  async function setEscapeProtection(enabled) {
    try {
      if (enabled) {
        if (navigator.keyboard && typeof navigator.keyboard.lock === 'function') {
          await navigator.keyboard.lock(['Escape']);
        }
        return;
      }

      if (navigator.keyboard && typeof navigator.keyboard.unlock === 'function') {
        navigator.keyboard.unlock();
      }
    } catch (error) {
      // Ignore unsupported keyboard lock APIs.
    }
  }

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
      await setEscapeProtection(true);
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
      requestFullscreenAccess().then(function (isAllowed) {
        if (!isAllowed) {
          return;
        }

        toggleFullScreen().catch(function () {
          // Ignore fullscreen permission or browser support failures.
        });
      });
    });

    document.body.appendChild(button);

    function syncLabel() {
      button.textContent = getLabel();
      setEscapeProtection(!!document.fullscreenElement);
    }

    document.addEventListener('fullscreenchange', syncLabel);
    syncLabel();
  }

  document.addEventListener('keydown', function (event) {
    if (!document.fullscreenElement) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.topicTableFullscreen = {
    toggle: toggleFullScreen
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();