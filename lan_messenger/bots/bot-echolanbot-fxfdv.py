#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generated LAN Messenger bot"""

import json
import time
import urllib.error
import urllib.request

API_BASE = "http://127.0.0.1:4010/api"
ROOM_ID = "grp_teamlan_os5xz"
BOT_LOGIN = "echolanbot"
TRIGGER = "!help"
RESPONSE = "LAN help text"
POLL_DELAY_SEC = 1.5
last_seq = 0

def http_json(method, path, payload=None):
    url = API_BASE + path
    data = None
    headers = {'Content-Type': 'application/json'}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        print(f'[WARN] HTTP {exc.code} {path}')
        return None
    except Exception as exc:
        print(f'[WARN] Request failed: {exc}')
        return None

def main():
    global last_seq
    print(f'[INFO] Bot started in {ROOM_ID} as {BOT_LOGIN}')
    while True:
        data = http_json('GET', f'/messages?room={ROOM_ID}&after={last_seq}&actor={BOT_LOGIN}')
        if data and data.get('ok'):
            for message in data.get('messages') or []:
                seq = int(message.get('seq') or 0)
                if seq > last_seq:
                    last_seq = seq
                author = str(message.get('author') or '')
                text = str(message.get('text') or '')
                if not text:
                    continue
                if author.lower() == BOT_LOGIN.lower():
                    continue
                if TRIGGER and TRIGGER not in text.lower():
                    continue
                http_json('POST', '/send', {'room': ROOM_ID, 'author': BOT_LOGIN, 'text': RESPONSE})
        time.sleep(POLL_DELAY_SEC)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('[INFO] Bot stopped')