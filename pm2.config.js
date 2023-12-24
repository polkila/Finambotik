module.exports = {
	apps: [
		{
			name: 'telegram',
			script: 'telegram.js',
			max_memory_restart: '256M',
			cron_restart: '55 9,18,23 * * *',
			listen_timeout: 3*60*1000,
			kill_timeout: 60*1000,
			env: {
				//NODE_ENV: 'development',
				NODE_ENV: 'production',
			},
			out_file: 'logs/telegram.log',
			error_file: 'logs/telegram.log',
			combine_logs: true,
		},
		{
			name: 'grpc',
			script: 'grpc.js',
			max_memory_restart: '256M',
			cron_restart: '50 9 * * *',
			listen_timeout: 3*60*1000,
			kill_timeout: 60*1000,
			env: {
				//NODE_ENV: 'development',
				NODE_ENV: 'production',
			},
			out_file: 'logs/grpc.log',
			error_file: 'logs/grpc.log',
			combine_logs: true,
		},
		{
			name: 'bot1',
			script: 'bot1.js',
			max_memory_restart: '256M',
			cron_restart: '51 9 * * *',
			listen_timeout: 3*60*1000,
			kill_timeout: 60*1000,
			env: {
				//NODE_ENV: 'development',
				NODE_ENV: 'production',
			},
			out_file: 'logs/bot1.log',
			error_file: 'logs/bot1.log',
			combine_logs: true,
		},
	]
};
