export class RiskService {
  // Placeholder for future risk management logic (limits, exposure, rules)
  constructor() {}

  // Example: check if a bet is allowed based on simple exposure limit
  isBetAllowed(userId: string, stake: number, oddsValue: number): boolean {
    // Minimal implementation for now: allow everything
    // TODO: implement exposure checks, max stake per user/event, etc.
    return true;
  }
}
