import base64
import hashlib
import html
import json
import mimetypes
import os
import re
import socket
import struct
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote_plus, unquote, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT_DIR = Path(__file__).resolve().parent
STATE_FILE = Path(os.environ.get('STATE_FILE', 'topic_table_state.json'))
if not STATE_FILE.is_absolute():
    STATE_FILE = ROOT_DIR / STATE_FILE
STATE_LOCK = threading.Lock()

mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')


class WebSocketHub:
    def __init__(self):
        self._clients = set()
        self._lock = threading.Lock()

    def register(self, connection):
        with self._lock:
            self._clients.add(connection)

    def unregister(self, connection):
        with self._lock:
            self._clients.discard(connection)

        try:
            connection.close()
        except OSError:
            pass

    def broadcast_bundle(self, bundle):
        payload = json.dumps({'type': 'state', 'bundle': bundle})
        with self._lock:
            clients = list(self._clients)

        stale_clients = []
        for connection in clients:
            try:
                send_websocket_frame(connection, payload)
            except OSError:
                stale_clients.append(connection)

        for connection in stale_clients:
            self.unregister(connection)

    def send_bundle(self, connection, bundle):
        send_websocket_frame(connection, json.dumps({'type': 'state', 'bundle': bundle}))


WS_HUB = WebSocketHub()


def create_default_tables():
    return [
        {'id': 'Table 01', 'name': 'Table 01', 'status': 'Live', 'users': []},
        {'id': 'Table 02', 'name': 'Table 02', 'status': 'Live', 'users': []},
        {'id': 'Table 03', 'name': 'Table 03', 'status': 'Live', 'users': []},
        {'id': 'Table 04', 'name': 'Table 04', 'status': 'Standby', 'users': []},
        {'id': 'Table 05', 'name': 'Table 05', 'status': 'Live', 'users': []},
    ]


def create_default_bundle():
    return {
        'version': 0,
        'updatedAt': time.time(),
        'serverState': {
            'tables': create_default_tables(),
            'history': [],
            'lastUser': '',
            'activeTopic': '',
        },
        'sharedState': {},
    }


def normalize_bundle(bundle):
    if not isinstance(bundle, dict):
        bundle = {}

    server_state = bundle.get('serverState')
    if not isinstance(server_state, dict):
        server_state = {}

    tables = server_state.get('tables')
    if not isinstance(tables, list) or not tables:
        tables = create_default_tables()

    normalized_tables = []
    for table in tables:
        if not isinstance(table, dict):
            continue
        normalized_tables.append(
            {
                'id': table.get('id') or 'Table 01',
                'name': table.get('name') or table.get('id') or 'Table 01',
                'status': table.get('status') or 'Live',
                'users': table.get('users') if isinstance(table.get('users'), list) else [],
            }
        )

    if not normalized_tables:
        normalized_tables = create_default_tables()

    server_state['tables'] = normalized_tables
    server_state['history'] = server_state.get('history') if isinstance(server_state.get('history'), list) else []
    server_state['lastUser'] = server_state.get('lastUser') or ''
    server_state['activeTopic'] = server_state.get('activeTopic') or ''

    shared_state = bundle.get('sharedState')
    if not isinstance(shared_state, dict):
        shared_state = {}

    bundle['serverState'] = server_state
    bundle['sharedState'] = shared_state
    bundle['version'] = int(bundle.get('version') or 0)
    bundle['updatedAt'] = float(bundle.get('updatedAt') or time.time())
    return bundle


def load_bundle_unlocked():
    if not STATE_FILE.exists():
        bundle = create_default_bundle()
        save_bundle_unlocked(bundle)
        return bundle

    try:
        return normalize_bundle(json.loads(STATE_FILE.read_text(encoding='utf-8')))
    except (json.JSONDecodeError, OSError, ValueError):
        bundle = create_default_bundle()
        save_bundle_unlocked(bundle)
        return bundle


def save_bundle_unlocked(bundle):
    bundle = normalize_bundle(bundle)
    temp_file = STATE_FILE.with_suffix('.tmp')
    temp_file.write_text(json.dumps(bundle, indent=2), encoding='utf-8')
    temp_file.replace(STATE_FILE)


def read_bundle():
    with STATE_LOCK:
        return load_bundle_unlocked()


def mutate_bundle(mutator):
    with STATE_LOCK:
        bundle = load_bundle_unlocked()
        mutator(bundle)
        bundle = normalize_bundle(bundle)
        bundle['version'] += 1
        bundle['updatedAt'] = time.time()
        save_bundle_unlocked(bundle)

    WS_HUB.broadcast_bundle(bundle)
    return bundle


def get_or_create_table(bundle, table_id):
    server_state = bundle['serverState']
    tables = server_state['tables']
    for table in tables:
        if table['id'] == table_id:
            return table

    new_table = {'id': table_id, 'name': table_id, 'status': 'Live', 'users': []}
    tables.append(new_table)
    return new_table


def append_history(server_state, table_id, user_name, selection):
    server_state['history'] = [
        *(server_state.get('history') or []),
        {
            'tableId': table_id,
            'userName': user_name,
            'selection': selection,
            'time': time.strftime('%I:%M %p').lstrip('0'),
        },
    ][-12:]


def parse_request_json(handler):
    length = int(handler.headers.get('Content-Length') or 0)
    raw_body = handler.rfile.read(length) if length > 0 else b''
    if not raw_body:
        return {}

    try:
        return json.loads(raw_body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def decode_escaped_text(value):
    if not value:
        return ''

    decoded_text = value

    if '\\u' in value or '\\x' in value:
        try:
            decoded_text = bytes(value, 'utf-8').decode('unicode_escape')
        except UnicodeDecodeError:
            decoded_text = value

    try:
        repaired = decoded_text.encode('latin1').decode('utf-8')
        return html.unescape(repaired)
    except (UnicodeEncodeError, UnicodeDecodeError):
        return html.unescape(decoded_text)


def fetch_text_url(url, timeout=2):
    request = Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    )

    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read().decode('utf-8', errors='ignore')
    except OSError:
        return ''


def parse_playability(html_payload):
    if not html_payload:
        return '', None

    status_match = re.search(r'"playabilityStatus":\{"status":"([A-Z_]+)"', html_payload)
    playable_match = re.search(r'"playableInEmbed":(true|false)', html_payload)

    status = status_match.group(1) if status_match else ''
    playable_in_embed = playable_match.group(1) == 'true' if playable_match else None
    return status, playable_in_embed


def is_youtube_video_embeddable(video_id):
    if not video_id:
        return False

    video_info_payload = fetch_text_url('https://www.youtube.com/get_video_info?video_id=' + video_id + '&el=embedded&hl=en', timeout=3)
    if video_info_payload:
        try:
            info_map = parse_qs(video_info_payload)
            status_values = info_map.get('status') or []
            if any(value.lower() == 'fail' for value in status_values):
                return False

            player_response_values = info_map.get('player_response') or []
            if player_response_values:
                player_response = json.loads(player_response_values[0])
                playability = player_response.get('playabilityStatus') or {}
                state = (playability.get('status') or '').upper()
                if state in {'UNPLAYABLE', 'ERROR', 'LOGIN_REQUIRED'}:
                    return False
                if state == 'OK':
                    playable_in_embed = playability.get('playableInEmbed')
                    if playable_in_embed is False:
                        return False
                    return True
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    oembed_url = 'https://www.youtube.com/oembed?url=' + quote_plus('https://www.youtube.com/watch?v=' + video_id) + '&format=json'
    oembed_request = Request(
        oembed_url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        },
    )

    try:
        with urlopen(oembed_request, timeout=3) as response:
            if response.status == 200:
                return True
    except HTTPError as error:
        if error.code in {401, 403, 404}:
            return False
    except URLError:
        pass

    embed_html = fetch_text_url('https://www.youtube.com/embed/' + video_id, timeout=2)
    if not embed_html:
        return True

    embed_status, embed_playable = parse_playability(embed_html)
    if embed_status == 'OK':
        return True
    if embed_status in {'UNPLAYABLE', 'ERROR', 'LOGIN_REQUIRED'}:
        return False
    if embed_playable is True:
        return True
    if embed_playable is False:
        return False

    return True


def build_youtube_embed_url(video_id):
    return (
        'https://www.youtube-nocookie.com/embed/'
        + video_id
        + '?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1'
    )


def search_youtube_videos(query, limit=8):
    search_term = (query or '').strip()
    if not search_term:
        return []

    request_url = 'https://www.youtube.com/results?search_query=' + quote_plus(search_term)
    html_payload = fetch_text_url(request_url)
    if not html_payload:
        return []

    pattern = re.compile(
        r'"videoId":"(?P<id>[A-Za-z0-9_-]{11})"(?P<chunk>[\s\S]{0,500}?)"title":\{"runs":\[\{"text":"(?P<title>(?:\\.|[^"\\])*)"',
        re.IGNORECASE,
    )

    raw_candidates = []
    seen_ids = set()

    for match in pattern.finditer(html_payload):
        video_id = match.group('id')
        if video_id in seen_ids:
            continue

        seen_ids.add(video_id)
        decoded_title = decode_escaped_text(match.group('title')).strip() or 'YouTube video'

        raw_candidates.append(
            {
                'videoId': video_id,
                'title': decoded_title,
                'watchUrl': 'https://www.youtube.com/watch?v=' + video_id,
                'embedUrl': build_youtube_embed_url(video_id),
            }
        )

        if len(raw_candidates) >= 24:
            break

    fallback_pattern = re.compile(r'"videoId":"([A-Za-z0-9_-]{11})"')
    for fallback_match in fallback_pattern.finditer(html_payload):
        video_id = fallback_match.group(1)
        if video_id in seen_ids:
            continue

        seen_ids.add(video_id)
        raw_candidates.append(
            {
                'videoId': video_id,
                'title': 'YouTube video',
                'watchUrl': 'https://www.youtube.com/watch?v=' + video_id,
                'embedUrl': build_youtube_embed_url(video_id),
            }
        )

        if len(raw_candidates) >= 24:
            break

    playable_results = []
    non_playable_results = []
    max_checks = min(len(raw_candidates), 6)

    for candidate in raw_candidates[:max_checks]:
        if is_youtube_video_embeddable(candidate['videoId']):
            candidate['embeddable'] = True
            playable_results.append(candidate)
            if len(playable_results) >= limit:
                break
        else:
            candidate['embeddable'] = False
            non_playable_results.append(candidate)

    if playable_results:
        return playable_results

    return non_playable_results[:limit]


def websocket_accept_value(key):
    magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
    digest = hashlib.sha1((key + magic).encode('utf-8')).digest()
    return base64.b64encode(digest).decode('utf-8')


def read_exact(connection, size):
    chunks = []
    remaining = size
    while remaining > 0:
      data = connection.recv(remaining)
      if not data:
          raise OSError('Socket closed')
      chunks.append(data)
      remaining -= len(data)
    return b''.join(chunks)


def receive_websocket_frame(connection):
    header = read_exact(connection, 2)
    first_byte = header[0]
    second_byte = header[1]
    opcode = first_byte & 0x0F
    masked = (second_byte & 0x80) != 0
    payload_length = second_byte & 0x7F

    if payload_length == 126:
        payload_length = struct.unpack('!H', read_exact(connection, 2))[0]
    elif payload_length == 127:
        payload_length = struct.unpack('!Q', read_exact(connection, 8))[0]

    masking_key = read_exact(connection, 4) if masked else b''
    payload = read_exact(connection, payload_length) if payload_length else b''

    if masked and payload:
        payload = bytes(
            byte ^ masking_key[index % 4] for index, byte in enumerate(payload)
        )

    return opcode, payload


def send_websocket_frame(connection, payload, opcode=0x1):
    payload_bytes = payload.encode('utf-8') if isinstance(payload, str) else payload
    header = bytearray()
    header.append(0x80 | opcode)
    payload_length = len(payload_bytes)

    if payload_length < 126:
        header.append(payload_length)
    elif payload_length < 65536:
        header.append(126)
        header.extend(struct.pack('!H', payload_length))
    else:
        header.append(127)
        header.extend(struct.pack('!Q', payload_length))

    connection.sendall(bytes(header) + payload_bytes)


class TopicTableHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/ws' and self.headers.get('Upgrade', '').lower() == 'websocket':
            self.handle_websocket()
            return

        if parsed.path == '/api/youtube/search':
            query_params = parse_qs(parsed.query or '')
            search_term = (query_params.get('q') or [''])[0]
            items = search_youtube_videos(search_term)
            has_playable = any(item.get('embeddable') for item in items)
            self.send_json({
                'items': items,
                'hasPlayable': has_playable,
                'message': '' if has_playable else 'No embeddable YouTube videos were found for this search. Try another query.'
            })
            return

        if parsed.path == '/api/state':
            self.send_json(read_bundle())
            return

        if parsed.path == '/api/server-state':
            self.send_json(read_bundle()['serverState'])
            return

        if parsed.path == '/api/shared-state':
            self.send_json(read_bundle()['sharedState'])
            return

        if parsed.path.startswith('/api/shared-state/'):
            table_id = unquote(parsed.path.split('/api/shared-state/', 1)[1])
            self.send_json(read_bundle()['sharedState'].get(table_id, {}))
            return

        super().do_GET()

    def handle_websocket(self):
        websocket_key = self.headers.get('Sec-WebSocket-Key')
        if not websocket_key:
            self.send_json({'error': 'Missing websocket key'}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_response(HTTPStatus.SWITCHING_PROTOCOLS)
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', websocket_accept_value(websocket_key))
        self.end_headers()

        connection = self.connection
        WS_HUB.register(connection)
        try:
            WS_HUB.send_bundle(connection, read_bundle())
            while True:
                opcode, payload = receive_websocket_frame(connection)
                if opcode == 0x8:
                    break
                if opcode == 0x9:
                    send_websocket_frame(connection, payload, opcode=0xA)
                    continue
        except (ConnectionError, OSError, socket.error):
            pass
        finally:
            WS_HUB.unregister(connection)

    def do_POST(self):
        parsed = urlparse(self.path)
        payload = parse_request_json(self)

        if parsed.path == '/api/server/sync-user':
            table_id = payload.get('tableId') or 'Table 01'
            user_name = (payload.get('userName') or '').strip() or 'Guest user'
            selection = payload.get('selection') or 'Signed in'

            bundle = mutate_bundle(
                lambda state: self.sync_user(state, table_id, user_name, payload, selection)
            )
            self.send_json(bundle)
            return

        if parsed.path == '/api/server/remove-user':
            table_id = payload.get('tableId') or 'Table 01'
            user_name = (payload.get('userName') or '').strip()
            bundle = mutate_bundle(lambda state: self.remove_user(state, table_id, user_name))
            self.send_json(bundle)
            return

        if parsed.path == '/api/server/set-topic':
            table_id = payload.get('tableId') or 'Table 01'
            topic = (payload.get('topic') or '').strip()
            bundle = mutate_bundle(lambda state: self.set_topic(state, table_id, topic))
            self.send_json(bundle)
            return

        if parsed.path == '/api/server/clear-topic':
            table_id = payload.get('tableId') or 'Table 01'
            bundle = mutate_bundle(lambda state: self.clear_topic(state, table_id))
            self.send_json(bundle)
            return

        if parsed.path == '/api/server/clear-history':
            table_id = payload.get('tableId') or 'Table 01'
            bundle = mutate_bundle(lambda state: self.clear_history(state, table_id))
            self.send_json(bundle)
            return

        if parsed.path == '/api/server/remove-history-entry':
            table_id = payload.get('tableId') or 'Table 01'
            index = int(payload.get('index') or 0)
            bundle = mutate_bundle(lambda state: self.remove_history_entry(state, table_id, index))
            self.send_json(bundle)
            return

        self.send_json({'error': 'Unknown endpoint'}, status=HTTPStatus.NOT_FOUND)

    def do_PUT(self):
        parsed = urlparse(self.path)
        payload = parse_request_json(self)

        if parsed.path.startswith('/api/shared-state/'):
            table_id = unquote(parsed.path.split('/api/shared-state/', 1)[1])
            bundle = mutate_bundle(lambda state: state['sharedState'].__setitem__(table_id, payload if isinstance(payload, dict) else {}))
            self.send_json(bundle)
            return

        self.send_json({'error': 'Unknown endpoint'}, status=HTTPStatus.NOT_FOUND)

    @staticmethod
    def sync_user(bundle, table_id, user_name, payload, selection):
        server_state = bundle['serverState']
        table = get_or_create_table(bundle, table_id)
        table['status'] = 'Live'
        users = table['users']
        existing_user = next((user for user in users if (user.get('name') or '').strip() == user_name), None)

        email = (payload.get('email') or '').strip()
        phone = (payload.get('phone') or '').strip()
        nric = (payload.get('nric') or '').strip()

        if existing_user is None:
            existing_user = {
                'name': user_name,
                'email': email or 'N/A',
                'phone': phone or 'N/A',
                'nric': nric or 'Unknown',
                'history': [],
            }
            users.append(existing_user)
        else:
            existing_user['email'] = email or existing_user.get('email') or 'N/A'
            existing_user['phone'] = phone or existing_user.get('phone') or 'N/A'
            existing_user['nric'] = nric or existing_user.get('nric') or 'Unknown'

        existing_user['lastSelection'] = selection
        existing_user['history'] = [*(existing_user.get('history') or []), selection][-8:]
        server_state['lastUser'] = user_name
        server_state['activeTopic'] = selection
        append_history(server_state, table_id, user_name, selection)

    @staticmethod
    def remove_user(bundle, table_id, user_name):
        if not user_name:
            return
        table = get_or_create_table(bundle, table_id)
        table['users'] = [
            user for user in (table.get('users') or []) if (user.get('name') or '').strip() != user_name
        ]

    @staticmethod
    def set_topic(bundle, table_id, topic):
        if not topic:
            return

        label = 'Music' if topic == 'music' else topic
        bundle['sharedState'][table_id] = {
            'activeMode': 'music' if topic == 'music' else 'topic',
            'activeTopic': label,
            'queue': [],
        }
        table = get_or_create_table(bundle, table_id)
        table['status'] = 'Live'
        bundle['serverState']['activeTopic'] = 'Music mode' if topic == 'music' else topic
        append_history(bundle['serverState'], table_id, 'Admin', 'Music mode' if topic == 'music' else topic)

    @staticmethod
    def clear_topic(bundle, table_id):
        bundle['sharedState'][table_id] = {'activeMode': 'topic', 'activeTopic': '', 'queue': []}
        append_history(bundle['serverState'], table_id, 'Admin', 'Topic cleared')

    @staticmethod
    def clear_history(bundle, table_id):
        bundle['serverState']['history'] = [
            entry for entry in (bundle['serverState'].get('history') or []) if entry.get('tableId') != table_id
        ]

    @staticmethod
    def remove_history_entry(bundle, table_id, index):
        history = bundle['serverState'].get('history') or []
        table_entries = [entry for entry in history if entry.get('tableId') == table_id]
        if index < 0 or index >= len(table_entries):
            return
        target = table_entries[index]
        removed = False
        next_history = []
        for entry in history:
            if not removed and entry == target:
                removed = True
                continue
            next_history.append(entry)
        bundle['serverState']['history'] = next_history


def main():
    port = int(os.environ.get('PORT', '8000'))
    server = ThreadingHTTPServer(('0.0.0.0', port), TopicTableHandler)
    print('Serving Topic Table app on http://127.0.0.1:' + str(port))
    server.serve_forever()


if __name__ == '__main__':
    main()