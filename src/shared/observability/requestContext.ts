import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextState {
  requestId: string;
  userId?: string | null;
}

const storage = new AsyncLocalStorage<RequestContextState>();

export const runWithRequestContext = (context: RequestContextState, callback: () => void): void => {
  storage.run(context, callback);
};

export const getRequestContext = (): RequestContextState | undefined => storage.getStore();

export const updateRequestContext = (partial: Partial<RequestContextState>): void => {
  const store = storage.getStore();
  if (store) {
    Object.assign(store, partial);
  }
};
