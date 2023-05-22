# Finambotik

Робот для алгоритмической торговли, подключаемый к Финам TradeAPI.
Управляется через телеграм и минимальные базовые настройки в конфигурационном файле.

Легко масштабируется. Для этого в отдельный процесс вынесен диспетчер подписок на стримы котировок.

Для работы робота понадобится [NodeJS](https://nodejs.org/en/download), [Redis](https://redis.io/docs/getting-started/) и менеджер процессов по желанию, например [PM2](https://pm2.keymetrics.io/docs/usage/quick-start/).

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

Нужно создать телеграм-бота через [@BotFather](https://t.me/BotFather). Запомнить сгенерированный токен, разрешить добавление в группу (чат) и отключить приватный режим, чтобы телеграм-бот имел доступ к сообщениям в группе.
Добавить его в новую группу, в которой будут отправляться команды торговому роботу.
 
#### Конфигурация

В файле `config.js` вписать свои логин, токен и id брокерского счёта. Это может быть как пустой счёт, так и счёт с бумагами на балансе. Робот будет закрывать только свои позиции в рамках своей стратегии.
Также вписать токен телеграм-бота и id группы. Поменять `production` на 1.
В директории с торговым роботом выполнить установку пакетов:
```
npm install
```

### Запуск

3 раздельных процесса отвечают каждый за свою задачу:
Телеграм за чат и команды, диспетчер подписок раздаёт ботам только необходимые подписки, и сам робот за алгоритм и рассчёты. 
Их можно стартануть по отдельности:
```
node telegram.js
node grpc.js
node bot1.js
```

Но я предпочитаю использовать процесс-менеджер. Из директории с торговым роботом нужно выполнить следующее:
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

Остановка/старт/перезапуск одного процесса:
```
pm2 stop pm2.config.js --only bot1
pm2 start pm2.config.js --only bot1
pm2 restart pm2.config.js --only bot1
```

По желанию можно в файле `settings/bot1-indicators.json` вписать циферки индикаторов, чтобы робот не ждал 200 свечек.

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

Остановить/возобновить всё
```
stop
start
```

Остановить/возобновить один инструмент
```
stop SBER
start SBER
stop buy SBER
start buy SBER
stop sell SBER
start sell SBER
```

Установить стоп-лосс/тейк-профит 5% для робота
```
sl 5
tp 5
```

Установить стоп-лосс/тейк-профит 5% для одного инструмента
```
sl SBER 5
tp SBER 5
```

Купить/продать бумагу встречной заявкой
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

Продать все бумаги
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

В `.proto` файлах в папке `contracts-finam` были скорректированы пути в секциях `import`. Поэтому в будущем после обновления `.proto` файлов необходимо перепроверить эти пути. Скачать новые можно [по этой ссылке](https://github.com/FinamWeb/trade-api-docs/tree/master/contracts).

