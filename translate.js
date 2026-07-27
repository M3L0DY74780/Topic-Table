(function () {
  var languageOptions = [
    { code: 'en', label: 'English' },
    { code: 'zh-CN', label: 'Chinese (Simplified)' },
    { code: 'ms', label: 'Malay' },
    { code: 'ta', label: 'Tamil' },
    { code: 'hi', label: 'Hindi' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'ar', label: 'Arabic' }
  ];

  var storageKey = 'topicTableLanguage';

  function setCookie(name, value) {
    document.cookie = name + '=' + value + ';path=/';
  }

  function setTranslateCookie(languageCode) {
    setCookie('googtrans', '/en/' + languageCode);
  }

  function renderLanguageSelector() {
    if (document.getElementById('languageSelectorContainer')) {
      return;
    }

    var container = document.createElement('div');
    container.id = 'languageSelectorContainer';
    container.className = 'language-selector-container';

    var label = document.createElement('label');
    label.setAttribute('for', 'languageSelector');
    label.textContent = 'Language';

    var select = document.createElement('select');
    select.id = 'languageSelector';
    select.className = 'language-selector';

    languageOptions.forEach(function (option) {
      var element = document.createElement('option');
      element.value = option.code;
      element.textContent = option.label;
      select.appendChild(element);
    });

    var savedLanguage = localStorage.getItem(storageKey) || 'en';
    select.value = savedLanguage;

    select.addEventListener('change', function () {
      var languageCode = select.value;
      localStorage.setItem(storageKey, languageCode);
      setTranslateCookie(languageCode);

      var translateCombo = document.querySelector('.goog-te-combo');
      if (translateCombo) {
        translateCombo.value = languageCode;
        translateCombo.dispatchEvent(new Event('change'));
        return;
      }

      window.location.reload();
    });

    container.appendChild(label);
    container.appendChild(select);
    document.body.appendChild(container);

    var hiddenWidget = document.createElement('div');
    hiddenWidget.id = 'google_translate_element';
    hiddenWidget.className = 'google-translate-element';
    document.body.appendChild(hiddenWidget);
  }

  window.googleTranslateElementInit = function () {
    if (!(window.google && window.google.translate && window.google.translate.TranslateElement)) {
      return;
    }

    new window.google.translate.TranslateElement(
      {
        pageLanguage: 'en',
        autoDisplay: false,
        includedLanguages: languageOptions.map(function (option) { return option.code; }).join(','),
        layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE
      },
      'google_translate_element'
    );

    var savedLanguage = localStorage.getItem(storageKey) || 'en';
    setTranslateCookie(savedLanguage);

    if (savedLanguage === 'en') {
      return;
    }

    window.setTimeout(function () {
      var translateCombo = document.querySelector('.goog-te-combo');
      if (!translateCombo) {
        return;
      }

      translateCombo.value = savedLanguage;
      translateCombo.dispatchEvent(new Event('change'));
    }, 500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderLanguageSelector);
  } else {
    renderLanguageSelector();
  }
})();