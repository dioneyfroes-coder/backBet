import { z } from 'zod';
import { Odds } from '@core/odds/domain/value-objects/Odds';

export const OddsSchema = z
  .number()
  .min(Odds.MIN_VALUE, { message: `Odds must be greater than or equal to ${Odds.MIN_VALUE}` })
  .max(Odds.MAX_VALUE, { message: `Odds cannot be greater than ${Odds.MAX_VALUE}` });

export type OddsSchemaType = z.infer<typeof OddsSchema>;
