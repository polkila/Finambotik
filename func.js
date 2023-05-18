var config = require('./config');


/* Request */

/*

http_request({
	url: 'https://foo.bar/path',
	method: 'post',
	form: {
		param1: 1,
		param2: 2
	},
	timeout: 60
}, function(err, req){
});


http_request({
	url: 'https://1.2.3.4/path/script.php',
	headers: {
		'Host': 'google.com'
	},
	method: 'get',
	qs: {
		username: '',
		password: ''
	},
	timeout: 60
}, function(err, req){
});

*/

var http_request = exports.http_request = require('request');


var rest = exports.rest = function(method, path, params, cb){
	params = params || {};
	http_request({
		method: method || 'get',
		url: (params.url || config.finam.rest_url) + path,
		qs: params.qs || {},
		body: params.body || {},
		form: params.form || {},
		headers: {
			'X-Api-Key': (params.token || config.finam.tokenReadOnly),
		},
		json: params.json || true,
		timeout: 9999 // ms
	}, function(err, req, body){
		if (err) console.error(err);
		//if (req) console.log(req);
/*
		console.log();
		console.log('path', path);
		console.log('statusCode', req.statusCode);
		console.log('statusMessage', req.statusMessage);
		console.log('body', JSON.stringify(body, null, 0));
		console.log('body', JSON.stringify(body, null, 4));
*/
		if (cb) cb(err, body);
	});
}




/* Indicators */


// Exponential Moving Average
exports.EMA = function(_period, _vars){
	let period = _period || 20,
		multiplier = 2 / (period + 1),
		count = 0,
		sum = 0,
		EMAvalue,
		EMAPoint = [0, 0],
		EMAPoints = [];

	this.loadVars = function(vars){
		if (vars){
			count = vars.count || 0;
			sum = vars.sum || 0;
			EMAvalue = vars.EMAvalue;
		}
	}

	if (_vars){
		this.loadVars(_vars);
	}

	this.addPoint = function(x, y){
		if (EMAvalue){
			EMAvalue = correctFloat((y * multiplier) + (EMAvalue * (1 - multiplier)));
			EMAPoint = [x, EMAvalue];
			EMAPoints.push(EMAPoint);
		}else{
			count++;
			sum += y;
			if (count === period){
				EMAvalue = sum / period;
				EMAPoint = [x, EMAvalue];
				EMAPoints.push(EMAPoint);
			}
		}
	};

	this.getValue = function(){
		return EMAvalue;
	};

	this.getPoint = function(){
		return EMAPoint;
	};

	this.getPoints = function(){
		return EMAPoints;
	};

	this.getVars = function(){
		return {
			count: count,
			sum: sum,
			EMAvalue: EMAvalue,
		}
	};
}


// Weighted Moving Average
exports.WMA = function(_period, _decimals, _vars){
	let period = _period || 10,
		decimals = _decimals || 14,
		points = [],
		WMAvalue,
		WMAPoint = [0, 0],
		WMAPoints = [];

	this.loadVars = function(vars){
		if (vars){
			points = vars.points || [];
		}
	}

	if (_vars){
		this.loadVars(_vars);
	}

	this.addPoint = function(x, y){
		if (points.unshift(y) > period) points = points.slice(0, period);
		if (points.length===period){
			let weight, sum = 0, norm = 0, i = 0;
			for(; i < points.length; i++){
				weight = period - i;
				sum += points[i] * weight;
				norm += weight;
			}
			WMAvalue = round(sum / norm, decimals);
			WMAPoint = [x, WMAvalue];
			WMAPoints.push(WMAPoint);
		}
	};

	this.getPoint = function(){
		return WMAPoint;
	};

	this.getPoints = function(){
		return WMAPoints;
	};

	this.getVars = function(){
		return {
			points: points,
			WMAvalue: WMAvalue,
		}
	};
}










/* Helpers */



/*
2016-11-30 22:15:55

dateYmdHis('-1 day');
dateYmdHis('-1 month');
dateYmdHis('-15 minute');
dateYmdHis(1548720000);
dateYmdHis(1548720000000);
dateYmdHis('1548720000000');
*/
var dateYmdHis = exports.dateYmdHis = function(asset, base){
	var d = base ? new Date(base) : new Date();

	if (asset){
		if (/^\+?-?\d+ year/.test(asset)){
			d.setFullYear(d.getFullYear()+parseInt(asset));
		}else
		if (/^\+?-?\d+ month/.test(asset)){
			d.setMonth(d.getMonth()+parseInt(asset));
		}else
		if (/^\+?-?\d+ week/.test(asset)){
			d.setDate(d.getDate()+7*parseInt(asset));
		}else
		if (/^\+?-?\d+ day/.test(asset)){
			d.setDate(d.getDate()+parseInt(asset));
		}else
		if (/^\+?-?\d+ hour/.test(asset)){
			d.setHours(d.getHours()+parseInt(asset));
		}else
		if (/^\+?-?\d+ minute/.test(asset)){
			d.setMinutes(d.getMinutes()+parseInt(asset));
		}else
		if (String(asset).length===13){ // 1548720000000
			d.setTime(asset * 1);
		}else
		if (String(asset).length===10){ // 1548720000
			d.setTime(asset * 1000);
		}else
		if (typeof(asset)==='string'){ // Apr 30, 2019
			d = new Date(asset);
		}
	}

	d.setTime(d.getTime()-d.getTimezoneOffset()*60*1000); // прибавить временную зону (3 часа), тк toISOString() отнимает её

	return d.toISOString().replace(/^(\d+).(\d+).(\d+).(\d+).(\d+).(\d+).*$/i, '$1-$2-$3 $4:$5:$6');
};


/*

2016-11-30

*/
var dateYmd = exports.dateYmd = function(asset, base){
	return dateYmdHis(asset, base).substr(0, 10);
};


/*

22:15:55

*/
var dateHis = exports.dateHis = function(asset, base){
	return dateYmdHis(asset, base).substr(11);
};



exports.markdown_escape = function(str){
	return String(str||'').replace(/([*_\[\]])/img, '\\$1');
	//return str.replace(/([*_])/img, '');
};



var correctFloat = exports.correctFloat = function(number){
	return parseFloat(parseFloat(number).toPrecision(14));
}


var countDecimals = exports.countDecimals = function(value){
	if(Math.floor(value) === value) return 0;
	return value.toString().split(".")[1].length || 0;
}


var sumArray = exports.sumArray = function(array){
	return array.reduce(function (prev, cur) {
		return prev + cur;
	}, 0);
}


var isObject = exports.isObject = function(item) {
	return (item && typeof item === 'object' && !Array.isArray(item));
}


/*
const merged = mergeDeep({a:1}, {b:{c:1,d:2}}, {b:{c:2}});
*/
var mergeDeep = exports.mergeDeep = function(target, ...sources) {
	if (!sources.length) return target;
	const source = sources.shift();

	if (isObject(target) && isObject(source)) {
		for (const key in source) {
			if (isObject(source[key])) {
				if (!target[key]) Object.assign(target, { [key]: {} });
				mergeDeep(target[key], source[key]);
			} else {
				Object.assign(target, { [key]: source[key] });
			}
		}
	}

	return mergeDeep(target, ...sources);
}


var rand = exports.rand = function(min, max){
	return Math.floor(Math.random()*(max-min+1)+min);
};


var round = exports.round = function(value, decimals){
	return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
};


var toFixed = exports.toFixed = function(value, decimals){
	return parseFloat(value.toFixed(decimals));
}


exports.quotation2decimal = function(quotation, decimals){
	return round(parseInt(quotation.units)+quotation.nano/1000000000, decimals||5);
}


exports.decimal2quotation = function(dec){
	const floor = Math.floor(dec);
	return {units: floor, nano: Math.round((dec - floor) * 1000000000)};
}


exports.link_bar = function(symbol, etf){
	return '';
};



exports.interval_to_minutes = function(interval){
	switch (interval){
		case '1min':
			return 1;
		case '2min':
			return 2;
		case '3min':
			return 3;
		case '4min':
			return 4;
		case '5min':
			return 5;
		case '6min':
			return 6;
		case '10min':
			return 10;
		case '12min':
			return 12;
		case '15min':
			return 15;
		case '20min':
			return 20;
		case '30min':
			return 30;
		case 'hour':
			return 60;
		case '2hour':
			return 60*2;
	}
}



exports.swapKeyValue = function(obj){
	let ret = {};
	for(let key in obj){
		ret[obj[key]] = key;
	}
	return ret;
}
