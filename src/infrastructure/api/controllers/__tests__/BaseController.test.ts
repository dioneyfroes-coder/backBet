import { Response } from 'express';
import { z } from 'zod';
import { BaseController } from '../BaseController';
import { AppError } from '@/shared/errors/AppError';

type MockResponse = Response & {
  statusCode?: number;
  body?: any;
  status: jest.MockedFunction<(code: number) => Response>;
  json: jest.MockedFunction<(payload: any) => Response>;
};

const createResponse = (): MockResponse => {
  const res: Partial<MockResponse> = {};
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res as MockResponse;
  });
  res.json = jest.fn().mockImplementation((payload: any) => {
    res.body = payload;
    return res as MockResponse;
  });
  return res as MockResponse;
};

class TestController extends BaseController {
  public okResponse<T>(res: Response, data: T, statusCode?: number) {
    return this.ok(res, data, statusCode);
  }

  public createdResponse<T>(res: Response, data: T) {
    return this.created(res, data);
  }

  public badRequestResponse(res: Response, message: string, details?: Record<string, any>) {
    return this.badRequest(res, message, details);
  }

  public unauthorizedResponse(res: Response, message?: string) {
    return this.unauthorized(res, message);
  }

  public forbiddenResponse(res: Response, message?: string) {
    return this.forbidden(res, message);
  }

  public notFoundResponse(res: Response, message?: string) {
    return this.notFound(res, message);
  }

  public conflictResponse(res: Response, message: string) {
    return this.conflict(res, message);
  }

  public internalErrorResponse(res: Response, message?: string) {
    return this.internalError(res, message);
  }

  public validate<T>(schema: z.ZodSchema<T>, data: unknown) {
    return this.validateSchema(schema, data);
  }

  public async handle(res: Response, error: unknown) {
    return this.handleError(error, res);
  }
}

describe('BaseController helpers', () => {
  const controller = new TestController();
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('builds ok responses with metadata', () => {
    const res = createResponse();
    controller.okResponse(res, { id: 1 });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      success: true,
      data: { id: 1 },
      meta: {
        timestamp: expect.any(String),
      },
    });
  });

  it('builds created responses with status 201', () => {
    const res = createResponse();
    controller.createdResponse(res, { created: true });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body?.success).toBe(true);
  });

  it('builds error responses for the common helpers', () => {
    const res = createResponse();
    controller.badRequestResponse(res, 'Bad', { field: 'error' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.error).toEqual({
      code: 'BAD_REQUEST',
      message: 'Bad',
      details: { field: 'error' },
    });

    const unauthorized = createResponse();
    controller.unauthorizedResponse(unauthorized);
    expect(unauthorized.status).toHaveBeenCalledWith(401);

    const forbidden = createResponse();
    controller.forbiddenResponse(forbidden);
    expect(forbidden.status).toHaveBeenCalledWith(403);

    const notFound = createResponse();
    controller.notFoundResponse(notFound);
    expect(notFound.status).toHaveBeenCalledWith(404);

    const conflict = createResponse();
    controller.conflictResponse(conflict, 'Exists');
    expect(conflict.status).toHaveBeenCalledWith(409);

    const internal = createResponse();
    controller.internalErrorResponse(internal, 'Boom');
    expect(internal.status).toHaveBeenCalledWith(500);
  });

  it('validates schemas and throws AppError with details when invalid', () => {
    const schema = z.object({ amount: z.number().min(1) });

    expect(controller.validate(schema, { amount: 10 })).toEqual({ amount: 10 });

    try {
      controller.validate(schema, { amount: 0 });
      fail('Should throw for invalid payload');
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe('VALIDATION_ERROR');
      expect(appError.details).toEqual({ amount: expect.stringContaining('>=') });
    }
  });

  it('handleError maps AppError correctly', async () => {
    const res = createResponse();
    await controller.handle(res, new AppError('DOMAIN', 'domain boom', 422, { foo: 'bar' }));

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.body?.error).toEqual({
      code: 'DOMAIN',
      message: 'domain boom',
      details: { foo: 'bar' },
    });
  });

  it('handleError maps validation error objects', async () => {
    const res = createResponse();
    await controller.handle(res, {
      code: 'VALIDATION_ERROR',
      message: 'invalid',
      details: { email: 'invalid' },
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.error).toEqual({
      code: 'BAD_REQUEST',
      message: 'invalid',
      details: { email: 'invalid' },
    });
  });

  it('handleError maps ZodError instances to bad request', async () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 'bad' });
    if (result.success) {
      throw new Error('Expected failure');
    }

    const res = createResponse();
    await controller.handle(res, result.error);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body?.error?.code).toBe('BAD_REQUEST');
    expect(res.body?.error?.details).toEqual({ email: expect.stringContaining('Invalid email') });
  });

  it('handleError falls back to internal error', async () => {
    const res = createResponse();
    await controller.handle(res, new Error('unexpected'));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body?.error).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'unexpected',
    });
  });
});
