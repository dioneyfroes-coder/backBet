import { config } from 'dotenv';

/**
 * Carregamento de variáveis de ambiente
 * Este arquivo deve ser importado ANTES de qualquer outro módulo que dependa de configurações.
 */

const result = config();

if (result.error && (result.error as { code?: string }).code !== 'ENOENT') {
	console.warn('Falha ao carregar .env:', result.error.message);
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const isTestEnv = NODE_ENV === 'test';
const isProduction = NODE_ENV === 'production';

const assignDefault = (name: string, value: string): void => {
	if (!process.env[name]) {
		process.env[name] = value;
	}
};

if (isTestEnv) {
	assignDefault('JWT_SECRET', 'test-secret');
	assignDefault('CLERK_SECRET_KEY', 'sk_test_dummy');
	assignDefault('CLERK_PUBLISHABLE_KEY', 'pk_test_dummy');
	assignDefault('MONGODB_URI', 'mongodb://localhost:27017/backbet-test');
	assignDefault('REDIS_URL', 'redis://localhost:6379');
}

const requiredAlways = ['JWT_SECRET'];
const requiredInProduction = ['CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'MONGODB_URI', 'REDIS_URL'];

const missingAlways = requiredAlways.filter((name) => !process.env[name]);
if (missingAlways.length > 0) {
	throw new Error(`Missing required environment variables: ${missingAlways.join(', ')}`);
}

if (isProduction) {
	const missingProdVars = requiredInProduction.filter((name) => !process.env[name]);
	if (missingProdVars.length > 0) {
		throw new Error(`Missing required production environment variables: ${missingProdVars.join(', ')}`);
	}

	if (process.env.CLERK_SECRET_KEY?.includes('sk_test')) {
		throw new Error('CLERK_SECRET_KEY deve usar uma chave live em produção');
	}

	if (process.env.CLERK_PUBLISHABLE_KEY?.includes('pk_test')) {
		throw new Error('CLERK_PUBLISHABLE_KEY deve usar uma chave live em produção');
	}
}

type AppEnv = NodeJS.ProcessEnv & {
	NODE_ENV?: string;
	JWT_SECRET: string;
	CLERK_SECRET_KEY?: string;
	CLERK_PUBLISHABLE_KEY?: string;
	CLERK_API_KEY?: string;
	CLERK_API_URL?: string;
	MONGODB_URI?: string;
	REDIS_URL?: string;
};

export const env = process.env as AppEnv;
