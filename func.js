const config = require('./config');


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

const http_request = exports.http_request = require('request');


const rest = exports.rest = function(method, path, params, cb){
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


const fs = exports.fs = require('fs');

const readJSONfile = exports.readJSONfile = function(filename, cb){
	fs.readFile(filename, 'utf-8', function(err, data){
		if (!err){
			cb(err, data ? JSON.parse(data.toString()): null);
		}else{
			cb(err, data);
		}
	});
}

exports.cachedJSONfile = function(filename, cacheTimeMs, cb){
	if (cacheTimeMs){
		fs.stat(filename, function(err, stat){
			if (!err){
				if (Date.now() - stat.mtimeMs < cacheTimeMs){
					readJSONfile(filename, cb);
				}else{
					cb(null, null);
				}
			}else{
				cb(err, null);
			}
		});
	}else{
		readJSONfile(filename, cb);
	}
}

exports.writeJSONfile = function(filename, data, cb){
	fs.writeFile(filename, JSON.stringify(data), function(err){
		cb(err);
	});
}




/* Indicators */


// Exponential Moving Average
exports.EMA = function(_period, _vars){
	let period = _period || 20,
		multiplier = 2 / (period + 1),
		count = 0,
		sum = 0,
		EMAvalue;

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
		}else{
			count++;
			sum += y;
			if (count === period){
				EMAvalue = sum / period;
			}
		}
	};

	this.getValue = function(){
		return EMAvalue;
	};

	this.getVars = function(){
		if (EMAvalue) return {EMAvalue: EMAvalue};
		else return {count: count, sum: sum};
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
const dateYmdHis = exports.dateYmdHis = function(asset, base){
	const d = base ? new Date(base) : new Date();

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
const dateYmd = exports.dateYmd = function(asset, base){
	return dateYmdHis(asset, base).substr(0, 10);
};


/*

22:15:55

*/
const dateHis = exports.dateHis = function(asset, base){
	return dateYmdHis(asset, base).substr(11);
};



exports.markdown_escape = function(str){
	return String(str||'').replace(/([*_\[\]])/img, '\\$1');
	//return str.replace(/([*_])/img, '');
};



const correctFloat = exports.correctFloat = function(number){
	return parseFloat(parseFloat(number).toPrecision(14));
}


const isObject = exports.isObject = function(item) {
	return (item && typeof item === 'object' && !Array.isArray(item));
}


/*
const merged = mergeDeep({a:1}, {b:{c:1,d:2}}, {b:{c:2}});
*/
const mergeDeep = exports.mergeDeep = function(target, ...sources){
	if (!sources.length) return target;
	const source = sources.shift();

	if (isObject(target) && isObject(source)){
		for (const key in source){
			if (isObject(source[key])){
				if (!target[key]) Object.assign(target, {[key]: {}});
				mergeDeep(target[key], source[key]);
			}else{
				Object.assign(target, {[key]: source[key]});
			}
		}
	}

	return mergeDeep(target, ...sources);
}


const round = exports.round = function(value, decimals){
	return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
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
