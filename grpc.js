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
const packageDefinition = protoLoader.loadSync([
	__dirname + '/contracts-finam/grpc/tradeapi/v1/events.proto',
	__dirname + '/contracts-finam/grpc/tradeapi/v1/orders.proto',
],{
	keepCase: true,
	longs: Number,
	enums: String,
	defaults: true,
	oneofs: true,
});
const api = grpc.loadPackageDefinition(packageDefinition).grpc.tradeapi.v1;

// Auth
const authHeaders = new grpc.Metadata();
authHeaders.add('X-Api-Key', (config.finam.token||config.finam.tokenReadOnly));
const channelCred = grpc.credentials.combineChannelCredentials(grpc.credentials.createSsl(), grpc.credentials.createFromMetadataGenerator(function(_params, callback){
	callback(null, authHeaders);
}));

let stream, orders;




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
				redisClient.publish('forderbook_'+ticker.symbol, JSON.stringify({event: 'orderbook', payload: data.order_book}));
			}
		}else

		// order
		if (data.order && data.order.security_code){
			//console.log('Order data', data);
			const ticker = watch_tickers[data.order.security_code];
			if (ticker){
				redisClient.publish('fbots-cmd', JSON.stringify({event: 'order', payload: data.order}));
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
				redisClient.publish('fbots-cmd', JSON.stringify({event: 'trade', payload: data.trade}));
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


function NewOrder(clientOrderId, direction, security_board, security_code, quantity, price){
	if (!orders){
		orders = new api.Orders(config.finam.grpc_server, channelCred);
	}
	const params = {
		"client_id": config.finam.trade_id,
		"security_board": security_board,
		"security_code": security_code,
		"buy_sell": direction==='Buy'?'BUY_SELL_BUY':'BUY_SELL_SELL',
		"quantity": quantity,
		"property": "ORDER_PROPERTY_PUT_IN_QUEUE",
	};
	if (price) params.price = {value: price};

	const result = orders.NewOrder(params,
	function(err, response){
		//console.log('NewOrder err', JSON.stringify(err, null, 4));
		//console.log('NewOrder response', JSON.stringify(response, null, 4));
		redisClient.publish('fbots-cmd', JSON.stringify({event: 'NewOrder', clientOrderId: clientOrderId, security_code: security_code, error: err, response: response}));
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
	},
	function(err, response){
		//console.log('CancelOrder err', JSON.stringify(err, null, 4));
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



function GetOrders(){
	if (!orders){
		orders = new api.Orders(config.finam.grpc_server, channelCred);
	}
	const result = orders.GetOrders({
		"client_id": config.finam.trade_id,
		"include_active": true,
		"include_canceled": true,
		"include_matched": true,
	},
	function(err, response){
		//console.log('GetOrders err', JSON.stringify(err, null, 4));
		//console.log('GetOrders response', JSON.stringify(response, null, 4));
		redisClient.publish('fbots-cmd', JSON.stringify({event: 'GetOrders', error: err, response: response.orders}));
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
					if (watch_tickers[data.securityCode]){
						NewOrder(data.clientOrderId, data.direction, data.securityBoard, data.securityCode, data.quantity, data.price);
					}
				}

				if (data.cmd==='CancelOrder'){
					if (watch_tickers[data.securityCode]){
						CancelOrder(data.transaction_id);
					}
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
