# Finambotik

Бот для алгоритмической торговли, подключаемый к Финам TradeAPI.
Управляется через телеграм и минимальные базовые настройки в конфигурационном файле.

Легко масштабируется. Для этого в отдельный процесс вынесен диспетчек подписок на стримы котировок.

Для работы бота понадобится [NodeJS](https://nodejs.org/en/download), [Redis](https://redis.io/docs/getting-started/) и менеджер процессов по желанию, например [PM2](https://pm2.keymetrics.io/docs/usage/quick-start/).

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
pm2 startup
```

#### Telegram

Нужно создать бота через [@BotFather](https://t.me/BotFather). Запомнить сгенерированный токен, разрешить добавление в группу (чат) и отключить приватный режим, чтобы бот имел доступ к сообщениям в группе.
Добавить его в новую группу, в которой будут отправляться команды торговому роботу.
 
#### Кофигурация

В файле config.js вписать свои логин, токен и id брокерского счёта.
Также вписать токен телеграм-бота и id группы.

#### Запуск

3 раздельных процесса отвечают каждый за свою задачу:
Телеграм за чат и команды, диспетчек подписок и сам робот за алгоритм и рассчёты. 
Их стартануть по отдельности:
```
node telegram.js
node grpc.js
node bot1.js
```

Но я предпочитаю использовать процесс менеджер. Из директории с торговым роботом нужно выполнить следующее:
```
pm2 start pm2.config.js
pm2 save
```

#### Команды в чате для торгового бота
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

Установить стоп-лосс/тейк-профит 5% для всех инструментов

```
sl 5
tp 5
```
Установить стоп-лосс/тейк-профит 5% для одного инструмента

```
sl SBER 5
tp SBER 5
```

Купить/продать бумагу по рыночной цене

```
buy SBER
sell SBER
```

Купить/продать бумагу по указанной цене 

```
buy SBER 234.56
sell SBER 234.56
```
