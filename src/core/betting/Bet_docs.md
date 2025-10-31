# Domínio de Apostas (Betting)

## Visão Geral
O domínio de apostas é responsável por gerenciar todas as operações relacionadas às apostas dos usuários. Isso inclui a criação, gerenciamento e resolução de apostas, bem como o cálculo de odds e pagamentos.

## Conceitos Principais

### 1. Aposta (Bet)
- **Identificador**: ID único da aposta
- **Usuário**: Referência ao usuário que fez a aposta
- **Valor**: Quantia apostada
- **Status**: Estado atual da aposta (PENDING, WON, LOST, CANCELED)
- **Data de Criação**: Momento em que a aposta foi feita
- **Data de Resolução**: Momento em que a aposta foi resolvida
- **Odds**: Cotação da aposta no momento em que foi feita
- **Potencial de Retorno**: Valor potencial a ser ganho
- **Tipo**: Tipo de aposta (SINGLE, MULTIPLE)

### 2. Evento (Event)
- **Identificador**: ID único do evento
- **Nome**: Nome do evento
- **Data**: Data e hora do evento
- **Status**: Estado do evento (SCHEDULED, LIVE, FINISHED, CANCELED)
- **Categoria**: Categoria do evento (ex: FOOTBALL, BASKETBALL)
- **Participantes**: Times ou jogadores envolvidos
- **Mercados**: Tipos de apostas disponíveis para o evento

### 3. Mercado (Market)
- **Identificador**: ID único do mercado
- **Tipo**: Tipo de mercado (WIN_DRAW_WIN, OVER_UNDER, etc)
- **Status**: Estado do mercado (OPEN, SUSPENDED, CLOSED)
- **Odds**: Lista de cotações disponíveis
- **Resultado**: Resultado final do mercado
- **Limites**: Limites mínimos e máximos de aposta

### 4. Odd
- **Valor**: Cotação numérica
- **Tipo**: Tipo de resultado (HOME_WIN, AWAY_WIN, DRAW, etc)
- **Status**: Estado da odd (ACTIVE, SUSPENDED)
- **Timestamp**: Momento da última atualização

## Regras de Negócio

### 1. Criação de Apostas
1. O usuário deve ter saldo suficiente para a aposta
2. O valor da aposta deve estar dentro dos limites do mercado
3. As odds devem estar ativas no momento da aposta
4. O evento não pode ter começado (para apostas pré-jogo)

### 2. Gerenciamento de Risco
1. Limites de aposta por usuário/evento/mercado
2. Monitoramento de padrões suspeitos
3. Ajuste automático de odds baseado no volume de apostas

### 3. Resolução de Apostas
1. Verificação automática do resultado
2. Cálculo correto do valor de pagamento
3. Atualização do saldo do usuário
4. Registro do histórico de apostas

### 4. Validações
1. Verificação de idade e localização do usuário
2. Verificação de limites de apostas
3. Verificação de conflitos de interesse
4. Validação de odds no momento da aposta

## Use Cases

### 1. Fazer Aposta
```typescript
interface PlaceBetDTO {
  userId: string;
  eventId: string;
  marketId: string;
  oddId: string;
  amount: number;
  type: 'SINGLE' | 'MULTIPLE';
}
```

### 2. Cancelar Aposta
```typescript
interface CancelBetDTO {
  betId: string;
  reason: string;
  canceledBy: string;
}
```

### 3. Resolver Aposta
```typescript
interface ResolveBetDTO {
  betId: string;
  result: 'WON' | 'LOST';
  marketResult: string;
}
```

## Value Objects

### 1. Odds
```typescript
class Odds {
  constructor(
    public readonly value: number,
    public readonly type: string
  ) {
    this.validate();
  }
}
```

### 2. BetAmount
```typescript
class BetAmount {
  constructor(
    public readonly value: number,
    public readonly currency: string
  ) {
    this.validate();
  }
}
```

## Entidades

### 1. Bet
```typescript
interface Bet {
  id: string;
  userId: string;
  eventId: string;
  marketId: string;
  amount: BetAmount;
  odds: Odds;
  status: BetStatus;
  type: BetType;
  createdAt: Date;
  resolvedAt?: Date;
  potentialReturn: number;
}
```

### 2. Event
```typescript
interface Event {
  id: string;
  name: string;
  startDate: Date;
  status: EventStatus;
  category: string;
  participants: string[];
  markets: Market[];
}
```

## Serviços

### 1. BetService
- Gerenciamento do ciclo de vida das apostas
- Validações de regras de negócio
- Cálculo de retornos potenciais
- Integração com sistema de pagamentos

### 2. OddsService
- Gerenciamento de odds
- Atualização em tempo real
- Cálculo de margens
- Ajuste baseado em volume

### 3. RiskManagementService
- Avaliação de risco por aposta
- Monitoramento de padrões
- Ajuste de limites
- Detecção de fraudes

## Eventos de Domínio

1. `BetPlaced`: Quando uma nova aposta é feita
2. `BetCanceled`: Quando uma aposta é cancelada
3. `BetResolved`: Quando uma aposta é resolvida
4. `OddsChanged`: Quando as odds são atualizadas
5. `MarketClosed`: Quando um mercado é fechado
6. `EventStarted`: Quando um evento começa
