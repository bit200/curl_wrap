# curl-wrap: безопасный relay для загрузки страниц судов

Сервис сохраняет прежний способ работы: HTTP API принимает запрос `/curl` или
`/odb`, передаёт его подключённому Socket.IO executor-у и возвращает HTML в
знакомом JSON-формате. HTTP API и Socket.IO доступны на одном домене и порту.

Production endpoint:

```text
https://curl-proxy.212-8-247-141.sslip.io
```

Секрет не хранится в Git. Администратор отдельно передаёт один
`CURL_WRAP_TOKEN`: он используется и в HTTP API, и при подключении executor-а.

## Игорю: что изменилось

Сохранены:

- `GET /curl` и все основные query-параметры;
- `POST /curl` с JSON;
- `GET /odb`;
- `GET /clients`;
- выбор executor-а через `ip` или `code`;
- поле `socket`, `query`, `regexps` и `res` в ответе;
- Socket.IO и событие `curl`;
- один общий порт для HTTP и Socket.IO.

Добавлен один обязательный секрет:

- HTTP-клиент передаёт `X-API-Key: <CURL_WRAP_TOKEN>` или
  `Authorization: Bearer <CURL_WRAP_TOKEN>`;
- Socket.IO executor передаёт тот же `CURL_WRAP_TOKEN` при подключении.

Токен нельзя добавлять в query string: URL попадает в access-логи и историю
браузера.

Существующий executor Игоря, который сначала подключается с `auth: {token}`, а
затем отправляет старое событие `init` с полями `code` и `force_ip`, также
поддерживается. Для него оставлен совместимый псевдоним переменной `TOKEN`:

```bash
TOKEN="$CURL_WRAP_TOKEN" node socket/client_socket.js
```

До успешного `init` relay считает такое соединение незарегистрированным и не
отправляет ему задания.

## Быстрая проверка API

```bash
export CURL_WRAP_URL=https://curl-proxy.212-8-247-141.sslip.io
export CURL_WRAP_TOKEN='получить-у-администратора'

curl -fsS "$CURL_WRAP_URL/clients" \
  -H "X-API-Key: $CURL_WRAP_TOKEN" | jq
```

Если executor подключён, `items` содержит его `ip`, `code`, `clientId` и число
активных запросов.

Старый вызов `/curl`:

```bash
curl -fsS -G "$CURL_WRAP_URL/curl" \
  -H "X-API-Key: $CURL_WRAP_TOKEN" \
  --data-urlencode 'ip=193.233.193.42' \
  --data-urlencode 'timeout=25000' \
  --data-urlencode 'url=https://krasnodar-prikubansky--krd.sudrf.ru/modules.php?name=sud_delo&srv_num=1&H_date=19.05.2026' \
  | jq
```

Старый вызов `/odb`:

```bash
curl -fsS -G "$CURL_WRAP_URL/odb" \
  -H "X-API-Key: $CURL_WRAP_TOKEN" \
  --data-urlencode 'ip=193.233.193.42' \
  --data-urlencode 'odb=19.05.2026' \
  --data-urlencode 'domain=https://tulunsky--irk.sudrf.ru' \
  | jq
```

Рабочий `POST /curl`:

```bash
curl -fsS "$CURL_WRAP_URL/curl" \
  -H "Authorization: Bearer $CURL_WRAP_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{
    "ip": "193.233.193.42",
    "timeout": 25000,
    "url": "https://ust-kutsky--irk.sudrf.ru/"
  }' | jq
```

## Минимальное изменение существующего кода

Было:

```js
const response = await fetch(`${baseUrl}/curl?${params}`);
```

Стало:

```js
const response = await fetch(`${baseUrl}/curl?${params}`, {
    headers: {
        'X-API-Key': process.env.CURL_WRAP_TOKEN,
    },
});
```

Адрес меняется на production endpoint выше. Остальные параметры можно не
переписывать.

## Запуск executor-а

Executor должен работать на машине, с IP которой требуется обращаться к
сайтам судов. Он сам устанавливает исходящее соединение с relay; открывать
входящий порт на executor-машине не нужно.

Требуется Node.js 22–24.

```bash
mkdir -p ~/work/curl_wrap-secure
curl -fsSLo /tmp/curl-wrap-client-v2.0.3.tar.gz \
  https://curl-proxy.212-8-247-141.sslip.io/download/curl-wrap-client-v2.0.3.tar.gz
tar -xzf /tmp/curl-wrap-client-v2.0.3.tar.gz \
  --strip-components=1 -C ~/work/curl_wrap-secure
cd ~/work/curl_wrap-secure
npm ci --omit=dev
cp .env.executor.example .env.executor
chmod 600 .env.executor
```

Заполнить `.env.executor`:

```env
PROXY_URL=https://curl-proxy.212-8-247-141.sslip.io
CURL_WRAP_TOKEN=получить-у-администратора
CLIENT_ID=igor-office
EXECUTOR_LEGACY_IP=193.233.193.42
```

`EXECUTOR_LEGACY_IP` — совместимый псевдоним. Если старые API-вызовы содержат
`ip=193.233.193.42`, оставьте это значение, даже если фактический публичный IP
машины изменился. Для новых вызовов лучше использовать `code=igor-office`.

Ручной запуск:

```bash
node --env-file=.env.executor socket/client_socket.js
```

Для обратной совместимости старый запуск только с токеном тоже подключается к
рабочему публичному relay:

```bash
TOKEN=получить-у-администратора node socket/client_socket.js
```

Успешное подключение выглядит так:

```json
{"event":"executor_connected","clientId":"igor-office","proxyUrl":"https://curl-proxy.212-8-247-141.sslip.io"}
```

### Постоянный запуск executor-а через PM2

```bash
mkdir -p logs
npx pm2 start ecosystem.executor.config.cjs
npx pm2 save
npx pm2 status
```

Для автозапуска после перезагрузки выполните команду, которую выведет:

```bash
npx pm2 startup
```

Затем ещё раз:

```bash
npx pm2 save
```

## HTTP API

### `GET /curl`

Совместимый endpoint.

| Параметр | Обязательный | Описание |
| --- | --- | --- |
| `url` | да | Абсолютный HTTPS URL на `sudrf.ru` или его поддомене. |
| `ip` | нет | Старый псевдоним executor-а. |
| `code` | нет | Стабильный идентификатор executor-а. |
| `clientId` | нет | Новый синоним `code`. |
| `timeout` | нет | Целое число от 1000 до 30000 мс. |
| `ref` | нет | Заголовок Referer. |
| `lng` | нет | Accept-Language. |
| `accept` | нет | Accept. |
| `agent` | нет | User-Agent. |
| `woClean` | нет | `true`/`1`: не удалять `head`, `script`, `style`. |
| `woReg` | нет | `true`/`1`: не считать старые regexp-маркеры. |

Без селектора выбирается наименее занятый executor. При указанном `ip`, `code`
или `clientId` запрос ждёт именно соответствующий executor.

### `POST /curl` и `POST /v1/fetch`

Принимают те же поля в JSON. Максимальный размер тела — 64 КиБ.

### `GET /odb`

Сохраняет прежние `domain`, `odb`, `ip`, `code` и `timeout`, безопасно собирает
URL `/modules.php?name=sud_delo&srv_num=1&H_date=...`.

### `GET /clients`

Возвращает подключённые executors. Endpoint защищён тем же API-токеном.

### Служебные endpoint-ы

- `GET /healthz` — relay-процесс запущен;
- `GET /readyz` — есть хотя бы один подключённый executor. Возвращает HTTP 503,
  когда relay жив, но выполнять запросы пока некому.

## Коды ошибок

| HTTP | `code` | Что делать |
| ---: | --- | --- |
| 401 | `UNAUTHORIZED` | Проверить `CURL_WRAP_TOKEN` и заголовок. |
| 422 | `HOST_NOT_ALLOWED` | Разрешены только `sudrf.ru` и поддомены. |
| 422 | `INVALID_TIMEOUT` | Передать целое `timeout` от 1000 до 30000. |
| 422 | `INVALID_IP` | Исправить старый `ip` или использовать `code`. |
| 429 | `QUEUE_FULL` | Очередь relay заполнена; повторить с паузой и backoff. |
| 503 | `EXECUTOR_UNAVAILABLE` | Запустить нужный executor или проверить selector. |
| 504 | `EXECUTOR_TIMEOUT` | Executor/сайт суда не ответил вовремя. |

Рекомендуемый retry для 429, 503 и 504: 1, 2, 5, 10 и 20 секунд с небольшим
случайным jitter. Ошибки 401 и 422 повторять без исправления запроса не нужно.

## Ограничения безопасности

- только HTTPS и домены `sudrf.ru`;
- повторная DNS-проверка на executor-е и блокировка localhost, private LAN,
  link-local и metadata IP;
- IP после проверки фиксируется для фактического TCP-соединения, что защищает
  от DNS rebinding;
- GET по умолчанию; произвольные методы и заголовки запрещены;
- максимум 1 МиБ на ответ;
- 16 одновременных запросов на executor и ограниченная очередь;
- фиксированного минутного лимита API нет: пропускную способность ограничивают
  число executor-ов, параллельность на каждый executor и размер очереди;
- API и Socket.IO используют независимые токены;
- `saveUp` и запись произвольных файлов из удалённого запроса удалены;
- HTML и полные query-параметры судебных дел не пишутся в серверные логи.

## Администратору: production relay через PM2

Сервер разворачивается одним PM2-процессом. Cluster mode без Redis не
используется, потому что подключения Socket.IO хранятся в памяти процесса.

```bash
mkdir -p /opt/curl-wrap
tar -xzf curl-wrap-client-v2.0.3.tar.gz \
  --strip-components=1 -C /opt/curl-wrap
cd /opt/curl-wrap
npm ci --omit=dev
cp .env.example .env
chmod 600 .env
mkdir -p logs
```

Сгенерировать разные секреты:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Запустить:

Production использует PM2 в foreground-режиме под systemd: PM2 перезапускает
приложение, а systemd восстанавливает сам PM2 после перезагрузки VPS. Готовые
файлы находятся в `deploy/systemd/curl-wrap-pm2.service.example` и
`deploy/logrotate/curl-wrap`. После установки:

`ecosystem.production.config.cjs` запускает relay и локальный fallback-executor.
Для него требуется защищённый `.env.executor`; отдельные внешние executors
могут подключаться одновременно.

```bash
sudo systemctl enable --now curl-wrap-pm2.service
sudo systemctl status curl-wrap-pm2.service
```

Nginx-конфигурация находится в
`deploy/nginx/curl-wrap.conf.example`. Порт `8112` должен слушать только
`127.0.0.1`; снаружи открываются только 80/443. В Nginx обязательно оставить
WebSocket Upgrade и `proxy_buffering off`.

Обновление:

```bash
cd /opt/curl-wrap
# Распаковать новую проверенную сборку поверх исходников без замены .env.
npm ci --omit=dev
npm test
sudo systemctl reload curl-wrap-pm2.service
curl -fsS http://127.0.0.1:8112/healthz
```

Диагностика:

```bash
sudo systemctl status curl-wrap-pm2.service
sudo journalctl -u curl-wrap-pm2.service -n 100 --no-pager
curl -fsS http://127.0.0.1:8112/healthz | jq
curl -sS http://127.0.0.1:8112/readyz | jq
sudo nginx -t
```

## Разработка и проверки

```bash
npm ci
npm run check
npm audit --omit=dev
```

Тесты проверяют прежние GET/POST endpoint-ы и JSON, `ip`-совместимость,
авторизацию API и Socket.IO, allowlist доменов, корректный числовой timeout и
блокировку private/metadata адресов.
