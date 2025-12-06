import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

type AsyncRouteHandler<
  Params extends ParamsDictionary = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = ParsedQs,
  Req extends Request<Params, ResBody, ReqBody, ReqQuery> = Request<
    Params,
    ResBody,
    ReqBody,
    ReqQuery
  >,
> = (req: Req, res: Response<ResBody>) => Promise<Response<ResBody>>;

export const asyncHandler = <
  Params extends ParamsDictionary = ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = ParsedQs,
  Req extends Request<Params, ResBody, ReqBody, ReqQuery> = Request<
    Params,
    ResBody,
    ReqBody,
    ReqQuery
  >,
>(
  fn: AsyncRouteHandler<Params, ResBody, ReqBody, ReqQuery, Req>,
): RequestHandler<Params, ResBody, ReqBody, ReqQuery> => {
  return (
    req: Request<Params, ResBody, ReqBody, ReqQuery>,
    res: Response<ResBody>,
    next: NextFunction,
  ) => {
    Promise.resolve(fn(req as Req, res)).catch(next);
  };
};

export default asyncHandler;
