Fase 1 – Pontos Críticos de Performance

Data: 2025-11-22

Camada HTTP

Acessos duplicados ao repositório: WalletController.deposit/withdraw chama GetWalletUseCase.execute para checar existência e depois o caso de uso (Deposit/Withdraw), que consulta o repositório novamente via WalletService.ensureWalletExists. Isso dobra a latência e a carga no DB. Devemos confiar no serviço e deixar ele lançar NOT_FOUND.

Escopo do middleware de cache: Apenas endpoints GET de wallet usam cacheResponse. Odds, perfil do usuário e listagem de apostas ainda consultam repositórios a cada requisição, apesar de existirem helpers de cache.

Sobrecarga de logging: loggingMiddleware substitui res.send para capturar duração. Em payloads grandes/streaming isso clona buffers e pode bloquear o event loop; usar on('finish') é mais leve.

Domínio & Persistência

Cálculo numérico do Wallet: Saldos usam números JavaScript, arriscando drift de ponto flutuante em alto volume. Um value object decimal/money evitaria erros de arredondamento sem conversões repetidas.

Abstração de repositório: Repositórios em memória e Mongo coexistem; sem uma fábrica rígida, alguns caminhos (especialmente testes) podem usar in-memory enquanto produção usa Mongo, complicando tuning e cache.

Armazenamento de transações: Wallet mantém _transactions em memória e faz prepend a cada operação; históricos grandes incham a memória do processo e tornam .unshift mais lento. Recuperação deveria paginar da persistência.

Cache & Redis

Invalidação de cache: flushWalletCache roda após depósitos/saques, mas odds e perfil de usuário não têm flush em todos os controllers, causando leituras obsoletas ou forçando TTLs curtos.

Polling de métricas de cache: updateCacheMetrics roda a cada 3s mesmo com cache desativado; embora retorne cedo, o intervalo continua acordando. Devemos iniciar o intervalo apenas quando cacheConfig.enabled.

Observabilidade

Cardinalidade de histogramas: httpRequestLatency etiqueta cada path único (inclui req.path quando não há metadata). Paths dinâmicos (ex.: /bets/123) explodem o número de séries no Prometheus.

Pipeline de Build/Test

Execução em matrix: O CI roda testes em Node 18 e 20, embora o target do TS seja ES2020; remover Node antigo reduziria tempo de execução.

Próximos Passos

Remover buscas redundantes em controllers e confiar nas exceções do serviço.

Ampliar cobertura de cache (perfil do usuário, odds) e garantir hooks de invalidação para cada mutação.

Trocar sobrescrita manual de res.send por logging via res.on('finish') para evitar cópia de payload.

Impor um backend único de persistência por ambiente via fábrica + flags de configuração.

Introduzir matemática decimal (ex.: Decimal.js ou um VO Money) para saldos e persistir histórico de transações em batch no DB.