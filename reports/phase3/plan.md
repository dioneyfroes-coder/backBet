# Fase 3 – Melhorias no Core/Domain (Plano)
_Data: 2025-11-22_

## Objetivos Principais
1. **Refinar Entidades e Objetos de Valor**
   - Revisar `Bet`, `Event`, `Wallet`, `Transaction`, `User` para garantir invariantes claras, construtores enxutos e métodos expressivos.
   - Consolidar validações (evitar duplicidade entre controllers e domínio) e remover campos opcionais sem uso.
2. **Simplificar Casos de Uso Críticos**
   - `PlaceBet`, `CancelBet`, `ResolveBet`, `Deposit`, `Withdraw`, `RegisterUser`: garantir coordenação explícita de serviços, tratamento previsível de erros e logs/coerência transacional.
3. **Organizar Testes Próximos ao Domínio**
   - Garantir que testes unitários estejam dentro de `__tests__` no mesmo módulo e cubram os novos fluxos (especialmente invariantes e uso dos novos objetos de valor).

## Alvos Prioritários
| Área | Gargalo Atual | Ação Planejada |
| --- | --- | --- |
| `BetService` & Use Cases | Mistura de regras de domínio e orquestração; muitos `new Date()` e strings soltos | Extrair serviços/coordenadores, padronizar `Result` (enum), encapsular criação de bet via fábrica.
| `WalletService` & VO | Métodos aceitam números crus; validações repetidas em controllers | Adotar `Money`/`Currency` VO e centralizar validação de saldo/limites.
| `RegisterUser` | Orquestração rígida com `WalletService` concreto | Introduzir porta/`IWalletService` e permitir mocking; mover lógica de currency default para domínio.
| `Domain Entities` | Várias validações inline e getters/setters verbosos | Criar helpers utilitários, remover `AppError` da camada pura (retornar erros específicos/domínio).

## Critérios de Pronto
- Entidades expõem apenas invariantes necessárias e lançam erros específicos do domínio (`DomainError` ou similar) sem dependências de infraestrutura.
- Casos de uso não repetem validações já cobertas pelo domínio e possuem testes cobrindo caminhos felizes e exceções.
- Estrutura de testes: cada módulo `core/*/domain` e `core/*/application` possui `__tests__` com cobertura dos novos comportamentos.
- `npm run test` continua passando com cobertura >= atual; `npm run lint` permanece limpo.

## Riscos & Dependências
- **Clerk SDK**: ainda em migração planejada para Fase 4; manter mocks simples nos testes.
- **Mudanças em Wallet**: tocar valores monetários pode impactar integração com controllers; planejar fases pequenas e rodar testes de integração após cada bloco.
- **Tempo**: reorganização de testes pode ser extensa. Priorizar módulos mais críticos (betting/finance) e deixar módulos menores para Fase 4, se necessário.

## Próximos Passos
1. Criar `DomainError` base e revisar entidades `Bet`/`Event` para usar erros do domínio.
2. Refatorar `BetService` + use cases (`place/cancel/resolve`) para separar criação de `Bet` e injetar dependências por interface.
3. Revisar `WalletService` e DTOs (`Deposit/Withdraw`) para usar objetos de valor e validar limites.
4. Atualizar e reorganizar testes unitários, garantindo que residam junto dos módulos afetados.
