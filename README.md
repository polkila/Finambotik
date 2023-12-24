# Finambotik

Робот для алгоритмической торговли, подключаемый к Finam TradeAPI.
Управляется через Telegram и базовые настройки в конфигурационном файле.

Легко масштабируется. Для этого в отдельный процесс вынесен диспетчер подписок на стримы котировок.

Для работы понадобится [NodeJS](https://nodejs.org/en/download), [Redis](https://redis.io/docs/getting-started/) и менеджер процессов по желанию, например [PM2](https://pm2.keymetrics.io/docs/usage/quick-start/).

### Подготовка окружения

#### Установка NodeJS
```
sudo apt install nodejs
```

#### Установка Redis
```
sudo apt install lsb-release
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list

sudo apt-get update
sudo apt-get install redis
```
[Документация по установке](https://redis.io/docs/getting-started/installation/) для Windows и macOS.

#### Установка PM2
```
npm install pm2@latest -g
```

Для автозапуска PM2 вместе с ОС:
```
pm2 startup
```

#### Telegram

Нужно создать Telegram-бота через [@BotFather](https://t.me/BotFather). Запомнить сгенерированный токен, разрешить добавление в группу (чат) и отключить приватный режим, чтобы Telegram-бот имел доступ к сообщениям в группе.
Добавить его в новую группу, в которой будут отправляться команды торговому роботу.
 
#### Конфигурация

В файле `config.js` вписать свои логин, токен и id брокерского счёта. Это может быть как пустой счёт, так и счёт с бумагами на балансе. Робот будет закрывать только свои позиции в рамках своей стратегии.
Также вписать токен Telegram-бота и id группы. Поменять `production` на 1 для торговли на брокерском счёте или оставить 0 для «бумажной» торговли.
В директории с торговым роботом выполнить установку пакетов:
```
npm install
```

### Запуск

3 раздельных процесса отвечают каждый за свою задачу:
`telegram.js` — за чат и команды, диспетчер подписок `grpc.js` раздаёт ботам необходимые им подписки, и сам робот `bot1.js` — за алгоритм и рассчёты. 
Их можно запустить по отдельности в трёх консолях:
```
node telegram.js
node grpc.js
node bot1.js
```

Но я предпочитаю использовать процесс-менеджер и готовый конфигурационный файл для запуска всех необходимых процессов. Из директории с торговым роботом нужно выполнить следующее:
```
pm2 start pm2.config.js
```

Для сохранения списка процессов на случай перезапуска ОС:
```
pm2 save
```

После этого остановка/старт/перезапуск всех трёх процессов делается такими командами в консоли:
```
pm2 stop pm2.config.js
pm2 start pm2.config.js
pm2 restart pm2.config.js
```

Остановка/старт/перезапуск отдельного процесса:
```
pm2 stop pm2.config.js --only telegram
pm2 start pm2.config.js --only telegram
pm2 restart pm2.config.js --only telegram

pm2 stop pm2.config.js --only grpc
pm2 start pm2.config.js --only grpc
pm2 restart pm2.config.js --only grpc

pm2 stop pm2.config.js --only bot1
pm2 start pm2.config.js --only bot1
pm2 restart pm2.config.js --only bot1
```

По желанию можно в файле `settings/bot1-indicators.json` вписать циферки индикаторов, чтобы робот не ждал 200 свечек. Для этого нужно сначала остановить робота `pm2 stop pm2.config.js --only bot1`, затем вписать циферки, и запустить робота `pm2 stop pm2.config.js --only bot1`.

#### Команды в чате для торгового бота

Список команд
```
help
h
```

Добавить инструмент
```
add ticker TQBR.SBER
```

Удалить инструмент
```
delete ticker SBER
```

Остановить/возобновить покупки/продажи
```
stop buy
start buy
stop sell
start sell
```

Остановить/возобновить покупки и продажи глобально
```
stop
start
```

Остановить/возобновить отдельный инструмент
```
stop SBER
start SBER
stop buy SBER
start buy SBER
stop sell SBER
start sell SBER
```

Установить стоп-лосс/тейк-профит 5% для робота (глобально)
```
sl 5
tp 5
```

Установить стоп-лосс/тейк-профит 5% для отдельного инструмента
```
sl SBER 5
tp SBER 5
```

Купить/продать бумагу встречным лимитным ордером
```
buy SBER
sell SBER
```

Купить/продать бумагу по указанной цене 
```
buy SBER 234.56
sell SBER 234.56
```

Продать рублёвые/долларовые бумаги
```
sell rub
sell usd
```

Продать бумаги с результатом >= +5%
```
sell 5
```

Продать все бумаги, купленные роботом
```
sell *
```

Просмотр бумаг в портфеле
```
portfolio
p
```

Список отслеживаемых бумаг
```
list
l
```

Список ордеров
```
orders
o
```

Установить максимальный размер одной позиции для RUB/USD
```
max rub 5000
max usd 100
```

Список настроек робота
```
settings
```

### Обновление

Скачать новые `.proto` файлы можно [по этой ссылке](https://github.com/FinamWeb/trade-api-docs/tree/master/contracts). Затем их нужно поместить в папку `contracts-finam`. 

После обновления `.proto` файлов или менеджера подписок `grpc.js` нужно перезапустить его командой в консоли `pm2 restart pm2.config.js --only grpc`.

После изменения торгового робота `bot1.js` нужно перезапустить его командой в консоли `pm2 restart pm2.config.js --only bot1`.

### Интеграция

Для внедрения собственной стратегии в этого робота, нужно в файле `bot1.js` изменить функцию `update_indicators()` для торговли по свечам, или изменить функцию `event_orderbook()` для торговли по стакану.

Можно склонировать торгового робота и применять две и более стратегии одновременно. 
Для этого нужно:
1. скопировать файл `bot1.js` и назвать, например, `bot2.js`;
2. изменить в этом файле переменную `redis_prefix` на что-нибудь вроде `'bot2'`;
3. создать для него отдельную группу в Telegram;
4. добавить в эту группу ранее созданного Telegram-бота;
5. вписать id группы в конфигурационный файл `config.js` аналогично `bot1`, например, `bot2: -123456789,`;
6. создать ещё одну секцию в конфигурационном файле PM2 `pm2.config.js` аналогично секции для `bot1`;
7. запустить торгового робота командой в консоли `pm2 start pm2.config.js --only bot2`.

Готово! Два торговых робота работают одновременно.

Присмотритесь к [индикатору](https://t.me/spxspy) перепроданности/перекупленности индекса SP500, чтобы создать свою стратегию торговли американскими бумагами. Он предсказывает будущее! 
