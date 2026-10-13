export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = 'Please sign in again') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (code: string, msg: string) => new HttpError(403, code, msg);
export const badRequest = (msg: string) => new HttpError(400, 'bad_request', msg);
export const notFound = (msg = 'Not found') => new HttpError(404, 'not_found', msg);
