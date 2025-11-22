import { config } from 'dotenv';

/**
 * Carregamento de variáveis de ambiente
 * Este arquivo deve ser importado ANTES de qualquer outro módulo que dependa de configurações.
 */

const result = config();

if (result.error && (result.error as { code?: string }).code !== 'ENOENT') {
	console.warn('Falha ao carregar .env:', result.error.message);
}

export const env = process.env;
