import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { AuthenticatedRequest } from '@/infrastructure/api/middleware/AuthMiddleware';

export type RequestLocals = Record<string, unknown>;

export type RequestWithContext<
  Params extends ParamsDictionary = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = ParsedQs,
  Locals extends RequestLocals = RequestLocals,
> = AuthenticatedRequest<Params, ResBody, ReqBody, ReqQuery, Locals> & {
  id?: string;
};

export type AsyncHandler<Req extends RequestWithContext = RequestWithContext, Res = unknown> = (
  req: Req,
  res: import('express').Response<Res>,
) => Promise<import('express').Response<Res>>;
