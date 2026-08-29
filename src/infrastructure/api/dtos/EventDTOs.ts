import { z } from 'zod';

const dateTransform = z
  .union([z.string(), z.number()])
  .optional()
  .refine((value) => {
    if (typeof value === 'undefined') {
      return true;
    }
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
  }, 'Data inválida')
  .transform((value) => (typeof value === 'undefined' ? undefined : new Date(value)));

const positiveInt = z
  .union([z.string(), z.number()])
  .transform((value) => {
    if (typeof value === 'number') {
      return value;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? NaN : parsed;
  })
  .refine((value) => Number.isFinite(value) && value > 0, {
    message: 'deve ser um inteiro positivo',
  });

const nonNegativeInt = z
  .union([z.string(), z.number()])
  .transform((value) => {
    if (typeof value === 'number') {
      return value;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? NaN : parsed;
  })
  .refine((value) => Number.isFinite(value) && value >= 0, {
    message: 'offset deve ser um inteiro não negativo',
  });

export const ListEventsQueryDTO = z.object({
  status: z.enum(['SCHEDULED', 'LIVE', 'FINISHED', 'CANCELED']).optional(),
  category: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (Array.isArray(value)) {
        return value[0];
      }
      return value;
    })
    .transform((value) => (value ? value.trim() : undefined)),
  dateFrom: dateTransform,
  dateTo: dateTransform,
  limit: positiveInt.optional(),
  offset: nonNegativeInt.optional(),
  search: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => (Array.isArray(value) ? value[0] : value))
    .transform((value) => (value ? value.trim() : undefined)),
});

export const UpdateEventStatusDTO = z.object({
  action: z.enum(['START', 'FINISH', 'CANCEL']),
});

export type ListEventsQueryDTOType = z.infer<typeof ListEventsQueryDTO>;
export type UpdateEventStatusDTOType = z.infer<typeof UpdateEventStatusDTO>;
