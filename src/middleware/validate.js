/**
 * Express middleware generator that validates request parts using Zod schemas.
 * @param {object} schemas
 * @param {import('zod').ZodSchema} [schemas.params]
 * @param {import('zod').ZodSchema} [schemas.query]
 * @param {import('zod').ZodSchema} [schemas.body]
 */
export function validateRequest({ params, query, body } = {}) {
  return (req, res, next) => {
    try {
      if (params) {
        req.params = params.parse(req.params);
      }
      if (query) {
        req.query = query.parse(req.query);
      }
      if (body) {
        req.body = body.parse(req.body);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export default validateRequest;
