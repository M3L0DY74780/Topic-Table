(function () {
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();