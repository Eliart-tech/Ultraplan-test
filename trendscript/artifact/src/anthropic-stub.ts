/**
 * Stand-in for `@anthropic-ai/sdk` in the HTML edition bundle. The edition
 * never calls the Anthropic API (no key; Claude is reached through the
 * claude.ai `sample` capability instead), but the server code keeps its
 * `instanceof` checks on the SDK's error classes: they exist here, distinct,
 * and are simply never thrown.
 */

class AnthropicError extends Error {}
class APIError extends AnthropicError {
  status?: number;
  error?: unknown;
}
class APIUserAbortError extends APIError {}
class APIConnectionError extends APIError {}
class APIConnectionTimeoutError extends APIConnectionError {}
class BadRequestError extends APIError {}
class AuthenticationError extends APIError {}
class PermissionDeniedError extends APIError {}
class NotFoundError extends APIError {}
class RateLimitError extends APIError {}
class InternalServerError extends APIError {}

export default class Anthropic {
  static AnthropicError = AnthropicError;
  static APIError = APIError;
  static APIUserAbortError = APIUserAbortError;
  static APIConnectionError = APIConnectionError;
  static APIConnectionTimeoutError = APIConnectionTimeoutError;
  static BadRequestError = BadRequestError;
  static AuthenticationError = AuthenticationError;
  static PermissionDeniedError = PermissionDeniedError;
  static NotFoundError = NotFoundError;
  static RateLimitError = RateLimitError;
  static InternalServerError = InternalServerError;

  constructor() {
    throw new Error("Édition HTML : l'API Anthropic n'est pas utilisée (Claude passe par votre compte claude.ai).");
  }
}
