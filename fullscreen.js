(function () {
  var ACCESS_CODE = 'TEAM2026';

  function requestCode(actionLabel) {
    var entered = window.prompt('Enter access code to ' + actionLabel + ':');
    if (entered === ACCESS_CODE) {
      return true;
    }
    window.alert('Incorrect code. Action cancelled.');
    return false;
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
      if (!requestCode('toggle full screen')) {
        return;
      }
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

  window.topicTableAccessGuard = {
    requestCode: requestCode
  };

  // Capture clicks globally so every Back to Home and hologram fullscreen click is protected.
  document.addEventListener('click', function (event) {
    var backHomeLink = event.target.closest('[data-back-home]');
    if (backHomeLink) {
      if (!requestCode('go back to home')) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      return;
    }

    var hologramFullscreenButton = event.target.closest('#fullscreenBtn');
    if (hologramFullscreenButton) {
      if (!requestCode('toggle full screen')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createButton);
  } else {
    createButton();
  }
})();