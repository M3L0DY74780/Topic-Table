(function () {
  const TEAM_ACCESS_CODE = 'TEAM2026';

  function goToHomePage() {
    window.location.assign('./index.html');
  }

  function createAccessModal(options) {
    const settings = options || {};
    const actionMessage = settings.message || 'Enter the team code to continue.';
    const modalHost = document.fullscreenElement || document.body;

    const overlay = document.createElement('div');
    overlay.id = 'team-access-modal';
    overlay.setAttribute('data-tts-ignore', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(3, 8, 20, 0.78)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';

    const panel = document.createElement('div');
    panel.style.width = 'min(92vw, 360px)';
    panel.style.background = '#11223b';
    panel.style.border = '1px solid rgba(255,255,255,0.16)';
    panel.style.borderRadius = '18px';
    panel.style.padding = '22px';
    panel.style.boxShadow = '0 20px 60px rgba(0,0,0,0.35)';

    const title = document.createElement('h3');
    title.textContent = 'Team Access Required';
    title.style.margin = '0 0 8px';

    const message = document.createElement('p');
    message.textContent = actionMessage;
    message.style.margin = '0 0 14px';
    message.style.color = '#b8c6db';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter code';
    input.style.width = '100%';
    input.style.padding = '10px 12px';
    input.style.borderRadius = '10px';
    input.style.border = '1px solid rgba(255,255,255,0.16)';
    input.style.background = '#07111f';
    input.style.color = '#f5f7fa';
    input.style.marginBottom = '10px';

    const error = document.createElement('p');
    error.style.minHeight = '20px';
    error.style.margin = '0 0 12px';
    error.style.color = '#fda4af';

    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.justifyContent = 'flex-end';
    buttons.style.gap = '10px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.type = 'button';
    cancelBtn.style.padding = '10px 14px';
    cancelBtn.style.borderRadius = '10px';
    cancelBtn.style.border = '1px solid rgba(255,255,255,0.14)';
    cancelBtn.style.background = 'transparent';
    cancelBtn.style.color = '#f5f7fa';
    cancelBtn.style.cursor = 'pointer';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Continue';
    confirmBtn.type = 'button';
    confirmBtn.style.padding = '10px 14px';
    confirmBtn.style.borderRadius = '10px';
    confirmBtn.style.border = 'none';
    confirmBtn.style.background = 'linear-gradient(90deg, #5eead4, #60a5fa)';
    confirmBtn.style.color = '#041320';
    confirmBtn.style.cursor = 'pointer';
    confirmBtn.style.fontWeight = '700';

    function closeModal() {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }

    cancelBtn.addEventListener('click', function () {
      closeModal();
      if (settings.onResult) {
        settings.onResult(false);
      }
    });

    confirmBtn.addEventListener('click', function () {
      if (input.value.trim().toUpperCase() === TEAM_ACCESS_CODE) {
        closeModal();
        if (settings.onResult) {
          settings.onResult(true);
        }
      } else {
        error.textContent = settings.errorMessage || 'Incorrect code. Access denied.';
      }
    });

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        closeModal();
        if (settings.onResult) {
          settings.onResult(false);
        }
      }
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);

    panel.appendChild(title);
    panel.appendChild(message);
    panel.appendChild(input);
    panel.appendChild(error);
    panel.appendChild(buttons);
    overlay.appendChild(panel);
    modalHost.appendChild(overlay);

    setTimeout(function () {
      input.focus();
    }, 0);
  }

  function requestTeamAccess(options) {
    return new Promise(function (resolve) {
      createAccessModal({
        message: options && options.message,
        errorMessage: options && options.errorMessage,
        onResult: resolve
      });
    });
  }

  function handleBackHome(event) {
    event.preventDefault();
    requestTeamAccess({
      message: 'Enter the team code to return to the topic table homepage.',
      errorMessage: 'Incorrect code. Only the team can return to the homepage.'
    }).then(function (isAllowed) {
      if (isAllowed) {
        goToHomePage();
      }
    });
  }

  window.topicTableAuth = {
    requestAccess: requestTeamAccess
  };

  window.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-back-home]').forEach(function (link) {
      link.addEventListener('click', handleBackHome);
    });
  });
})();
