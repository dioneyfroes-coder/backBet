import { env } from './env';

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseInt(value ?? '', 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
	if (typeof value === 'undefined') {
		return fallback;
	}
	return value.toLowerCase() === 'true';
};

const parseList = (value: string | undefined, fallback: string[]): string[] => {
	if (!value) {
		return fallback;
	}
	return value
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
};

/**
 * CONFIGURAÇÃO CENTRALIZADA DA APLICAÇÃO
 *
 * Centraliza todas as configurações de forma segura e organizada.
 * Separação entre configurações públicas e sensíveis.
 */

export const appConfig = {
	env: env.NODE_ENV || 'development',
	server: {
		port: parsePositiveInt(env.PORT, 3000),
	},
	security: {
		allowDevBearerBypass: parseBoolean(env.ALLOW_DEV_BEARER_BYPASS, false),
		enableHsts: parseBoolean(env.ENABLE_HSTS, env.NODE_ENV === 'production'),
	},
	cors: {
		allowedOrigins: parseList(env.CORS_ALLOWED_ORIGINS, ['http://localhost:3000', 'http://localhost:3001']),
		allowCredentials: parseBoolean(env.CORS_ALLOW_CREDENTIALS, true),
	},
	rateLimit: {
		windowMs: parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, 600000), // 10 minutos
		max: parsePositiveInt(env.RATE_LIMIT_MAX, 5000), // alto para ambiente dev
		message:
			env.RATE_LIMIT_MESSAGE ||
			'Você excedeu o limite de requisições. Aguarde alguns instantes antes de tentar novamente.',
		enabled: parseBoolean(env.RATE_LIMIT_ENABLED, true),
	},
	authRateLimit: {
		register: {
			windowMs: parsePositiveInt(env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(env.AUTH_REGISTER_RATE_LIMIT_MAX, 10),
			message:
				env.AUTH_REGISTER_RATE_LIMIT_MESSAGE ||
				'Muitas tentativas de registro. Tente novamente em alguns segundos.',
		},
		login: {
			windowMs: parsePositiveInt(env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(env.AUTH_LOGIN_RATE_LIMIT_MAX, 15),
			message:
				env.AUTH_LOGIN_RATE_LIMIT_MESSAGE ||
				'Muitas tentativas de login. Aguarde alguns segundos antes de tentar novamente.',
		},
		refresh: {
			windowMs: parsePositiveInt(env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(env.AUTH_REFRESH_RATE_LIMIT_MAX, 30),
			message:
				env.AUTH_REFRESH_RATE_LIMIT_MESSAGE ||
				'Você excedeu o limite de refresh tokens. Tente novamente em breve.',
		},
	},
	walletRateLimit: {
		deposit: {
			windowMs: parsePositiveInt(env.WALLET_DEPOSIT_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(env.WALLET_DEPOSIT_RATE_LIMIT_MAX, 20),
			message:
				env.WALLET_DEPOSIT_RATE_LIMIT_MESSAGE ||
				'Muitas tentativas de depósito. Aguarde um momento e tente novamente.',
		},
		withdraw: {
			windowMs: parsePositiveInt(env.WALLET_WITHDRAW_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(env.WALLET_WITHDRAW_RATE_LIMIT_MAX, 10),
			message:
				env.WALLET_WITHDRAW_RATE_LIMIT_MESSAGE ||
				'Muitas tentativas de saque. Aguarde um momento e tente novamente.',
		},
	},
	betRateLimit: {
		place: {
			windowMs: parsePositiveInt(env.BET_PLACE_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(env.BET_PLACE_RATE_LIMIT_MAX, 30),
			message:
				env.BET_PLACE_RATE_LIMIT_MESSAGE ||
				'Muitas tentativas de criar apostas. Reduza a frequência.',
		},
		cancel: {
			windowMs: parsePositiveInt(env.BET_CANCEL_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(env.BET_CANCEL_RATE_LIMIT_MAX, 10),
			message:
				env.BET_CANCEL_RATE_LIMIT_MESSAGE ||
				'Muitas tentativas de cancelamento. Aguarde e tente novamente.',
		},
	},
	jwt: {
		secret: env.JWT_SECRET as string,
		issuer: env.JWT_ISSUER || 'backbet',
		accessTokenExpiration: env.JWT_EXPIRATION || '15m',
		refreshTokenExpiration: env.JWT_REFRESH_EXPIRATION || '7d',
	},
};
