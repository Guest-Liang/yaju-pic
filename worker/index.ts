import { handleRequest } from "./routes"
import { jsonError } from "./responses"

export default {
  async fetch(
    request: Request,
    env: Env,
    _context: ExecutionContext,
  ): Promise<Response> {
    try {
      return await handleRequest(request, env)
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "unhandled request error",
          method: request.method,
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      return jsonError("服务异常", 500)
    }
  },
} satisfies ExportedHandler<Env>
