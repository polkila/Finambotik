'use strict';
process.on('uncaughtException', console.error);

const config = require('./config');
const func = require('./func');
const redis = require('redis');
const redisClient = redis.createClient();
const redisSub = redisClient.duplicate();
const redis_prefix = 'grpc';

let connected = false;
let reconnect_pause = 999;
let time_connected = null;
let time_disconnected = null;
let reconnect_number = -1;
let disconnected_by_error = false;
let queue_commands = [];
let queue_running = false;
let total_subscriptions = 0;



let watch_tickers = {
/*
	'AAPL':{
		symbol: 'AAPL',
		security_code: 'AAPL',
		security_board: 'MCT',
		orderbook: true,
		trades: true,
	},
	'GAZP':{
		symbol: 'GAZP',
		security_code: 'GAZP',
		security_board: 'TQBR',
		orderbook: true,
		trades: true,
	},
*/
};



const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const protoFiles = require('google-proto-files');
const packageDefinition = protoLoader.loadSync([
	__dirname + '/contracts-finam/grpc/tradeapi/v1/events.proto',
	__dirname + '/contracts-finam/grpc/tradeapi/v1/orders.proto',
	__dirname + '/contracts-finam/grpc/tradeapi/v1/candles.proto',
],{
	keepCase: true,
	longs: Number,
	enums: String,
	defaults: true,
	oneofs: true,
	includeDirs: [protoFiles.getProtoPath('..'), __dirname + '/contracts-finam'],
});
const api = grpc.loadPackageDefinition(packageDefinition).grpc.tradeapi.v1;

// Auth
const authHeaders = new grpc.Metadata();
authHeaders.add('X-Api-Key', (config.finam.token||config.finam.tokenReadOnly));
const channelCred = grpc.credentials.combineChannelCredentials(grpc.credentials.createSsl(), grpc.credentials.createFromMetadataGenerator(function(_params, callback){
	callback(null, authHeaders);
}));

let stream, orders, candles;




function grpc_connect(){
	const channel = new api.Events(config.finam.grpc_server, channelCred);
	stream = channel.GetEvents(function(err, response){
		console.log('Stream err', JSON.stringify(err, null, 4));
		console.log('Stream response', JSON.stringify(response, null, 4));
	});

	reconnect_number++;
	disconnected_by_error = false;

	stream.on('data', grpc_data);
	stream.on('error', grpc_error);
	stream.on('status', grpc_status);
	stream.on('end', grpc_end);

	grpc_open();
}


function grpc_open(){
	connected = true;
	time_connected = Date.now();
	console.log(func.dateYmdHis(), redis_prefix, 'connected');
	//redisClient.publish('ftelegram-bot', JSON.stringify({cmd:'private', text:'connected'}));
	if (reconnect_number) console.log(redis_prefix, 'Offline duration', (time_connected-time_disconnected)/1000, 'sec');
	console.log();

	Object.keys(watch_tickers).forEach(function(id){
		const ticker = watch_tickers[id];

		if (ticker.orderbook){
			subscribe_orderbook(ticker.security_board, ticker.security_code);
		}
	});

	subscribe_trades();

	if (!queue_running) queue_dispatch();

	setTimeout(function(){
		redisClient.publish('fbots-cmd', JSON.stringify({cmd: 'resubscribe'}));
	}, 3333);

	setInterval(send_keepalive, 999*66*3); // вместо Ping
}


function grpc_data(data){
	if (data){
		if (data.response){
			console.log('Response data', JSON.stringify(data, null, 4));
			/*
			{
				"response": {
					"request_id": "1683832263872",
					"success": true,
					"errors": []
				}
			}
			*/
		}else

		// orderbook
		if (data.order_book && data.order_book.security_code){
			//console.log('Orderbook', JSON.stringify(data, null, 4));
			const ticker = watch_tickers[data.order_book.security_code];
			if (ticker){
				redisClient.publish('forderbook_'+ticker.symbol, JSON.stringify(data));
			}
		}else

		// order
		if (data.order && data.order.security_code){
			//console.log('Order data', data);
			const ticker = watch_tickers[data.order.security_code];
			if (ticker){
				redisClient.publish('fbots-cmd', JSON.stringify(data));
			}
			/*
			Order data {
			  order: {
			    order_no: 0,
			    transaction_id: 34898872,
			    security_code: 'SBER',
			    client_id: 'client_id',
			    status: 'ORDER_STATUS_NONE',
			    buy_sell: 'BUY_SELL_BUY',
			    created_at: null,
			    price: 228,
			    quantity: 1,
			    balance: 1,
			    message: '',
			    currency: 'RUR',
			    condition: { type: 'ORDER_CONDITION_TYPE_UNSPECIFIED', price: 0, time: null },
			    valid_before: { type: 'ORDER_VALID_BEFORE_TYPE_TILL_END_SESSION', time: null },
			    accepted_at: { seconds: 1684337840, nanos: 0 }
			  },
			  payload: 'order'
			}
			Order data {
			  order: {
			    order_no: 0,
			    transaction_id: 34898872,
			    security_code: 'SBER',
			    client_id: 'client_id',
			    status: 'ORDER_STATUS_ACTIVE',
			    buy_sell: 'BUY_SELL_BUY',
			    created_at: null,
			    price: 228,
			    quantity: 1,
			    balance: 1,
			    message: '',
			    currency: 'RUR',
			    condition: { type: 'ORDER_CONDITION_TYPE_UNSPECIFIED', price: 0, time: null },
			    valid_before: { type: 'ORDER_VALID_BEFORE_TYPE_TILL_END_SESSION', time: null },
			    accepted_at: { seconds: 1684337840, nanos: 0 }
			  },
			  payload: 'order'
			}
			Order data {
			  order: {
			    order_no: 36068714431,
			    transaction_id: 34898872,
			    security_code: 'SBER',
			    client_id: 'client_id',
			    status: 'ORDER_STATUS_ACTIVE',
			    buy_sell: 'BUY_SELL_BUY',
			    created_at: { seconds: 1684337840, nanos: 0 },
			    price: 228,
			    quantity: 1,
			    balance: 1,
			    message: '',
			    currency: 'RUR',
			    condition: { type: 'ORDER_CONDITION_TYPE_UNSPECIFIED', price: 0, time: null },
			    valid_before: { type: 'ORDER_VALID_BEFORE_TYPE_TILL_END_SESSION', time: null },
			    accepted_at: null
			  },
			  payload: 'order'
			}
			data {
			  order: {
			    order_no: 36065527505,
			    transaction_id: 28674472,
			    security_code: 'SBER',
			    client_id: 'client_id',
			    status: 'ORDER_STATUS_CANCELLED',
			    buy_sell: 'BUY_SELL_BUY',
			    created_at: { seconds: 1684331765, nanos: 0 },
			    price: 229,
			    quantity: 1,
			    balance: 1,
			    message: 'Order is cancelled.',
			    currency: 'RUR',
			    condition: { type: 'ORDER_CONDITION_TYPE_UNSPECIFIED', price: 0, time: null },
			    valid_before: { type: 'ORDER_VALID_BEFORE_TYPE_TILL_END_SESSION', time: null },
			    accepted_at: null
			  },
			  payload: 'order'
			}
			Order data {
			  order: {
			    order_no: 36069975256,
			    transaction_id: 36647562,
			    security_code: 'SBER',
			    client_id: 'client_id',
			    status: 'ORDER_STATUS_MATCHED',
			    buy_sell: 'BUY_SELL_BUY',
			    created_at: { seconds: 1684342721, nanos: 0 },
			    price: 230.36,
			    quantity: 1,
			    balance: 0,
			    message: '',
			    currency: 'RUR',
			    condition: { type: 'ORDER_CONDITION_TYPE_UNSPECIFIED', price: 0, time: null },
			    valid_before: { type: 'ORDER_VALID_BEFORE_TYPE_TILL_END_SESSION', time: null },
			    accepted_at: null
			  },
			  payload: 'order'
			}
			*/
		}else

		// trade
		if (data.trade && data.trade.security_code){
			console.log('Trade data', data);
			const ticker = watch_tickers[data.trade.security_code];
			if (ticker){
				redisClient.publish('fbots-cmd', JSON.stringify(data));
			}
			/*
			data {
			  trade: {
			    security_code: 'SBER',
			    trade_no: 7657506564,
			    order_no: 36069975256,
			    client_id: 'client_id',
			    created_at: { seconds: 1684342734, nanos: 0 },
			    quantity: 1,
			    price: 230.36,
			    value: 2303.6,
			    buy_sell: 'BUY_SELL_BUY',
			    commission: 0.23,
			    currency: 'RUR',
			    accrued_interest: 0
			  },
			  payload: 'trade'
			}*/
		}else

		{
			console.log('Stream data', data);
		}
	}else{
		console.log(func.dateYmdHis(), redis_prefix, 'Stream !data');
	}
}


function grpc_error(error){
	disconnected_by_error = true;
	console.log(func.dateYmdHis(), redis_prefix, 'error');
	console.log(JSON.stringify(error, null, 4));
}


function grpc_status(status){
	console.log(func.dateYmdHis(), redis_prefix, 'Stream status', JSON.stringify(status, null, 4));
}


function grpc_end(){
	connected = false;
	console.log(func.dateYmdHis(), redis_prefix, 'Stream end');
	time_disconnected = Date.now();
	console.log(func.dateYmdHis(), redis_prefix, 'disconnected');
	console.log(redis_prefix, 'Online duration', (time_disconnected-time_connected)/1000, 'sec');
	process.exit(); // use pm2 process manager

	//total_subscriptions = 0;
	//console.log(redis_prefix, 'reconnecting', reconnect_number, 'after', reconnect_pause, 'ms');
	//setTimeout(grpc_connect, disconnected_by_error ? reconnect_pause : 3);
}


function grpc_send(command){
	queue_commands.push(command);
	if (connected && !queue_running) queue_dispatch();
}


function queue_dispatch(){
	if (queue_commands.length){
		queue_running = true;
		const command = queue_commands.shift();
		stream.write(command.query);
		if (command.callback) command.callback();
		setTimeout(queue_dispatch, 333);
	}else{
		queue_running = false;
		console.log(func.dateYmdHis(), redis_prefix, 'total_subscriptions', total_subscriptions);
	}
}



function send_keepalive(){
	const request_id = Date.now();
	grpc_send({
		query: {
			"keep_alive_request": {
				"request_id": String(request_id)
			}
		},
		callback: function(){
			console.log(func.dateYmdHis(), redis_prefix, 'Sent keepalive packet');
		},
	});
}


function subscribe_trades(){
	total_subscriptions++;
	const request_id = Date.now();
	grpc_send({
		query: {
			"order_trade_subscribe_request": {
				"request_id": String(request_id),
				"client_ids": [config.finam.trade_id],
				"include_trades": true,
				"include_orders": true
			}
		},
		callback: function(){
			console.log(func.dateYmdHis(), redis_prefix, 'Subscribed to trades');
		},
	});
}


function unsubscribe_trades(){
	total_subscriptions--;
	const request_id = Date.now();
	grpc_send({
		query: {
			"order_trade_unsubscribe_request": {
				"request_id": String(request_id),
			}
		},
		callback: function(){
			console.log(func.dateYmdHis(), redis_prefix, 'Unsubscribed from trades');
		},
	});
}


function subscribe_orderbook(security_board, security_code){
	total_subscriptions++;

	const request_id = Date.now();
	let query = {
		"order_book_subscribe_request": {
			"request_id": String(request_id),
			"security_board": security_board,
			"security_code": security_code
		}
	};

	grpc_send({
		query: query,
		callback: function(){
			console.log(func.dateYmdHis(), redis_prefix, 'Subscribed to', watch_tickers[security_code].symbol, 'orderbook');
		},
	});
	watch_tickers[security_code]['orderbook_query'] = {query: query};
}



function unsubscribe_orderbook(security_board, security_code){
	total_subscriptions--;

	const request_id = Date.now();
	grpc_send({
		query: {
			"order_book_unsubscribe_request": {
				"request_id": String(request_id),
				"security_board": security_board,
				"security_code": security_code
			}
		},
		callback: function(){
			console.log(func.dateYmdHis(), redis_prefix, 'Unsubscribed from', watch_tickers[security_code].symbol, 'orderbook', watch_tickers[security_code].orderbook);
		},
	});
}



function resubscribe(security_board, security_code){
	if (watch_tickers[security_code].orderbook){
		unsubscribe_orderbook(security_board, security_code);
		subscribe_orderbook(security_board, security_code);
	}
}


function NewOrder(data){
	if (!orders){
		orders = new api.Orders(config.finam.grpc_server, channelCred);
	}

	const params = {
		"client_id": data.clientId,
		"security_board": data.securityBoard,
		"security_code": data.securityCode,
		"buy_sell": data.direction==='Buy'?'BUY_SELL_BUY':'BUY_SELL_SELL',
		"quantity": data.quantity,
		"property": "ORDER_PROPERTY_PUT_IN_QUEUE",
	};
	if (data.price) params.price = {value: data.price};

	//console.log(func.dateYmdHis(), 'NewOrder()', params);

	const result = orders.NewOrder(params, function(err, response){
		if (err) console.log(func.dateYmdHis(), 'NewOrder err', JSON.stringify(err, null, 4));
		console.log(func.dateYmdHis(), 'NewOrder response', JSON.stringify(response, null, 4));
		redisClient.publish('fbots-cmd', JSON.stringify({event: 'NewOrder', clientOrderId: data.clientOrderId, security_code: data.securityCode, error: err, response: response}));
	});
/*
error {"code":3,"details":"[156]Money shortage by value of 1608.94 (max. acceptable value - 0 lot.)","metadata":{"content-type":["application/grpc"],"date":["Wed, 17 May 2023 17:17:09 GMT"],"content-length":["0"],"strict-transport-security":["max-age=2592000"]}}}
response {
    "client_id": "client_id",
    "transaction_id": 32669432,
    "security_code": "SBER"
}
*/
}



function CancelOrder(transaction_id){
	if (!orders){
		orders = new api.Orders(config.finam.grpc_server, channelCred);
	}
	const result = orders.CancelOrder({
		"client_id": config.finam.trade_id,
		"transaction_id": transaction_id,
	}, function(err, response){
		if (err) console.log('CancelOrder err', JSON.stringify(err, null, 4));
		//console.log('CancelOrder response', JSON.stringify(response, null, 4));
		redisClient.publish('fbots-cmd', JSON.stringify({event: 'CancelOrder', error: err, response: response}));
	});
/*
response {
    "client_id": "client_id",
    "transaction_id": 32669432
}
*/
}



function GetOrders(client_id){
	if (!orders){
		orders = new api.Orders(config.finam.grpc_server, channelCred);
	}
	const result = orders.GetOrders({
		"client_id": client_id || config.finam.trade_id,
		"include_active": true,
		"include_canceled": true,
		"include_matched": true,
	}, function(err, response){
		if (err) console.log('GetOrders err', JSON.stringify(err, null, 4));
		//console.log('GetOrders response', JSON.stringify(response, null, 4));
		if (response) redisClient.publish('fbots-cmd', JSON.stringify({event: 'GetOrders', error: err, response: response.orders}));
	});
/*
response {
    orders: [
        {
            "order_no": 36065527505,
            "transaction_id": 28674472,
            "security_code": "SBER",
            "client_id": "client_id",
            "status": "ORDER_STATUS_CANCELLED",
            "buy_sell": "BUY_SELL_BUY",
            "created_at": {
                "seconds": 1684331765,
                "nanos": 0
            },
            "price": 229,
            "quantity": 1,
            "balance": 1,
            "message": "Order is cancelled.",
            "currency": "RUR",
            "condition": null,
            "valid_before": {
                "type": "ORDER_VALID_BEFORE_TYPE_TILL_END_SESSION",
                "time": null
            },
            "accepted_at": null,
            "security_board": "TQBR",
            "market": "MARKET_STOCK"
        }
    ],
    "client_id": "client_id"
}
*/
}


function GetIntradayCandles(security_board, security_code, params){
	const query = {
		"interval": {},
		"security_board": security_board,
		"security_code": security_code,
		"time_frame": params.timeFrame || 'INTRADAYCANDLE_TIMEFRAME_M1',
	};
	if (params.count) query.interval.count = params.count;
	if (params.from) query.interval.from = params.from;
	if (params.fromMs) query.interval.from = {nanos: 0, seconds: String(Math.floor(params.fromMs/1000))};
	if (params.to) query.interval.to = params.to;
	if (params.toMs) query.interval.to = {nanos: 0, seconds: String(Math.floor(params.toMs/1000))};

	if (!candles){
		candles = new api.Candles(config.finam.grpc_server, channelCred);
	}
	const result = candles.GetIntradayCandles(query, function(err, response){
		if (err) console.log('GetIntradayCandles err', JSON.stringify(err, null, 4));
		//console.log('GetIntradayCandles response', JSON.stringify(response, null, 4));
		if (response) redisClient.publish('fbots-cmd', JSON.stringify({event: 'GetIntradayCandles', error: err, response: response.candles, queryId: params.queryId, security_code: security_code}));
	});
/*
response {
    "candles": [
        {
            "timestamp": {
                "seconds": "1686948540",
                "nanos": 0
            },
            "open": {
                "num": "10674",
                "scale": 0
            },
            "close": {
                "num": "10671",
                "scale": 0
            },
            "high": {
                "num": "10677",
                "scale": 0
            },
            "low": {
                "num": "10670",
                "scale": 0
            },
            "volume": "248"
        }
    ]
}
*/
}


function GetDayCandles(security_board, security_code, params){
	const query = {
		"interval": {},
		"security_board": security_board,
		"security_code": security_code,
		"time_frame": params.timeFrame || 'DAYCANDLE_TIMEFRAME_D1',
	};
	if (params.count) query.interval.count = params.count;
	if (params.from) query.interval.from = params.from;
	if (params.fromMs){
		const dateFrom = new Date(params.fromMs);
		query.interval.from = {day: dateFrom.getDate(), month: dateFrom.getMonth(), year: dateFrom.getFullYear()};
	}
	if (params.to) query.interval.to = params.to;
	if (params.toMs){
		const dateTo = new Date(params.toMs);
		query.interval.from = {day: dateTo.getDate(), month: dateTo.getMonth(), year: dateTo.getFullYear()};
	}

	if (!candles){
		candles = new api.Candles(config.finam.grpc_server, channelCred);
	}
	const result = candles.GetDayCandles(query, function(err, response){
		if (err) console.log('GetDayCandles err', JSON.stringify(err, null, 4));
		//console.log('GetDayCandles response', JSON.stringify(response, null, 4));
		if (response) redisClient.publish('fbots-cmd', JSON.stringify({event: 'GetDayCandles', error: err, response: response.candles, queryId: params.queryId, security_code: security_code}));
	});
/*
response {
    "candles": [
        {
            "date": {
                "year": 2023,
                "month": 6,
                "day": 16
            },
            "open": {
                "num": "10460",
                "scale": 0
            },
            "close": {
                "num": "10671",
                "scale": 0
            },
            "high": {
                "num": "10711",
                "scale": 0
            },
            "low": {
                "num": "104205",
                "scale": 1
            },
            "volume": "239701"
        }
    ]
}
*/
}


/* REDIS */


redisSub.on('message', function(channel, data){
	//console.log(channel, data);

	if (channel==='fstream-cmd' && data && typeof(data)==='string'){

		try{
			data = JSON.parse(data);
		}catch(e){
			console.error(func.dateYmdHis(), redis_prefix+': Error parse data', data, e);
		}

		if (data.symbol==='*'){

			if (data.cmd==='resubscribe'){
				unsubscribe_trades();
				subscribe_trades();
				Object.keys(watch_tickers).forEach(function(symbol){
					resubscribe(watch_tickers[symbol].securityBoard, watch_tickers[symbol].securityCode);
				});
			}

		}else{

			if (data.securityBoard && data.securityCode){
				if (data.cmd==='resubscribe'){
					if (watch_tickers[data.securityCode]){
						resubscribe(data.securityBoard, data.securityCode);
					}
				}

				if (data.cmd==='subscribe'){
					if (!watch_tickers[data.securityCode]) watch_tickers[data.securityCode] = {symbol: data.securityCode};

					if (data.orderbook){
						if (!watch_tickers[data.securityCode].orderbook){
							watch_tickers[data.securityCode].orderbook = true;
							subscribe_orderbook(data.securityBoard, data.securityCode);
						}
					}
				}

				if (data.cmd==='unsubscribe'){
					if (watch_tickers[data.securityCode]){
						if (data.orderbook){
							if (watch_tickers[data.securityCode].orderbook){
								unsubscribe_orderbook(data.securityBoard, data.securityCode);
								watch_tickers[data.securityCode].orderbook = false;
							}
						}
					}
				}

				if (data.cmd==='NewOrder'){
					NewOrder(data);
				}

				if (data.cmd==='CancelOrder'){
					CancelOrder(data.transactionId);
				}

				if (data.cmd==='GetOrders'){
					GetOrders(data.clientId);
				}

				if (data.cmd==='GetIntradayCandles'){
					GetIntradayCandles(data.securityBoard, data.securityCode, data.params);
				}

				if (data.cmd==='GetDayCandles'){
					GetDayCandles(data.securityBoard, data.securityCode, data.params);
				}
			}
		}
	}
});




/* START */

(function(){
	redisSub.subscribe('fstream-cmd');
	setTimeout(grpc_connect, 999);
	console.log(func.dateYmdHis(), redis_prefix, process.pid, 'started');
	if (process.send) process.send('ready');
	//redisClient.publish('ftelegram-bot',  JSON.stringify({cmd:'private', text:redis_prefix+' started'}));
})();


// stop gracefully
process.on('SIGINT SIGTERM', function(){
	if (stream && stream.end) stream.end();
	console.log(func.dateYmdHis(), redis_prefix, 'Worker', process.pid, 'closed gRPC');
	redisSub.unsubscribe();
	redisSub.quit(function(){
		redisClient.quit(function(){
			console.log(func.dateYmdHis(), redis_prefix, 'Worker', process.pid, 'closed Redis');
			console.log(func.dateYmdHis(), redis_prefix, 'Worker', process.pid, 'stopped gracefully');
			process.exit(0);
		});
	});
});
