(function () {
  var isSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  var autoReadKey = 'topicTableTtsAutoRead';
  var rateKey = 'topicTableTtsRate';

  var state = {
    autoRead: false,
    rate: 1,
    lastAnnouncement: '',
    lastAnnouncementAt: 0
  };

  function getPreferredLanguage() {
    try {
      return localStorage.getItem('topicTableLanguage') || document.documentElement.lang || 'en';
    } catch (error) {
      return document.documentElement.lang || 'en';
    }
  }

  function normalizeLanguageForVoice(languageCode) {
    var code = (languageCode || 'en').toLowerCase();
    if (code === 'zh-cn') {
      return 'zh-CN';
    }
    if (code === 'zh-tw') {
      return 'zh-TW';
    }
    return languageCode || 'en';
  }

  function getRate() {
    var rate = Number(state.rate);
    if (!Number.isFinite(rate) || rate < 0.5 || rate > 2) {
      return 1;
    }
    return rate;
  }

  function getVisibleRoot() {
    return document.querySelector('main') || document.querySelector('.page') || document.body;
  }

  function isElementVisible(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return false;
    }

    if (element.closest('[data-tts-ignore], script, style, noscript, template, iframe, .hidden, .google-translate-element, #languageSelectorContainer, #ttsControlContainer')) {
      return false;
    }

    var style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    return true;
  }

  function collectReadableText() {
    var root = getVisibleRoot();
    if (!root) {
      return '';
    }

    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node || !node.parentElement) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!isElementVisible(node.parentElement)) {
          return NodeFilter.FILTER_REJECT;
        }
        var text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      var textValue = (walker.currentNode.textContent || '').replace(/\s+/g, ' ').trim();
      if (textValue) {
        nodes.push(textValue);
      }
      if (nodes.join('. ').length > 1800) {
        break;
      }
    }

    return nodes.join('. ');
  }

  function updateStatus(text) {
    var status = document.getElementById('ttsStatusText');
    if (status) {
      status.textContent = text;
    }
  }

  function chooseVoice(languageCode) {
    var voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) {
      return null;
    }

    var normalized = (normalizeLanguageForVoice(languageCode) || 'en').toLowerCase();
    var base = normalized.split('-')[0];

    var exact = voices.find(function (voice) {
      return (voice.lang || '').toLowerCase() === normalized;
    });
    if (exact) {
      return exact;
    }

    var family = voices.find(function (voice) {
      return (voice.lang || '').toLowerCase().indexOf(base) === 0;
    });
    if (family) {
      return family;
    }

    return voices[0];
  }

  function speak(text, options) {
    if (!isSupported) {
      updateStatus('Text-to-speech is not supported in this browser.');
      return;
    }

    var message = String(text || '').replace(/\s+/g, ' ').trim();
    if (!message) {
      updateStatus('No readable text found.');
      return;
    }

    var settings = options || {};
    if (settings.interrupt !== false) {
      window.speechSynthesis.cancel();
    }

    var utterance = new window.SpeechSynthesisUtterance(message);
    var lang = settings.lang || getPreferredLanguage();
    utterance.lang = normalizeLanguageForVoice(lang);
    utterance.rate = getRate();

    var voice = chooseVoice(utterance.lang);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = function () {
      updateStatus('Reading aloud...');
    };
    utterance.onend = function () {
      updateStatus('Ready to read.');
    };
    utterance.onerror = function () {
      updateStatus('Unable to read this text right now.');
    };

    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    if (!isSupported) {
      return;
    }
    window.speechSynthesis.cancel();
    updateStatus('Reading stopped.');
  }

  function announce(message, options) {
    var text = String(message || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      return;
    }

    var now = Date.now();
    if (text === state.lastAnnouncement && now - state.lastAnnouncementAt < 1800) {
      return;
    }

    state.lastAnnouncement = text;
    state.lastAnnouncementAt = now;

    var settings = options || {};
    if (!state.autoRead && settings.force !== true) {
      return;
    }

    speak(text, { interrupt: true });
  }

  function speakPage() {
    speak(collectReadableText(), { interrupt: true });
  }

  function updateAutoReadValue(value) {
    state.autoRead = !!value;
    try {
      localStorage.setItem(autoReadKey, state.autoRead ? '1' : '0');
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function updateRateValue(value) {
    var normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0.5 || normalized > 2) {
      normalized = 1;
    }
    state.rate = normalized;
    try {
      localStorage.setItem(rateKey, String(normalized));
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function loadSettings() {
    try {
      var savedAutoRead = localStorage.getItem(autoReadKey);
      state.autoRead = savedAutoRead === null ? false : savedAutoRead === '1';
    } catch (error) {
      state.autoRead = false;
    }

    try {
      var savedRate = Number(localStorage.getItem(rateKey));
      state.rate = Number.isFinite(savedRate) && savedRate >= 0.5 && savedRate <= 2 ? savedRate : 1;
    } catch (error) {
      state.rate = 1;
    }
  }

  function createControl() {
    if (document.getElementById('ttsControlContainer')) {
      return;
    }

    var container = document.createElement('div');
    container.id = 'ttsControlContainer';
    container.className = 'tts-control-container';
    container.setAttribute('data-tts-ignore', 'true');

    var title = document.createElement('strong');
    title.className = 'tts-control-title';
    title.textContent = 'Audio Guide';

    var actions = document.createElement('div');
    actions.className = 'tts-control-actions';

    var readButton = document.createElement('button');
    readButton.type = 'button';
    readButton.className = 'btn btn-primary small';
    readButton.textContent = 'Read page';
    readButton.addEventListener('click', speakPage);

    var stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'btn btn-secondary small';
    stopButton.textContent = 'Stop';
    stopButton.addEventListener('click', stop);

    actions.appendChild(readButton);
    actions.appendChild(stopButton);

    var settingsRow = document.createElement('div');
    settingsRow.className = 'tts-settings-row';

    var autoLabel = document.createElement('label');
    autoLabel.className = 'tts-checkbox';

    var autoCheckbox = document.createElement('input');
    autoCheckbox.type = 'checkbox';
    autoCheckbox.checked = state.autoRead;
    autoCheckbox.addEventListener('change', function () {
      updateAutoReadValue(autoCheckbox.checked);
      if (autoCheckbox.checked) {
        announce('Automatic audio updates enabled.', { force: true });
      }
    });

    autoLabel.appendChild(autoCheckbox);
    autoLabel.appendChild(document.createTextNode(' Auto-read updates'));

    var rateLabel = document.createElement('label');
    rateLabel.className = 'tts-rate-label';
    rateLabel.textContent = 'Speed';

    var rateSelect = document.createElement('select');
    rateSelect.className = 'tts-rate-select';
    [
      { value: 0.8, label: '0.8x' },
      { value: 1, label: '1.0x' },
      { value: 1.2, label: '1.2x' }
    ].forEach(function (optionInfo) {
      var option = document.createElement('option');
      option.value = String(optionInfo.value);
      option.textContent = optionInfo.label;
      if (Number(optionInfo.value) === Number(state.rate)) {
        option.selected = true;
      }
      rateSelect.appendChild(option);
    });

    rateSelect.addEventListener('change', function () {
      updateRateValue(rateSelect.value);
      announce('Reading speed updated.', { force: true });
    });

    rateLabel.appendChild(rateSelect);

    settingsRow.appendChild(autoLabel);
    settingsRow.appendChild(rateLabel);

    var status = document.createElement('p');
    status.id = 'ttsStatusText';
    status.className = 'tts-status';
    status.textContent = isSupported ? 'Ready to read.' : 'Text-to-speech not available here.';

    container.appendChild(title);
    container.appendChild(actions);
    container.appendChild(settingsRow);
    container.appendChild(status);
    document.body.appendChild(container);
  }

  function bindHotkeys() {
    document.addEventListener('keydown', function (event) {
      if (!event.altKey) {
        return;
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        speakPage();
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        stop();
      }
    });
  }

  function init() {
    loadSettings();
    createControl();
    bindHotkeys();

    if (isSupported && window.speechSynthesis && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = function () {
        // Trigger voice list initialization for language matching.
        window.speechSynthesis.getVoices();
      };
    }
  }

  window.topicTableTTS = {
    supported: isSupported,
    speakPage: speakPage,
    speak: function (text, options) {
      speak(text, options || {});
    },
    stop: stop,
    announce: announce,
    isAutoReadEnabled: function () {
      return state.autoRead;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();