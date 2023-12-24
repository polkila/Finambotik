'use strict';
process.on('uncaughtException', console.error);

const config = require('./config');
const func = require('./func');
const redis = require('redis');
const redisClient = redis.createClient();
const TeleBot = require('telebot');

const bot = new TeleBot({
	token: config.telegram.token, // Required. Telegram Bot API token.
	polling: { // Optional. Use polling.
		//interval: 1000, // Optional. How often check updates (in ms).
		//timeout: 0, // Optional. Update polling timeout (0 - short polling).
		//limit: 100, // Optional. Limits the number of updates to be retrieved.
		retryTimeout: 1000, // Optional. Reconnecting timeout (in ms).
		//proxy: 'http://username:password@yourproxy.com:8080' // Optional. An HTTP proxy to be used.
	},
	//usePlugins: ['askUser'], // Optional. Use user plugins from pluginFolder.
});

const production = config.production || 0;


function get_chat_id(channel){
	return production ? (config.telegram.chat_id[channel]||config.telegram.chat_id.private) : (config.telegram.chat_id.sandbox||config.telegram.chat_id.private);
}

const chat_id_channel_name = func.swapKeyValue(config.telegram.chat_id);
function get_prefix(chat_id){
	return chat_id_channel_name[chat_id] || null;
}


/*
* Передача сообщений от телеграм в бота
* */


/*bot.on(['/!*', '*'], function(msg, props){
	let prefix = get_prefix(msg.chat.id);
	if (!prefix){
		let chat_id = get_chat_id('private');
		bot_queue_add(chat_id, function(){
			return bot.sendMessage(chat_id, JSON.stringify(msg, null, 4));
		});
	}
});*/



// command
// help
// settings
// s
// portfolio
// p
// list
// l
// orders
// o
// help
// h
// history
// resubscribe
// shutdown
bot.on(/^\s*(help|portfolio|p|settings|s|history|h|list|l|orders|o|resubscribe|shutdown)\s*$/i, function(msg, props){
	let prefix = get_prefix(msg.chat.id);
	if (prefix){
		const cmd = props.match[1].toLowerCase();
		redisClient.publish(prefix+'-cmd', JSON.stringify({cmd: cmd}));
	}
});


// command [float|percent]
// show 1
// show 1%
// tp 1
// sl 1
// max rub 5000
// max usd 100
bot.on(/^\s*(show|tp|sl|max rub|max usd)\s*(-?[0-9.,]+)%?\s*$/i, function(msg, props){
	let prefix = get_prefix(msg.chat.id);
	if (prefix){
		const cmd = props.match[1].toLowerCase();
		const value = parseFloat(props.match[2].replace(/[.,]+/img, '.'));
		redisClient.publish(prefix+'-cmd', JSON.stringify({cmd: cmd, value: value}));
	}
});


// command [symbol]
// show sber
// settings sber
// stat sber
// add ticker TQBR.SBER
// delete ticker sber
// delete position sber
// cancel sber
// resubscribe sber
bot.on(/^\s*(show|settings|stat|add ticker|delete ticker|delete position|resubscribe|cancel)\s+([a-z.\- *]+)\s*$/i, function(msg, props){
	let prefix = get_prefix(msg.chat.id);
	if (prefix){
		const cmd = props.match[1].toLowerCase();
		const symbol = props.match[2].toUpperCase();
		redisClient.publish(prefix+'-cmd', JSON.stringify({cmd: cmd, symbol: symbol}));
	}
});


// command [action] [symbol]
// stop
// stop buy
// stop trade
// stop buy sber
// stop trade sber
// stop *
// stop buy *
// start
// start buy
// start trade
// start buy sber
// start trade sber
// start *
// start buy *
bot.on(/^\s*(stop|start)\s*(trade|buy|sell)?\s*([a-z.\-* ]+)?\s*$/i, function(msg, props){
	let prefix = get_prefix(msg.chat.id);
	if (prefix){
		const cmd = props.match[1].toLowerCase();
		const option = (props.match[2]||'trade').toLowerCase();
		const symbol = (props.match[3]||'').toUpperCase()||null;
		redisClient.publish(prefix+'-cmd', JSON.stringify({cmd: cmd, option: option, symbol: symbol}));
	}
});


// command [*|usd|rub|target_percent]
// sell 2
// sell -2
// sell *
// sell usd
// sell rub
bot.on(/^\s*(sell)\s+(-?[0-9.,]+|\*|usd|rub)\s*$/i, function(msg, props){
	let prefix = get_prefix(msg.chat.id);
	if (prefix){
		const cmd = props.match[1].toLowerCase();
		const percent = parseFloat(props.match[2].replace(/[.,]+/img, '.'));
		const option = /^\*|usd|rub$/.test(props.match[2]) ? props.match[2].toLowerCase() : null;
		redisClient.publish(prefix+'-cmd', JSON.stringify({cmd: cmd, percent: percent, option: option}));
	}
});


// command [symbol] [price] [target_price|target_percent]
// buy sber
// buy sber 120
// buy sber 120 125
// buy sber 120 5%
// sell sber
// sell sber 120
bot.on(/^\s*(buy|sell)\s+([a-z.]+)\s*([0-9.,]+)?\s*([0-9.,]+%?)?\s*$/i, function(msg, props){
	let prefix = get_prefix(msg.chat.id);
	if (prefix){
		const cmd = props.match[1].toLowerCase();
		const symbol = props.match[2].toUpperCase();
		const price = props.match[3] ? parseFloat(props.match[3].replace(/[.,]+/img, '.')) : null;
		const target = props.match[4] ? props.match[4].replace(/[.,]+/img, '.') : null;
		redisClient.publish(prefix+'-cmd', JSON.stringify({cmd: cmd, symbol: symbol, price: price, target: target}));
	}
});


// command symbol [target_price|target_percent]
// tp sber 10
// sl sber -10
bot.on(/^\s*(tp|sl)\s+([0-9a-z.\- *]+)\s+([0-9.,]+%?)\s*$/i, function(msg, props){
	let prefix = get_prefix(msg.chat.id);
	if (prefix){
		const cmd = props.match[1].toLowerCase();
		const symbol = props.match[2].toUpperCase();
		const value = parseFloat(props.match[3].replace(/[.,]+/img, '.'));
		redisClient.publish(prefix+'-cmd', JSON.stringify({cmd: cmd, symbol: symbol, value: value}));
	}
});



/*
* Очередь сообщений
* */

const bot_queue = {};
const bot_queue_sending = {};

function bot_queue_add(id, fn){
	if (!bot_queue[id]) bot_queue[id] = [];
	bot_queue[id].push(fn);
	if (!bot_queue_sending[id]) bot_queue_send(id);
}

function bot_queue_send(id){
    if (bot_queue[id].length){
	    bot_queue_sending[id] = true;
	    (bot_queue[id].shift())();
	    setTimeout(bot_queue_send,3000, id);
    }else{
	    bot_queue_sending[id] = false;
    }
}



/*
* Передача сообщений от бота в телеграм
* */

const redisSub = redisClient.duplicate();
redisSub.subscribe('ftelegram-bot');

redisSub.on('message', function(channel, data){
	if (data && typeof(data)==='string'){
		try{
			data = JSON.parse(data);
		}catch(e){
			console.error(func.dateYmdHis(), 'telegram-bot: Error parse data', data, e);
		}

		if (data){
			if (!(data.cmd==='private' && (new Date).getHours()===9)){
				let chat_id = get_chat_id(data.cmd);
				let text = data.text.trim();
				if (chat_id && text){
					bot_queue_add(chat_id, function(){
						return bot.sendMessage(chat_id, text, {
							parseMode: 'Markdown',
							webPreview: false,
							notification: new Date().getHours()>=9,
						}).catch(function(e){
							console.error(func.dateYmdHis(), e, data);
						});
					});
				}
			}
		}
	}
});




// start
bot.start();
//bot.sendMessage(get_chat_id('private'), 'Telegram started!');
console.log(func.dateYmdHis(), 'telegram-bot', process.pid, 'started');



// stop gracefully
process.on('SIGINT SIGTERM', function(){
	redisSub.unsubscribe();
	redisSub.quit(function(){
		redisClient.quit(function(){
			console.log(func.dateYmdHis(), 'Worker', process.pid, 'closed Redis');
			console.log(func.dateYmdHis(), 'Worker', process.pid, 'stopped gracefully');
			process.exit(0);
		});
	});
});
