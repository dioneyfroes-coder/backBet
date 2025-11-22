import './env';

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

/**
 * CONFIGURAÇÃO CENTRALIZADA DA APLICAÇÃO
 *
 * Centraliza todas as configurações de forma segura e organizada.
 * Separação entre configurações públicas e sensíveis.
 */

export const appConfig = {
	env: process.env.NODE_ENV || 'development',
	server: {
		port: parsePositiveInt(process.env.PORT, 3000),
	},
	rateLimit: {
		windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 600000), // 10 minutos
		max: parsePositiveInt(process.env.RATE_LIMIT_MAX, 5000), // alto para ambiente dev
		message:
			process.env.RATE_LIMIT_MESSAGE ||
			'Você excedeu o limite de requisições. Aguarde alguns instantes antes de tentar novamente.',
		enabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, true),
	},
	authRateLimit: {
		register: {
			windowMs: parsePositiveInt(process.env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(process.env.AUTH_REGISTER_RATE_LIMIT_MAX, 10),
			message:
				process.env.AUTH_REGISTER_RATE_LIMIT_MESSAGE ||
				'Muitas tentativas de registro. Tente novamente em alguns segundos.',
		},
		login: {
			windowMs: parsePositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX, 15),
			message:
				process.env.AUTH_LOGIN_RATE_LIMIT_MESSAGE ||
				'Muitas tentativas de login. Aguarde alguns segundos antes de tentar novamente.',
		},
		refresh: {
			windowMs: parsePositiveInt(process.env.AUTH_REFRESH_RATE_LIMIT_WINDOW_MS, 60_000),
			max: parsePositiveInt(process.env.AUTH_REFRESH_RATE_LIMIT_MAX, 30),
			message:
				process.env.AUTH_REFRESH_RATE_LIMIT_MESSAGE ||
				'Você excedeu o limite de refresh tokens. Tente novamente em breve.',
		},
	},
};
