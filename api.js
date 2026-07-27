(function () {
  async function request(path, options) {
    const response = await fetch(path, {
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options && options.headers ? options.headers : {})
      }
    });

    if (!response.ok) {
      throw new Error('Request failed: ' + response.status + ' ' + path);
    }

    return response.json();
  }

  function sendBeaconJson(path, payload) {
    if (!navigator.sendBeacon) {
      return false;
    }

    const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    return navigator.sendBeacon(path, body);
  }

  function connectUpdates(onChange) {
    let stopped = false;
    let reconnectTimerId = null;
    let reconnectDelay = 500;
    let socket = null;
    let lastVersion = null;

    async function deliver(bundle) {
      if (!bundle || typeof bundle.version !== 'number') {
        return;
      }

      if (lastVersion === bundle.version) {
        return;
      }

      lastVersion = bundle.version;
      await onChange(bundle);
    }

    async function fetchInitialState() {
      try {
        await deliver(await request('/api/state'));
      } catch (error) {
        // Ignore transient startup failures and rely on reconnect.
      }
    }

    function scheduleReconnect() {
      if (stopped || reconnectTimerId !== null) {
        return;
      }

      reconnectTimerId = window.setTimeout(function () {
        reconnectTimerId = null;
        connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 5000);
    }

    function connect() {
      if (stopped) {
        return;
      }

      fetchInitialState();
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(protocol + '//' + window.location.host + '/ws');

      socket.addEventListener('open', function () {
        reconnectDelay = 500;
      });

      socket.addEventListener('message', async function (event) {
        try {
          const payload = JSON.parse(event.data);
          await deliver(payload.bundle || payload);
        } catch (error) {
          // Ignore malformed frames.
        }
      });

      socket.addEventListener('error', function () {
        if (socket) {
          socket.close();
        }
      });

      socket.addEventListener('close', function () {
        socket = null;
        scheduleReconnect();
      });
    }

    connect();

    return function disconnectUpdates() {
      stopped = true;
      if (reconnectTimerId !== null) {
        window.clearTimeout(reconnectTimerId);
      }
      if (socket) {
        socket.close();
      }
    };
  }

  window.topicTableApi = {
    getState: function () {
      return request('/api/state');
    },
    getServerState: function () {
      return request('/api/server-state');
    },
    getSharedStateMap: function () {
      return request('/api/shared-state');
    },
    getSharedTableState: function (tableId) {
      return request('/api/shared-state/' + encodeURIComponent(tableId));
    },
    searchYouTube: function (query) {
      return request('/api/youtube/search?q=' + encodeURIComponent(query || ''));
    },
    saveSharedTableState: function (tableId, state) {
      return request('/api/shared-state/' + encodeURIComponent(tableId), {
        method: 'PUT',
        body: JSON.stringify(state || {})
      });
    },
    syncUser: function (payload) {
      return request('/api/server/sync-user', {
        method: 'POST',
        body: JSON.stringify(payload || {})
      });
    },
    removeUser: function (payload, options) {
      if (options && options.beacon) {
        return Promise.resolve(sendBeaconJson('/api/server/remove-user', payload || {}));
      }

      return request('/api/server/remove-user', {
        method: 'POST',
        body: JSON.stringify(payload || {})
      });
    },
    setAdminTopic: function (payload) {
      return request('/api/server/set-topic', {
        method: 'POST',
        body: JSON.stringify(payload || {})
      });
    },
    clearAdminTopic: function (payload) {
      return request('/api/server/clear-topic', {
        method: 'POST',
        body: JSON.stringify(payload || {})
      });
    },
    clearTableHistory: function (payload) {
      return request('/api/server/clear-history', {
        method: 'POST',
        body: JSON.stringify(payload || {})
      });
    },
    removeHistoryEntry: function (payload) {
      return request('/api/server/remove-history-entry', {
        method: 'POST',
        body: JSON.stringify(payload || {})
      });
    },
    connectUpdates: connectUpdates
  };
})();