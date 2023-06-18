'use strict';
process.on('uncaughtException', console.error)


// config
const config = require('./config');
const production = config.production || 0;

let account = {
	api_url: config.finam.rest_url,
	api_token: config.finam.tokenReadOnly,
	account_id: config.finam.trade_id,
};


// settings
let redis_prefix = 'bot1';
if (production){
	account = {
		api_url: config.finam.rest_url,
		api_token: config.finam.token,
		account_id: config.finam.trade_id,
	};
}
let settings = {
	balance: {USD: 0, RUB: 0},
	max_position: {USD: 33, RUB: 3333}, // максимальный размер позиции
	min_price_offset: 3, // при повторной покупке, цена должна отличаться на 3% и более
	max_positions: 3, // количество покупок на 1 инструмент
	stop_buy: false,
	stop_sell: false,
	stop_loss: -99,
	take_profit: 99,
};

const func = require('./func');
const fs = require('fs');
const redis = require('redis');
const redisClient = redis.createClient();
const redisSub = redisClient.duplicate();


// tickers
let watch_tickers = {
	/*'SBER':{
		symbol: 'SBER',
		securityBoard: 'TQBR',
		securityCode: 'SBER',
		currency: 'RUB',
		lotSize: 1,
		decimals: 2,
		minStep: 0,
		candles: {
			'15min': [200, 1.2]
		},
	},*/
};


let data_indicators = {
	/*'GAZP': {
		'1min': {
			last_candle:{
				symbol: 'GAZP',
				interval: '1min',
				c: 0,
				time: 0,
			},
			ema:{
			},
		},
	},*/
};


let portfolio = {
	/*'GAZP': {
		symbol: 'GAZP',
		positions: {
			'1603190759785': {
				lots: 9,
				quantity: 9,
				buy_price: 100,
			},
		}
	}*/
};


function ticker_init(securityBoard, securityCode){
	const ticker = watch_tickers[securityCode];
	if (!settings.balance[ticker.currency]) settings.balance[ticker.currency] = 0;
	if (!ticker.minStep) ticker.minStep = 1;
	if (!ticker.decimals) ticker.decimals = 2;
	if (!ticker.quantity) ticker.quantity = 0;
	if (!portfolio[securityCode]) portfolio[securityCode] = {positions:{}};

	// candles
	if (!data_indicators[securityCode]) data_indicators[securityCode] = {};
	Object.keys(ticker.candles).forEach(function(interval){
		if (!data_indicators[securityCode][interval]) data_indicators[securityCode][interval] = {last_candle: {securityCode: securityCode, interval: interval, c: 0, time: ''}};
		//redisSub.subscribe('fcandle_'+securityCode+'_'+interval);
	});

	// subscribe
	setTimeout(ticker_subscribe,3333, securityBoard, securityCode);
}


function subscribe_all(){
	Object.keys(watch_tickers).forEach(function(symbol){
		ticker_subscribe(watch_tickers[symbol].securityBoard, watch_tickers[symbol].securityCode);
	});
	orders_lookup();
}



function ticker_subscribe(securityBoard, securityCode){
	redisClient.publish('fstream-cmd', JSON.stringify({cmd:'subscribe', orderbook: true, securityBoard: securityBoard, securityCode: securityCode}));
	redisSub.subscribe('forderbook_'+securityCode);
}



function market_is_open(ticker){
	const dateObj = new Date();
	const day = dateObj.getDay();
	const hours = dateObj.getHours();
	const minutes = dateObj.getMinutes();
	if (!((1<=day && day<=5) || (day===6 && hours<2))) return false;
	if (ticker.currency==='RUB'){ // Для Российских акций
		if ((0<=hours && hours<10) || (hours===18 && minutes>=45) || (hours===19 && minutes<5) || (hours===23 && minutes>=45)) return false; // не торговать между 23:45—10:00 и 18:40—19:05
	}else{
		if ((hours===1 && minutes>=45) || (2<=hours && hours<10)) return false; // не торговать между 1:45—7:01
	}
	return true;
}



function settings_save(cb){
	// settings
	fs.writeFile('settings/'+redis_prefix+'-settings.json', JSON.stringify(settings, null, 4), function(err){
		if (!err){
			//console.log('Saved settings');
		}else{
			console.error(func.dateYmdHis(), 'settings_save() ERROR save vars', err);
			console.log('settings: ', JSON.stringify(settings, null, 4));
			msg('settings_save() ERROR save settings');
		}

		// tickers
		fs.writeFile('settings/'+redis_prefix+'-tickers.json', JSON.stringify(watch_tickers, null, 4), function(err){
			if (!err){
				//console.log('Saved tickers');
				//console.log('tickers', JSON.stringify(tickers, null, 4));
			}else{
				console.error(func.dateYmdHis(), 'settings_save() ERROR save watch_tickers', err);
				console.log('tickers: ', JSON.stringify(watch_tickers, null, 4));
				msg('settings_save() ERROR save watch_tickers');
			}

			// portfolio
			fs.writeFile('settings/'+redis_prefix+'-portfolio.json', JSON.stringify(portfolio, null, 4), function(err){
				if (!err){
					//console.log('Saved portfolio');
				}else{
					console.error(func.dateYmdHis(), 'settings_save() ERROR save portfolio', err);
					console.log('portfolio: ', JSON.stringify(portfolio, null, 4));
					//msg('settings_save() ERROR save portfolio\n'+JSON.stringify(err, null, 4));
				}

				// indicators
				fs.writeFile('settings/'+redis_prefix+'-indicators.json', JSON.stringify(data_indicators, null, 4), function(err){
					if (!err){
						//console.log('Saved indicators');
					}else{
						console.error(func.dateYmdHis(), 'settings_save() ERROR save indicators', err);
						console.log('indicators: ', JSON.stringify(data_indicators, null, 4));
						msg('settings_save() ERROR save indicators');
					}

					if (cb) cb();
				});
			});
		});
	});
}



function settings_load(cb){
	// settings
	console.log('Loading settings');
	fs.readFile('settings/'+redis_prefix+'-settings.json', 'utf-8', function(err, data){
		if (!err && data){
			settings = func.mergeDeep({}, settings, JSON.parse(data.toString()));
		}else{
			console.error(func.dateYmdHis(), 'settings_load() ERROR load vars\n', err);
			console.log('settings: ', data);
			//msg('settings_load() ERROR load settings\n'+JSON.stringify(err, null, 4));
		}

		// watch_tickers
		console.log('Loading tickers');
		fs.readFile('settings/'+redis_prefix+'-tickers.json', 'utf-8', function(err, data){
			if (!err && data){
				watch_tickers = JSON.parse(data.toString());
			}else{
				console.error(func.dateYmdHis(), 'settings_load() ERROR load tickers\n', err);
				console.log('tickers: ', data);
				//msg('settings_load() ERROR load tickers\n'+JSON.stringify(err, null, 4));
			}

			// portfolio
			console.log('Loading portfolio');
			fs.readFile('settings/'+redis_prefix+'-portfolio.json', 'utf-8', function(err, data){
				if (!err && data){
					portfolio = JSON.parse(data.toString());
				}else{
					console.error(func.dateYmdHis(), 'settings_load() ERROR load portfolio\n', err);
					console.log('portfolio: ', data);
					//msg('settings_load() ERROR load portfolio\n'+JSON.stringify(err, null, 4));
				}

				// indicators
				console.log('Loading indicators');
				fs.readFile('settings/'+redis_prefix+'-indicators.json', 'utf-8', function(err, data){
					if (!err && data){
						data_indicators = JSON.parse(data.toString());
					}else{
						console.error(func.dateYmdHis(), 'settings_load() ERROR load indicators\n', err);
						console.log('indicators: ', data);
						//msg('settings_load() ERROR load indicators\n'+JSON.stringify(err, null, 4));
					}

					Object.keys(watch_tickers).forEach(function(securityCode){
						ticker_init(watch_tickers[securityCode].securityBoard, securityCode);
					});

					if (cb) cb();
				});
			});
		});
	});
}



function msg(text, _private){
	redisClient.publish('ftelegram-bot', JSON.stringify({cmd:_private?'private':redis_prefix, text:text}));
}



function msg_portfolio(){
	func.rest('get', '/api/v1/portfolio', {url:account.api_url, token:account.api_token, qs:{
			'clientId': account.account_id,
			'Content.IncludeCurrencies': true,
			'Content.IncludeMoney': true,
			'Content.IncludePositions': true,
			'Content.IncludeMaxBuySell': true,
		}}, function(err, req_body){
		//console.log('msg_portfolio() portfolio', 'err', err, 'body', JSON.stringify(req_body, null, 4));
		if (!err && req_body && req_body.data && req_body.data.positions){
			let totalSum = req_body.data.equity;

			let positions = [];
			req_body.data.positions.forEach(function(position){
				const ticker = watch_tickers[position.securityCode] || {symbol:position.securityCode};
				ticker.quantity = position.balance;
				const avg_price = position.averagePrice, price = func.correctFloat(position.currentPrice), result_percent = func.round((price-avg_price)/avg_price*100, 3)||0;
				positions.push(ticker.symbol+' '+ticker.quantity+' шт. '+price+' '+(result_percent>0?'+':'')+result_percent+'%');
			});

			req_body.data.money.forEach(function(item){
				if (item.currency.toUpperCase()==='RUB'){
					settings.balance.RUB = item.balance;
				}
				if (item.currency.toUpperCase()==='USD'){
					settings.balance.USD = item.balance;
				}
			});

			// список ордеров
			const buy_orders = [], sell_orders = [];
			Object.keys(portfolio).forEach(function(symbol){
				if (portfolio[symbol].positions) Object.keys(portfolio[symbol].positions).forEach(function(position_key){
					const position = portfolio[symbol].positions[position_key];
					if (position.buy_in_progress){
						buy_orders.push([position.quantity, '#'+symbol, position.buy_price].join(' '));
						// Исключим из доступных средств выставленные ордеры на покупку
						if (watch_tickers[symbol].currency==='RUB'){
							settings.balance.RUB -= position.buy_price * position.quantity;
						}else{
							settings.balance.USD -= position.buy_price * position.quantity;
						}
					}
					if (position.sell_in_progress){
						sell_orders.push([position.quantity, '#'+symbol, position.buy_price].join(' '));
					}
				});
			});

			settings.balance.RUB = func.round(settings.balance.RUB, 2);
			settings.balance.USD = func.round(settings.balance.USD, 2);

			// список выключенных
			let disabled_list = [];
			if (settings.stop_buy) disabled_list.push('Все покупки');
			if (settings.stop_sell) disabled_list.push('Все продажи');
			Object.keys(watch_tickers).forEach(function(symbol){
				const ticker = watch_tickers[symbol];
				let types = [];
				if (ticker.stop_buy) types.push('покупка'/*+' '+ticker.buy_price*/);
				if (ticker.stop_sell) types.push('продажа'/*+' '+ticker.sell_price*/);
				if (types.length) disabled_list.push(ticker.symbol+' '+types.join(' / '));
			});

			msg(func.round(totalSum, 2)+' RUB' +
				'\nДоступно: '+settings.balance.RUB +' RUB'+
				(positions.length?'\n\nПозиции:\n'+positions.join('\n'):'') +
				(!positions.length?'\n\nНет открытых позиций':'') +
				(sell_orders.length?'\n\nОрдер на продажу:\n'+sell_orders.join('\n'):'') +
				(buy_orders.length?'\n\nОрдер на покупку:\n'+buy_orders.join('\n'):'') +
				((disabled_list.length)?'\n\nВыключено:\n'+disabled_list.join('\n'):'') +
				''
			);
		}
	});
}



function orders_lookup(){
	func.rest('get', '/api/v1/orders', {url: account.api_url, token: account.api_token, qs:{
		ClientId: account.account_id,
		IncludeMatched: true,
		IncludeCanceled: true,
		IncludeActive: false,
	}}, function(err, req_body){
		if (!err && req_body && req_body.data && req_body.data.orders){
			const orders = {};
			req_body.data.orders.forEach(function(order){
				orders[order.transactionId] = order;
			});

			Object.keys(portfolio).forEach(function(securityCode){
				if (portfolio[securityCode].positions){
					Object.keys(portfolio[securityCode].positions).forEach(function(position_key){
						const position = portfolio[securityCode].positions[position_key];
						const order = orders[position.transaction_id];
						if (order && (position.buy_in_progress || position.sell_in_progress)){
							if (order.status==='Matched'){
								if (position.buy_in_progress){
									if (order.price < position.buy_price) position.buy_price = order.price;
									msg_bought(position_key, securityCode, position);
									delete position.buy_in_progress;
								}
								if (position.sell_in_progress){
									if (order.price > position.sell_price) position.sell_price = order.price;
									msg_sold(position_key, securityCode, func.mergeDeep({}, position));
									delete portfolio[securityCode].positions[position_key];
								}
							}
							if (order.status==='Cancelled'){
								msg('*Отменил '+(position.buy_in_progress?'покупку':'')+(position.sell_in_progress?'продажу':'')+'* '+position.quantity+' #'+securityCode);
								if (position.buy_in_progress){
									delete portfolio[securityCode].positions[position_key];
								}
								if (position.sell_in_progress){
									delete position.cancel_in_progress;
									delete position.sell_in_progress;
									delete position.sell_price;
									delete position.force_sell;
								}
							}
						}
					});
				}
			});
		}else{
			console.log('orders_lookup() err', err, 'req_body', JSON.stringify(req_body, null, 4));
		}
	});
}



function query_buy(clientOrderId, securityBoard, securityCode, lots, price, cb){
    console.log('query_buy()', clientOrderId, securityBoard, securityCode, lots, price);

	/*const params = {
		url: account.api_url, token: account.api_token, body: {
			"clientId": account.account_id,
			"securityBoard": securityBoard,
			"securityCode": securityCode,
			"buySell": "Buy",
			"quantity": lots,
			"useCredit": false,
			"price": price,
			"property": "PutInQueue",
			"condition": {
				"type": "Bid",
				"price": price,
				"time": (new Date()).toISOString()
			},
			"validBefore": {
				"type": "TillEndSession",
				//"time": "2023-03-02T07:25:11.226Z"
			}
		}
	};
    console.log('params', params.body);

    func.rest('post', '/api/v1/orders', params, function(err, req_body){
	    console.log('query_buy() post', 'err', err, 'req_body', req_body); // query_buy() post err null req_body undefined
	    cb(err, req_body);
    });*/

	redisClient.publish('fstream-cmd', JSON.stringify({
		cmd: 'NewOrder',
		securityBoard: securityBoard,
		securityCode: securityCode,
		clientOrderId: clientOrderId,
		direction: 'Buy',
		quantity: lots,
		price: price,
	}));
	cb(null, null);
}



function ticker_buy(securityBoard, securityCode, price, interval, force_buy, comment){
	const ticker = watch_tickers[securityCode];
	console.log(func.dateYmdHis(), 'ticker_buy()', ticker.symbol, price, interval, 'force_buy', force_buy);

	if (!settings.stop_buy && !ticker.stop_buy){
		if (market_is_open(ticker) || force_buy){
			if (!portfolio[securityCode]) portfolio[securityCode] = {symbol: ticker.symbol, positions: {}};

			const position_keys = Object.keys(portfolio[securityCode].positions);
			if (position_keys.length < settings.max_positions){
				let buy_price;
				if (price){ // цена указана вручную
					buy_price = price;
				}else{
					buy_price = ticker.buy_price;
				}
				const minstep = ticker.minStep / Math.pow(10, ticker.decimals);
				buy_price = func.correctFloat(Math.ceil(buy_price / minstep) * minstep); // округление до шага цены инструмента


				// поискать позиции, купленные по такой же цене +- min_price_offset
				let cancel = false; // не покупать
				position_keys.forEach(function(timestamp){
					const position = portfolio[securityCode].positions[timestamp];
					if (position.interval===interval){
						if (Math.abs(buy_price-position.buy_price)/position.buy_price*100 < settings.min_price_offset) cancel = true; // совпадение по buy_price
					}
				});

				if (!cancel){
					// подсчитать количество и лоты
					const max_pos = ticker.currency==='RUB' ? settings.max_position.RUB : settings.max_position.USD;
					let lots = Math.floor( max_pos / (ticker.lotSize * buy_price)) || 1;
					let quantity = lots * ticker.lotSize;

					// Проверка баланса
					if ((ticker.currency==='RUB' ? settings.balance.RUB : settings.balance.USD) > buy_price*quantity){
						const dateObj = new Date();
						const timestamp = dateObj.getTime();
						const position = {clientOrderId: timestamp, securityBoard: securityBoard, securityCode: securityCode, time: timestamp, date: func.dateYmdHis(), interval: interval, lots: lots, quantity: quantity, buy_price: buy_price, stop_loss: func.round(buy_price + buy_price / 100 * (ticker.stop_loss || settings.stop_loss), ticker.decimals || 2), buy_in_progress: timestamp, comment: comment || '', buy_comment: comment || ''};
						portfolio[securityCode].positions[position.time] = position;

						if (!production){
							msg_bought(timestamp, securityCode, position);
							delete position.buy_in_progress;
						}else{
							query_buy(timestamp, securityBoard, securityCode, position.lots, position.buy_price, function(err, req_body){
								msg(
									'Покупаю '+position.quantity+' #'+ticker.symbol+' *'+position.buy_price+'* '+interval+'\n'+
									func.markdown_escape(position.comment)
								);

								/*if (!err && req_body && req_body.data && req_body.data.transactionId){
									position.id = req_body.data.transactionId;
									console.log(func.dateYmdHis(), 'Limit-Buy', position.quantity, ticker.symbol, position.buy_price, interval);
									//setTimeout(orders_lookup, 999, true);
									ticker.buy_tries = 0;
								}else{
									const clear = function(){
										delete portfolio[securityCode].positions[position.time]; // удалить позицию
									};

									if ((err && err.code==='ESOCKETTIMEDOUT') || !req_body){
										ticker.buy_tries = (ticker.buy_tries || 0) + 1;
										if (ticker.buy_tries < 10){
											setTimeout(ticker_buy, 33333, securityBoard, securityCode, price, interval, force_buy, comment);
										}
										clear();
									}else{
										console.error(func.dateYmdHis(), 'Error buy', position.quantity, ticker.symbol, 'price', position.buy_price, interval, 'limit_down', ticker.limit_down, 'limit_up', ticker.limit_up);
										console.error('position', position);
										msg(
											'*Error buy* '+position.quantity+' #'+ticker.symbol+' ('+position.buy_price+') '+interval+'\n'+
											func.dateYmdHis()+'\n'+
											func.markdown_escape(JSON.stringify({err:err, req_body:req_body}, null, 4))+'\n'
										);
										setTimeout(clear, 3333);
									}
								}*/
							});
						}

					}else{
						console.error(func.dateYmdHis(), 'Cancel buy', quantity, ticker.symbol, buy_price, interval, 'out of balance');
						msg(
							'*Покупка* #'+ticker.symbol+' '+buy_price+' '+interval+'\n'+
							'Недостаточно средств.'
						);
					}

				}else{
					/*console.error(func.dateYmdHis(), 'Cancel buy', ticker.symbol, buy_price, interval, 'same price');
					msg(
						'*Сигнал на покупку* #'+ticker.symbol+' '+interval+'\n'+
						'Есть позиция в рамках '+settings.min_price_offset+'% от текущей цены.'
					);*/
				}

			}else{
				console.error(func.dateYmdHis(), 'Cancel buy', ticker.symbol, interval, 'out of limit');
				msg(
					'*Сигнал на покупку* #'+ticker.symbol+' '+interval+'\n'+
					'Достигнут лимит по инструменту.'
				);
			}

		}else{

			/*console.error(func.dateYmdHis(), 'Cancel buy', ticker.symbol, interval, 'disabled OR market closed');
			msg(
				'Сигнал на *покупку* #'+ticker.symbol+' '+interval+'\n'+
				'Сессия закрыта.'
			);*/

		}
	}
}



function msg_bought(timestamp, securityCode, position){
	const ticker = watch_tickers[securityCode];
	console.log(func.dateYmdHis(), 'Bought', position.quantity, ticker.symbol, position.buy_price);
	console.log(position);

	if (ticker.currency==='RUB'){
		settings.balance.RUB -= position.buy_price * position.quantity;
	}else{
		settings.balance.USD -= position.buy_price * position.quantity;
	}

	ticker.quantity += position.quantity;

	const buy_price = ticker.decimals ? func.round(position.buy_price, ticker.decimals) : position.buy_price;

	msg(
		'Купил '+position.quantity+' #'+ticker.symbol+' *'+buy_price+'* '+position.interval+'\n'+
		func.markdown_escape(position.comment)
	);

	//if (1 || production) msg_portfolio(ticker.currency==='RUB');
	settings_save();
}



function query_sell(clientOrderId, securityBoard, securityCode, lots, price, cb){
	console.log('query_sell()', clientOrderId, securityBoard, securityCode, lots, price);

	/*const params = {
		url: account.api_url, token: account.api_token, body: {
			"clientId": account.account_id,
			"securityBoard": securityBoard,
			"securityCode": securityCode,
			"buySell": "Sell",
			"quantity": lots,
			"useCredit": false,
			"price": price,
			"property": "PutInQueue",
			"condition": {
				"type": "Ask",
				"price": price,
				"time": (new Date()).toISOString()
			},
			"validBefore": {
				"type": "TillEndSession",
				//"time": "2023-03-02T07:25:11.226Z"
			}
		}
	};
	console.log('params', params.body);

	func.rest('post', '/api/v1/orders', params, function(err, req_body){
		console.log('query_buy() post', 'err', err, 'req_body', req_body); // query_buy() post err null req_body undefined
		cb(err, req_body);
	});*/

	redisClient.publish('fstream-cmd', JSON.stringify({
		cmd: 'NewOrder',
		securityBoard: securityBoard,
		securityCode: securityCode,
		clientOrderId: clientOrderId,
		direction: 'Sell',
		quantity: lots,
		price: price,
	}));
	cb(null, null);
}



function ticker_sell(securityBoard, securityCode, price, interval, force_sell, comment){
	const ticker = watch_tickers[securityCode];
	//console.log(func.dateYmdHis(), 'ticker_sell()', ticker.symbol, price, interval, 'force_sell', force_sell);

	if (!settings.stop_sell && !ticker.stop_sell){
		if (market_is_open(ticker) || force_sell){
			let sell_price;
			if (price){ // цена указана вручную
				sell_price = price;
			}else{ // встречная
				sell_price = ticker.sell_price;
			}

			if (portfolio[securityCode] && portfolio[securityCode].positions){
				Object.keys(portfolio[securityCode].positions).forEach(function(position_key){
					const position = portfolio[securityCode].positions[position_key];
					if (!position.buy_in_progress && !position.sell_in_progress){
						const profit_percent = (sell_price - position.buy_price) / position.buy_price * 100;
						if (!force_sell){ // если цена не указана вручную
							position.stop_loss = Math.max(position.stop_loss, func.round(sell_price + sell_price / 100 * (ticker.stop_loss || settings.stop_loss), ticker.decimals || 2)); // trailing stop
						}

						if (profit_percent >= Math.min(ticker.take_profit || settings.take_profit, settings.take_profit)
							|| profit_percent <= Math.max(ticker.stop_loss || settings.stop_loss, settings.stop_loss)
							|| sell_price <= position.stop_loss // trailing stop
							|| force_sell
						){
							interval = position.interval;
							position.sell_in_progress = Date.now();
							position.comment = ((position.comment || '') + '\n' + (comment || '')).trim();
							position.sell_comment = comment || '';

							if (sell_price <= position.stop_loss) sell_price = position.stop_loss; // stop-limit
							const minstep = ticker.minStep / Math.pow(10, ticker.decimals);
							sell_price = func.correctFloat(Math.floor(sell_price / minstep) * minstep); // округление до шага цены инструмента
							position.sell_price = sell_price;

							if (!production){
								msg_sold(position.sell_in_progress, securityCode, func.mergeDeep({}, position));
								delete portfolio[securityCode].positions[position_key];
							}else{
								query_sell(position_key, securityBoard, securityCode, position.lots, position.sell_price, function(err, req_body){
									msg(
										'Продаю '+position.quantity+' #'+ticker.symbol+' *'+position.sell_price+'* '+position.interval+'\n'+
										func.markdown_escape(position.comment)
									);

									/*if (!err && req_body && req_body.data && req_body.data.transactionId){
										position.id = req_body.data.transactionId;
										console.log(func.dateYmdHis(), 'Limit-Sell', position.quantity, ticker.symbol, position.sell_price, position.interval);

										//setTimeout(orders_lookup, 999, true);
										ticker.sell_tries = 0;
									}else{
										const clear = function(){
											delete position.sell_in_progress; // убрать флажок
											delete position.force_sell; // убрать флажок
											delete position.sell_price; // убрать флажок
										};

										if ((err && err.code==='ESOCKETTIMEDOUT') || !req_body){
											ticker.sell_tries = (ticker.sell_tries || 0) + 1;
											if (ticker.sell_tries < 10){
												setTimeout(ticker_sell, 33333, securityBoard, securityCode, price, interval, force_sell, comment);
											}
											clear();
										}else{
											console.error(func.dateYmdHis(), 'Error sell', position.quantity, ticker.symbol, 'price', position.sell_price, position.interval, 'limit_down', ticker.limit_down, 'limit_up', ticker.limit_up);
											console.error('position', position);
											msg(
												'*Error* sell '+position.quantity+' #'+ticker.symbol+' ('+position.sell_price+') '+position.interval+'\n'+
												func.markdown_escape(JSON.stringify({err:err, req_body:req_body}, null, 4))+'\n'+
												func.dateYmdHis()
											);
											setTimeout(clear, 3333); // 3 сек
										}
									}*/
								});
							}
						}
					}
				});
			}

		}else{

			/*console.error(func.dateYmdHis(), 'Cancel sell', ticker.symbol, interval, 'disabled OR market closed');
			msg(
				'Сигнал на *продажу* #'+ticker.symbol+' '+(interval||'')+'\n'+
				'Сессия закрыта.'
			);*/

		}
	}
}



function ticker_cancel(securityBoard, securityCode, position, force_cancel){
	const ticker = watch_tickers[securityCode];
	if (ticker && market_is_open(ticker) && position && position.transaction_id && !position.cancel_in_progress && ((position.cancel_tries||0)<3 || force_cancel)){
		position.cancel_in_progress = Date.now();
		position.cancel_tries = (position.cancel_tries||0) + 1;
		//msg('*Отмена* заявки #'+ticker.symbol+'\n'+func.markdown_escape(JSON.stringify(position, null, 4)));
		console.log('Cancel position', ticker.symbol, position);
		delete position.sell_price;

		redisClient.publish('fstream-cmd', JSON.stringify({
			cmd: 'CancelOrder',
			securityBoard: securityBoard,
			securityCode: securityCode,
			transaction_id: position.transaction_id,
		}));
	}
}



function msg_sold(timestamp, securityCode, position, _quantity){
	const ticker = watch_tickers[securityCode];
	const quantity = _quantity || position.quantity;
	console.log(func.dateYmdHis(), 'Sold', quantity, ticker.symbol, position.sell_price);
	console.log(position);

	if (ticker.currency==='RUB'){
		settings.balance.RUB += position.sell_price * quantity;
	}else{
		settings.balance.USD += position.sell_price * quantity;
	}

	ticker.quantity -= quantity;

	const sell_price = ticker.decimals ? func.round(position.sell_price, ticker.decimals) : position.sell_price;

	msg(
		'Продал '+quantity+' #'+ticker.symbol+' *'+sell_price+'* '+position.interval+'\n'+
		func.markdown_escape(position.comment)
	);

	//if (1 || production) msg_portfolio(ticker.currency==='RUB');
	settings_save();
}



function update_indicators(candle){
	const ticker = watch_tickers[candle.securityCode];

	if (ticker.candles[candle.interval]){
		const vars = data_indicators[candle.securityCode][candle.interval];

		const prev_ema200 = vars.ema200 && vars.ema200.EMAvalue;
		const prev_ema12 = vars.ema12 && vars.ema12.EMAvalue;
		const prev_ema26 = vars.ema26 && vars.ema26.EMAvalue;
		const prev_macd_slow = vars.ema26 && vars.ema26.EMAvalue;

		// EMA 200
		const ema200 = new func.EMA(ticker.candles[candle.interval][0], vars.ema200);
		ema200.addPoint(candle.timestamp, candle.c);
		vars.ema200 = ema200.getVars();

		// EMA 12
		const ema12 = new func.EMA(12, vars.ema12);
		ema12.addPoint(candle.timestamp, candle.c);
		vars.ema12 = ema12.getVars();

		// EMA 26
		const ema26 = new func.EMA(26, vars.ema26);
		ema26.addPoint(candle.timestamp, candle.c);
		vars.ema26 = ema26.getVars();

		if (vars.ema12.EMAvalue && vars.ema26.EMAvalue){
			const macd_fast = vars.ema12.EMAvalue-vars.ema26.EMAvalue;
			// EMA 9
			const ema9 = new func.EMA(9, vars.ema9);
			ema9.addPoint(candle.timestamp, macd_fast);
			vars.ema9 = ema9.getVars();
			const macd_slow = vars.ema9.EMAvalue;

			if (macd_slow && prev_ema200 && vars.ema200.EMAvalue){ // посчитались MacD и медленная Ema
				if (prev_ema200 < vars.ema200.EMAvalue){
					const price_close = (candle.c-vars.ema200.EMAvalue)/vars.ema200.EMAvalue*100;
					if (prev_ema12 && prev_ema26 && prev_macd_slow){
						const prev_macd_fast = prev_ema12-prev_ema26;
						if (prev_macd_fast < prev_macd_slow && macd_fast > macd_slow && macd_fast < 0 && macd_slow < 0){
							if (price_close <= ticker.candles[candle.interval][1]){
								// buy
								vars.last_signal = 'buy';
								vars.last_signal_at = func.dateYmdHis();
								if (!settings.stop_buy && !ticker.stop_buy){
									ticker_buy(ticker.securityBoard, ticker.securityCode, ticker.buy_price, candle.interval, false);
								}else{
									msg(
										'Сигнал на *покупку* #'+ticker.symbol+' *'+ticker.buy_price+'* '+candle.interval+'\n'+
										'Выключена покупка'
									);
								}
							}
						}
					}
				}

				// sell
				if (0){ // здесь можно придумать условия, при выполнении которых возникнет сигнал на продажу; а пока что продажа происходит по СЛ и ТП
					vars.last_signal = 'sell';
					vars.last_signal_at = func.dateYmdHis();
					if (!settings.stop_sell && !ticker.stop_sell){
						ticker_sell(ticker.securityBoard, ticker.securityCode, ticker.sell_price, candle.interval, false);
					}else{
						msg(
							'Сигнал на *продажу* #'+ticker.symbol+' *'+ticker.sell_price+'* '+candle.interval+'\n'+
							'Выключена продажа'
						);
					}
				}
			}
		}
	}
}



function event_candle(data){}



function event_orderbook(data){
	if (data.payload.bids && data.payload.asks && data.payload.bids[0] && data.payload.bids[0].price && data.payload.asks[0] && data.payload.asks[0].price){
		const ticker = watch_tickers[data.payload.security_code];
		//ticker.last_price = ?;
		ticker.buy_price = func.correctFloat(data.payload.asks[0].price);
		ticker.sell_price = func.correctFloat(data.payload.bids[0].price);

		if (!settings.stop_sell && !ticker.stop_sell){
			ticker_sell(ticker.securityBoard, ticker.securityCode, ticker.sell_price, null, false);
		}

		const dateObj = new Date(), hours = dateObj.getHours(), minutes = dateObj.getMinutes();
		dateObj.setSeconds(0, 0);
		const time = dateObj.toISOString();
		Object.keys(ticker.candles).forEach(function(interval){
			const vars = data_indicators[data.payload.security_code] && data_indicators[data.payload.security_code][interval];
			const interval_minutes = func.interval_to_minutes(interval);
			if (vars && (hours*60+minutes)%interval_minutes===0 && vars.last_candle.time < time){
				vars.last_candle = {securityCode: data.payload.security_code, interval: interval, c: func.round((ticker.buy_price+ticker.sell_price)/2, ticker.decimals), time: time, timestamp: dateObj.getTime()};
				update_indicators(vars.last_candle);
				//console.log(time);
				//console.log('new candle', vars.last_candle);
			}
		});
	}
}



function get_securities(cb){
    func.cachedJSONfile('cache/securities-finam.json', 600*1000/*10 min*/, function(err, json_data){
        if (!err && json_data){
            cb(err, json_data);
        }else{
			func.rest('get', '/api/v1/securities', {url: account.api_url, token: account.api_token, qs:{}}, function(err, req_body){
				if (!err && req_body && req_body.data && req_body.data.securities && req_body.data.securities.length){
					func.writeJSONfile('cache/securities-finam.json', req_body.data.securities, function(err){
						cb(null, req_body.data.securities);
					});
				}else{
					console.log(func.dateYmdHis(), 'get /api/v1/securities');
					console.log('err', err, 'req_body', req_body);
					msg('Не удалось получить список инструментов');
				}
			});
        }
    });
}



redisSub.on('message', function(channel, data){
	//console.log(channel, data);

	if (data && typeof(data)==='string'){

		try{
			data = JSON.parse(data);
		}catch(e){
			console.error(func.dateYmdHis(), redis_prefix+': Error parse data', data, e);
		}

		if (data && typeof(data)==='object'){


			/* COMMANDS */

			if (channel==='fbots-cmd'){
				if (data.cmd==='resubscribe'){
					setTimeout(subscribe_all, 1111);
				}

				if (data.event==='NewOrder'){
					if (data.response && data.response.security_code && portfolio[data.response.security_code] && portfolio[data.response.security_code].positions){
						const position = portfolio[data.response.security_code].positions[data.clientOrderId];
						if (position){
							position.transaction_id = data.response.transaction_id;
						}
					}
					if (data.error){
						console.log(func.dateYmdHis(), 'NewOrder error', JSON.stringify(data.error, null, 4));
						const position = portfolio[data.security_code] && portfolio[data.security_code].positions && portfolio[data.security_code].positions[data.clientOrderId];
						if (position){
							if (position.buy_in_progress){
								delete portfolio[data.security_code].positions[data.clientOrderId];
							}
							if (position.sell_in_progress){
								delete position.sell_in_progress;
								delete position.sell_price;
								delete position.force_sell;
							}
						}
						if (data.error.details && data.error.details.indexOf('enough coverage')){
							msg('Недостаточно средств, необходимо'+data.error.details.split('need').pop());
						}else{
							msg(func.markdown_escape(JSON.stringify(data.error, null, 4)));
						}
					}
				}

				if (data.event==='CancelOrder'){
					if (data.error){
						console.log(func.dateYmdHis(), 'CancelOrder error', JSON.stringify(data.error, null, 4));
						msg(func.markdown_escape(JSON.stringify(data.error, null, 4)));
					}
				}

				if (data.event==='order'){
					if (data.payload && data.payload.transaction_id && (data.payload.status==='ORDER_STATUS_MATCHED'||data.payload.status==='ORDER_STATUS_CANCELLED') && portfolio[data.payload.security_code] && portfolio[data.payload.security_code].positions){
						Object.keys(portfolio[data.payload.security_code].positions).forEach(function(position_key){
							const position = portfolio[data.payload.security_code].positions[position_key];
							if (position.transaction_id===data.payload.transaction_id){
								if (data.payload.status==='ORDER_STATUS_MATCHED'){
									if (position.buy_in_progress){
										if (data.payload.price < position.buy_price) position.buy_price = data.payload.price;
										msg_bought(position_key, data.payload.security_code, position);
										delete position.buy_in_progress;
									}
									if (position.sell_in_progress){
										if (data.payload.price > position.sell_price) position.sell_price = data.payload.price;
										msg_sold(position_key, data.payload.security_code, func.mergeDeep({}, position));
										delete portfolio[data.payload.security_code].positions[position_key];
									}
								}
								if (data.payload.status==='ORDER_STATUS_CANCELLED'){
									msg('*Отменил '+(position.buy_in_progress?'покупку':'')+(position.sell_in_progress?'продажу':'')+'* '+position.quantity+' #'+data.payload.security_code);
									if (position.buy_in_progress){
										delete portfolio[data.payload.security_code].positions[position_key];
									}
									if (position.sell_in_progress){
										delete position.cancel_in_progress;
										delete position.sell_in_progress;
										delete position.sell_price;
										delete position.force_sell;
									}
								}
							}
						});
					}
				}
			}


			if (channel===redis_prefix+'-cmd'){
				console.log('Redis', channel, data);

				if (data.symbol && data.symbol!=='*'){ // операция с инструментом

					const symbols = data.symbol.trim().split(/\s+/);

					// добавить инструмент
					// add ticker [symbol]
					if (data.cmd==='add ticker'){
						get_securities(function(err, securities){
							if (!err && securities){
								let added_count = 0;
								securities.forEach(function(ticker){
								    if (symbols.includes(ticker.board+'.'+ticker.code)){
								    	//console.log(ticker);
									    const add_ticker = {symbol: ticker.code};
									    add_ticker.securityCode = ticker.code;
									    add_ticker.securityBoard = ticker.board;
									    add_ticker.name = ticker.shortName;
									    add_ticker.lotSize = ticker.lotSize;
									    add_ticker.currency = ticker.currency==='RUR' ? 'RUB' : ticker.currency;
									    add_ticker.decimals = ticker.decimals;
									    add_ticker.minStep = ticker.minStep;
									    if (!watch_tickers[ticker.code]){
									    	add_ticker.candles = {'15min': [200,1.2]};
										    add_ticker.added = Date.now();
										    watch_tickers[ticker.code] = add_ticker;
										    msg('Добавил #'+ticker.code+'\n'+ticker.shortName+'\nЛотность '+add_ticker.lotSize+'\nВалюта '+add_ticker.currency+'\nШаг цены '+(add_ticker.minStep/Math.pow(10, add_ticker.decimals)));
									    }else{
										    add_ticker.updated = Date.now();
										    watch_tickers[ticker.code] = func.mergeDeep(watch_tickers[ticker.code], add_ticker);
										    msg('Обновил #'+ticker.code+'\n'+ticker.shortName+'\nЛотность '+add_ticker.lotSize+'\nВалюта '+add_ticker.currency+'\nШаг цены '+(add_ticker.minStep/Math.pow(10, add_ticker.decimals)));
									    }
									    ticker_init(ticker.board, ticker.code);
									    added_count++;
								    }
								});
								if (added_count){
									settings_save();
								}else{
									msg('Инструмент не найден в TradeAPI');
								}
							}
						});
					}


					// удалить инструмент
					// delete ticker [symbol]
					if (data.cmd==='delete ticker'){
						if (watch_tickers[data.symbol]){
							if (portfolio[data.symbol] && portfolio[data.symbol].positions && Object.keys(portfolio[data.symbol].positions).length){
								msg('Не могу удалить #'+data.symbol+': открыта позиция или выставлен ордер');
							}else{
								delete watch_tickers[data.symbol];
								delete portfolio[data.symbol];
								delete data_indicators[data.symbol];
								msg('Удалил инструмент #'+data.symbol);
								settings_save();
							}
						}
					}

					// переподписаться на инструмент
					// resubscribe [symbol]
					if (data.cmd==='resubscribe'){
						const ticker = watch_tickers[data.symbol];
						if (ticker){
							msg('Подписываюсь заново на котировки #'+data.symbol);
							redisClient.publish('fstream-cmd', JSON.stringify({cmd: data.cmd, symbol: data.symbol, securityBoard: ticker.securityBoard, securityCode: ticker.securityCode}));
						}
					}

					// купить инструмент
					// buy [symbol] [buy_price]
					if (data.cmd==='buy'){
						const ticker = watch_tickers[data.symbol];
						if (ticker){
							ticker_buy(ticker.securityBoard, ticker.securityCode, parseFloat(data.price)||null, Object.keys(ticker.candles).shift(),true);
							console.log('Buying position', data.symbol);
							console.log('ticker_buy()', data.symbol, data.symbol, 'price', data.price);
						}else{
							msg('Инструмент #'+data.symbol+' не добавлен в тратегию. Отправьте команду добавления, например:\nadd ticker TQBR.SBER');
						}
					}

					// продать инструмент
					// sell [symbol]
					// sell [symbol] [sell_price]
					if (data.cmd==='sell'){
						const ticker = watch_tickers[data.symbol];
						if (ticker && portfolio[data.symbol] && portfolio[data.symbol].positions){
							console.log('Selling position', portfolio[data.symbol].positions);
							ticker_sell(ticker.securityBoard, ticker.securityCode, parseFloat(data.price)||null, null, true);
						}else{
							msg('В стратегии нет открытых позиций #'+data.symbol);
						}
					}

					// отменить последний ордер
					// cancel [symbol]
					if (data.cmd==='cancel' && production){
						const ticker = watch_tickers[data.symbol];
						if (ticker && portfolio[data.symbol] && portfolio[data.symbol].positions){
							let cancel_position = null;
							Object.keys(portfolio[data.symbol].positions).forEach(function(position_key){
								const position = portfolio[data.symbol].positions[position_key];
								if (position.buy_in_progress || position.sell_in_progress){
									if (position.transaction_id && !position.cancel_in_progress) cancel_position = position;
								}
							});
							if (cancel_position){
								ticker_cancel(ticker.securityBoard, ticker.securityCode, cancel_position, true);
							}else{
								msg('Нет активной заявки #'+ticker.symbol);
							}
						}
					}

					// показать позиции по инструменту
					// show [symbol]
					if (data.cmd==='show'){
						const ticker = watch_tickers[data.symbol];
						if (ticker && portfolio[data.symbol] && portfolio[data.symbol].positions){
							let position_keys = Object.keys(portfolio[data.symbol].positions), positions = [];
							if (position_keys.length){
								let quantity = 0, result = 0;
								position_keys.forEach(function(position_key, n){
									const position = portfolio[data.symbol].positions[position_key];
									position.date = func.dateYmdHis(position.time);
									if (ticker.sell_price){
										position.result = func.round((ticker.sell_price - position.buy_price) * position.quantity, 3);
										position.result_percent = func.round((ticker.sell_price - position.buy_price) / position.buy_price * 100, 3);
										if (!position.buy_in_progress){
											result += position.result;
											quantity += position.quantity;
										}
									}
									positions.push(position);
									if (positions.length>=10 || (n===position_keys.length-1 && positions.length>0)){
										msg(
											'#'+data.symbol+' '+(ticker.sell_price||'')+'\n'+func.markdown_escape(JSON.stringify(positions, null, 4))
										);
										positions = [];
									}
								});
								ticker.quantity = quantity;
								msg(
									quantity+' шт. #'+data.symbol+' результат: '+func.round(result, 3)+'\n'+
									(ticker.stop_buy?'Выключена покупка\n':'')+
									(ticker.stop_sell?'Выключена продажа\n':'')
								);
							}else{
								msg('В стратегии нет открытых позиций #'+data.symbol);
							}
						}else{
							msg('В стратегии нет открытых позиций #'+data.symbol);
						}
					}

					// установить тейк-профит
					// tp [symbol] [float]
					if (data.cmd==='tp'){
						if (data.value || data.value===0){
							const ticker = watch_tickers[data.symbol];
							if (ticker){
								let txt = func.markdown_escape('#'+ticker.symbol+'\nold take_profit '+ticker.take_profit);
								ticker.take_profit = Math.abs(data.value) || 99;
								msg(txt+'\n'+func.markdown_escape('new take_profit '+ticker.take_profit));
								if (portfolio[data.symbol] && portfolio[data.symbol].positions){
									Object.keys(portfolio[data.symbol].positions).forEach(function(position_key){
										const position = portfolio[data.symbol].positions[position_key];
										position.target_percent = ticker.take_profit;
										position.take_profit = func.round(position.buy_price + position.buy_price/100*ticker.take_profit, ticker.decimals);
									});
								}
							}else{
								msg('Инструмент #'+data.symbol+' не добавлен с тратегию. Отправьте команду добавления, например:\nadd ticker TQBR.SBER');
							}
						}
					}

					// установить стоп-лосс
					// sl [symbol] [float]
					if (data.cmd==='sl'){
						if (data.value || data.value===0){
							const ticker = watch_tickers[data.symbol];
							if (ticker){
								let txt = func.markdown_escape('#'+ticker.symbol+'\nold stop_loss '+ticker.stop_loss);
								ticker.stop_loss = -Math.abs(data.value) || -99;
								msg(txt+'\n'+func.markdown_escape('new stop_loss '+ticker.stop_loss));
								if (portfolio[data.symbol] && portfolio[data.symbol].positions){
									Object.keys(portfolio[data.symbol].positions).forEach(function(position_key){
										const position = portfolio[data.symbol].positions[position_key];
										position.stop_loss = func.round(position.buy_price + position.buy_price/100*(ticker.stop_loss || settings.stop_loss), ticker.decimals);
									});
								}
							}else{
								msg('Инструмент #'+data.symbol+' не добавлен с тратегию. Отправьте команду добавления, например:\nadd ticker TQBR.SBER');
							}
						}
					}

					// удалить 1 позицию из инструмента
					// delete position [symbol]
					if (data.cmd==='delete position'){
						const ticker = watch_tickers[data.symbol];
						if (ticker && portfolio[data.symbol] && portfolio[data.symbol].positions){
							let min_buy_price = 0;
							let del_key = 0;
							if (1){ // убрать с наименьшим минусом
								Object.keys(portfolio[data.symbol].positions).forEach(function(position_key){ // найти позицию с самым незначительным убытком
									const position = portfolio[data.symbol].positions[position_key];
									position.result = func.round((ticker.sell_price - position.buy_price) * position.quantity, 3);
									position.result_percent = func.round((ticker.sell_price - position.buy_price) / position.buy_price * 100, 3);
									if (1||!position.buy_in_progress && !position.sell_in_progress){
										if (!min_buy_price || min_buy_price > position.buy_price){
											min_buy_price = position.buy_price;
											del_key = position_key;
										}
									}
								});
							}else{ // убрать последнюю
								del_key = Object.keys(portfolio[data.symbol].positions).pop();
							}
							if (del_key){
								console.log('Deleting position', data.symbol, portfolio[data.symbol].positions[del_key]);
								msg('Удаляю 1 позицию #'+data.symbol+'\n'+func.markdown_escape(JSON.stringify(portfolio[data.symbol].positions[del_key], null, 4)));
								delete portfolio[data.symbol].positions[del_key];
								//msg_portfolio();
							}else{
								msg('В стратегии нет открытых позиций #'+data.symbol);
							}
						}else{
							msg('В стратегии нет открытых позиций #'+data.symbol);
						}
					}

					// остановить/возобновить торговлю инструментом
					// stop [buy|sell|trade] [symbol]
					// start [buy|sell|trade] [symbol]
					if (data.cmd==='stop' || data.cmd==='start'){
						const ticker = watch_tickers[data.symbol];
						if (ticker){
							const rows = ['#'+data.symbol+' '+(ticker.last_price||'')];
							if (data.option==='trade' || data.option==='buy'){
								ticker.stop_buy = data.cmd==='stop';
								if (ticker.stop_buy) ticker.start_buy_at = false;
								rows.push((ticker.stop_buy?'Stop':'Start')+' buy');
							}
							if (data.option==='trade' || data.option==='sell'){
								ticker.stop_sell = data.cmd==='stop';
								if (ticker.stop_sell) ticker.stop_sell_at = false;
								rows.push((ticker.stop_sell?'Stop':'Start')+' sell');
							}
							msg(rows.join('\n'));
						}else{
							msg('Инструмент #'+data.symbol+' не добавлен с тратегию. Отправьте команду добавления, например:\nadd ticker TQBR.SBER');
						}
					}

					// показать настройки по инструменту
					// settings [symbol]
					if (data.cmd==='settings'){
						const ticker = watch_tickers[data.symbol];
						if (ticker){
							msg(
								'Settings #'+data.symbol+'\n'+func.markdown_escape(JSON.stringify(ticker, null, 4))
							);
							if (ticker.candles) Object.keys(ticker.candles).forEach(function(interval){
								msg(
									'Indicators #'+data.symbol+' '+interval+'\n'+func.markdown_escape(JSON.stringify(data_indicators[data.symbol][interval], null, 4))
								);
							});
						}else{
							msg('Инструмент #'+data.symbol+' не добавлен с тратегию. Отправьте команду добавления, например:\nadd ticker TQBR.SBER');
						}
					}

				}else{ // общая команда

					// показать список инструментов
					// list
					// l
					if (data.cmd==='list' || data.cmd==='l'){
						let rows = [], keys = Object.keys(watch_tickers);
						keys.forEach(function(symbol, n){
							const ticker = watch_tickers[symbol];
							const row = ['#'+ticker.symbol, func.round(ticker.sell_price, ticker.decimals)];
							Object.keys(ticker.candles).forEach(function(interval){
								row.push('interval', interval);
							});
							if (rows.push(row.join(' '))===10 || (rows.length && n===keys.length-1)){
								msg(rows.join('\n'));
								rows = [];
							}
						});
					}

					// показать список настроек
					// settings
					// s
					if (data.cmd==='settings' || data.cmd==='s'){
						msg('Settings\n'+func.markdown_escape(JSON.stringify(settings, null, 4)));
					}

					// показать список ордеров
					// orders
					// o
					if (data.cmd==='orders' || data.cmd==='o'){
						const list = ['Выставленные ордеры'];
						Object.keys(portfolio).forEach(function(symbol){
							if (portfolio[symbol].positions) Object.keys(portfolio[symbol].positions).forEach(function(position_key){
							    const position = portfolio[symbol].positions[position_key];
							    if (position.buy_in_progress || position.sell_in_progress){
								    list.push([position.buy_in_progress?'Покупка':'Продажа', position.quantity, '#'+symbol, position.buy_in_progress?position.buy_price:position.sell_price].join(' '));
							    }
							});
						});
						if (list.length>1){
							msg(list.join('\n'));
						}else{
							msg('Нет выставленных ордеров');
						}
					}

					// показать список команд
					// help
					// h
					if (data.cmd==='help' || data.cmd==='h'){
						msg('Список команд\n'+
							'```\n'+
							'help\n'+
							'h\n'+
							'```\n'+
							'\n'+
							'Добавить инструмент\n'+
							'```\n'+
							'add ticker TQBR.SBER\n'+
							'```\n'+
							'\n'+
							'Удалить инструмент\n'+
							'```\n'+
							'delete ticker SBER\n'+
							'```\n'+
							'\n'+
							'Остановить/возобновить покупки/продажи\n'+
							'```\n'+
							'stop buy\n'+
							'start buy\n'+
							'stop sell\n'+
							'start sell\n'+
							'```\n'+
							'\n'+
							'Остановить/возобновить всё\n'+
							'```\n'+
							'stop\n'+
							'start\n'+
							'```\n'+
							'\n'+
							'Остановить/возобновить один инструмент\n'+
							'```\n'+
							'stop SBER\n'+
							'start SBER\n'+
							'stop buy SBER\n'+
							'start buy SBER\n'+
							'stop sell SBER\n'+
							'start sell SBER\n'+
							'```\n'+
							'\n'+
							'Установить стоп-лосс/тейк-профит 5% для робота\n'+
							'```\n'+
							'sl 5\n'+
							'tp 5\n'+
							'```\n'+
							'\n'+
							'Установить стоп-лосс/тейк-профит 5% для одного инструмента\n'+
							'```\n'+
							'sl SBER 5\n'+
							'tp SBER 5\n'+
							'```\n'+
							'\n'+
							'Купить/продать бумагу встречной заявкой\n'+
							'```\n'+
							'buy SBER\n'+
							'sell SBER\n'+
							'```\n'+
							'\n'+
							'Купить/продать бумагу по указанной цене \n'+
							'```\n'+
							'buy SBER 234.56\n'+
							'sell SBER 234.56\n'+
							'```\n'+
							'\n'+
							'Продать рублёвые/долларовые бумаги\n'+
							'```\n'+
							'sell rub\n'+
							'sell usd\n'+
							'```\n'+
							'\n'+
							'Продать бумаги с результатом >= +5%\n'+
							'```\n'+
							'sell 5\n'+
							'```\n'+
							'\n'+
							'Продать все бумаги\n'+
							'```\n'+
							'sell *\n'+
							'```\n'+
							'\n'+
							'Просмотр бумаг в портфеле\n'+
							'```\n'+
							'portfolio\n'+
							'p\n'+
							'```\n'+
							'\n'+
							'Список отслеживаемых бумаг\n'+
							'```\n'+
							'list\n'+
							'l\n'+
							'```\n'+
							'\n'+
							'Список ордеров\n'+
							'```\n'+
							'orders\n'+
							'o\n'+
							'```\n'+
							'\n'+
							'Установить максимальный размер одной позиции для RUB/USD\n'+
							'```\n'+
							'max rub 5000\n'+
							'max usd 100\n'+
							'```\n'+
							'\n'+
							'Список настроек робота\n'+
							'```\n'+
							'settings\n'+
							'```');
					}

					// продать позиции usd или RUB
					// или продать позицию с доходом >= data.percent
					if (data.cmd==='sell'){
						// sell *
						// sell USD
						// sell RUB
						if (['*', 'usd', 'rub'].includes(data.option)){
							msg('Продаю '+data.option.toUpperCase()+' позиции');
							Object.keys(portfolio).forEach(function(symbol){ // найти все купленные инструменты
								if (portfolio[symbol].positions){
									const ticker = watch_tickers[symbol];
									if (ticker){
										if (data.option==='*' || (data.option==='rub' && ticker.currency==='RUB') || (data.option==='usd' && ticker.currency!=='RUB')){
											Object.keys(portfolio[symbol].positions).forEach(function(position_key){
												const position = portfolio[symbol].positions[position_key];
												if (!position.buy_in_progress && !position.sell_in_progress){
													position.force_sell = 1;
												}
											});
										}
										ticker_sell(ticker.securityBoard, ticker.securityCode, null, null, true);
									}
								}
							});
						}

						// sell 2
						// sell -2
						if (data.percent || data.percent===0){
							msg('Продаю позиции с результатом >= '+data.percent);
							Object.keys(portfolio).forEach(function(symbol){ // найти все купленные инструменты
								if (portfolio[symbol].positions){
									const ticker = watch_tickers[symbol];
									if (ticker){
										Object.keys(portfolio[symbol].positions).forEach(function(position_key){ // найти позицию с доходом >= data.percent
											const position = portfolio[symbol].positions[position_key];
											if (!position.buy_in_progress && !position.sell_in_progress){
												const percent = (ticker.sell_price-position.buy_price)/position.buy_price*100;
												if (percent >= data.percent){
													position.force_sell = 1;
												}
											}
										});
										ticker_sell(ticker.securityBoard, ticker.securityCode, null, null, true);
									}
								}
							});
						}
					}

					// установить глобальный тейк-профит
					// tp [float]
					if (data.cmd==='tp' && !data.symbol){
						if (data.value || data.value===0){
							let txt = func.markdown_escape('old take_profit '+settings.take_profit);
							settings.take_profit = Math.abs(data.value) || 99;
							msg(txt+'\n'+func.markdown_escape('new take_profit '+settings.take_profit));
						}
					}

					// установить тейк-профит для всех
					// tp * [float]
					if (data.cmd==='tp' && data.symbol==='*'){
						if (data.value || data.value===0){
							Object.keys(watch_tickers).forEach(function(symbol){
								const ticker = watch_tickers[symbol];
								ticker.take_profit = Math.abs(data.value) || 99;
							});
							msg(func.markdown_escape('* new take_profit '+Math.abs(data.value)));
						}
					}

					// установить глобальный стоп-лосс
					// sl [float]
					if (data.cmd==='sl' && !data.symbol){
						if (data.value || data.value===0){
							let txt = func.markdown_escape('old stop_loss '+settings.stop_loss);
							settings.stop_loss = -Math.abs(data.value) || -99;
							msg(txt+'\n'+func.markdown_escape('new stop_loss '+settings.stop_loss));
						}
					}

					// установить стоп-лосс для всех
					// sl * [float]
					if (data.cmd==='sl' && data.symbol==='*'){
						if (data.value || data.value===0){
							Object.keys(watch_tickers).forEach(function(symbol){
								const ticker = watch_tickers[symbol];
								ticker.stop_loss = -Math.abs(data.value) || -99;
								if (portfolio[symbol] && portfolio[symbol].positions){
									Object.keys(portfolio[symbol].positions).forEach(function(position_key){
										const position = portfolio[symbol].positions[position_key];
										position.stop_loss = func.round(position.buy_price + position.buy_price/100*(ticker.stop_loss || settings.stop_loss), ticker.decimals);
									});
								}
							});
							msg(func.markdown_escape('* new stop_loss '+(-Math.abs(data.value))));
						}
					}

					// установить максимальный размер позиции
					// max rub [float]
					if (data.cmd==='max rub'){
						if (data.value && data.value>0){
							let txt = func.markdown_escape('old max_position.RUB '+settings.max_position.RUB);
							settings.max_position.RUB = Math.abs(data.value);
							msg(txt+'\n'+func.markdown_escape('new max_position.RUB '+settings.max_position.RUB));
						}else{
							msg('Укажите размер позиции больше 0');
						}
					}

					// установить максимальный размер позиции
					// max usd [float]
					if (data.cmd==='max usd'){
						if (data.value && data.value>0){
							let txt = func.markdown_escape('old max_position.USD '+settings.max_position.USD);
							settings.max_position.USD = Math.abs(data.value);
							msg(txt+'\n'+func.markdown_escape('new max_position.USD '+settings.max_position.USD));
						}else{
							msg('Укажите размер позиции больше 0');
						}
					}

					// остановить/возобновить торговлю всеми инструментами
					// stop [buy|sell|trade] [*]
					// start [buy|sell|trade] [*]
					if (data.cmd==='stop' || data.cmd==='start'){
						if (data.symbol==='*'){ // каждый тикер
							Object.keys(watch_tickers).forEach(function(symbol){
								const ticker = watch_tickers[symbol];
								const rows = [];
								if (data.option==='trade' || data.option==='buy'){
									if (!ticker.stop_buy && data.cmd==='stop'){
										ticker.stop_buy = true;
										rows.push('Stop buy #'+ticker.symbol);
									}
									if (ticker.stop_buy && data.cmd==='start'){
										delete ticker.stop_buy;
										rows.push('Start buy #'+ticker.symbol);
									}
								}
								if (data.option==='trade' || data.option==='sell'){
									if (!ticker.stop_sell && data.cmd==='stop'){
										ticker.stop_sell = true;
										rows.push('Stop sell #'+ticker.symbol);
									}
									if (ticker.stop_sell && data.cmd==='start'){
										delete ticker.stop_sell;
										rows.push('Start sell #'+ticker.symbol);
									}
								}
								//if (rows.length) msg(rows.join('\n'));
							});
							msg(data.cmd+' '+data.option+' '+data.symbol);
						}else{ // GLOBAL
							const rows = [];
							if (data.option==='trade' || data.option==='buy'){
								settings.stop_buy = data.cmd==='stop';
								rows.push((settings.stop_buy?'Stop':'Start')+' buy GLOBAL');
							}
							if (data.option==='trade' || data.option==='sell'){
								settings.stop_sell = data.cmd==='stop';
								rows.push((settings.stop_sell?'Stop':'Start')+' sell GLOBAL');
							}
							if (rows.length) msg(rows.join('\n'));
						}
					}

					// информация по портфелю
					// portfolio
					// po
					if (data.cmd==='portfolio' || data.cmd==='p'){
						msg_portfolio();
					}

					// завершить процесс
					// shutdown
					if (data.cmd==='shutdown'){
						msg('Завершаю процесс');
						shutdown();
					}

				}

			}

			/* STREAM */

			if (data.event==='orderbook' || data.event==='order'){

				if (data.payload && data.payload.security_code){

					if (watch_tickers[data.payload.security_code]){
						//console.log(func.dateYmdHis(), data.event, watch_tickers[data.payload.security_code].symbol);

						// orderbook
						if (data.event==='orderbook'){

							event_orderbook(data);

							/*if (watch_tickers[data.payload.security_code].symbol==='GAZP'){
								console.log(func.dateYmdHis(), watch_tickers[data.payload.security_code].symbol, 'orderbook', data);
							}*/
						}else

						// trades
						if (data.event==='order'){

							//event_order_trades(data);

							/*if (watch_tickers[data.payload.security_code].symbol==='GAZP'){
								console.log(func.dateYmdHis(), watch_tickers[data.payload.security_code].symbol, 'order', data);
							}*/

						}else{

							console.error('ERROR: unrecognized data.event');
							console.error(func.dateYmdHis(), 'data', data);
							console.error();

						}

					}

				}else{

					console.error('ERROR: !data.payload.security_code');
					console.error(func.dateYmdHis(), 'data', data);
					console.error();

				}
			}

		}else{

			console.error('ERROR: data !object');
			console.error(func.dateYmdHis(), 'data', data);
			console.error();

		}

	}else{

		console.error('ERROR: redisSub on message: !data');
		console.error(func.dateYmdHis(), 'data:', typeof data, data);
		console.error();

	}

});



// Start
settings_load(function(){
	console.log('Loaded tickers:', JSON.stringify(watch_tickers, null, 4));
	console.log('Loaded indicators:', JSON.stringify(data_indicators, null, 4));
	console.log('Loaded portfolio:', JSON.stringify(portfolio, null, 4));
	redisSub.subscribe('fbots-cmd'); // команды всем ботам
	redisSub.subscribe(redis_prefix+'-cmd'); // команды боту
	console.log(func.dateYmdHis(), redis_prefix, process.pid, 'started');
	msg(redis_prefix+' запущен', 1);
	if (production){
		setTimeout(orders_lookup, 999);
	}
	msg_portfolio();
});


setInterval(settings_save, 1000*60); // 1 minute


function shutdown(){
	//msg(redis_prefix+' stopping');
	redisSub.unsubscribe();
	redisSub.quit(function(){
		settings_save(function(){
			console.log('Saved portfolio:', JSON.stringify(portfolio, null, 4));
			setTimeout(function(){
				redisClient.quit(function(){
					console.log(func.dateYmdHis(), 'Worker', process.pid, 'closed Redis');
					console.log(func.dateYmdHis(), 'Worker', process.pid, 'stopped gracefully');
					process.exit(0);
				});
			},777);
		});
	});
}


// stop gracefully
process.on('SIGINT SIGTERM', shutdown);




