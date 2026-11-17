import { sign as signApplication, type SignOptions } from "@electron/osx-sign";
import * as Effect from "effect/Effect";

export default async function sign(options: SignOptions): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await signApplication({ ...options, batchCodesignCalls: true });
      return;
    } catch (error) {
      if (
        attempt >= 8 ||
        !/A timestamp was expected but was not found|timestamp service is not available/i.test(
          String(error),
        )
      ) {
        throw error;
      }
      await Effect.runPromise(Effect.sleep(5000 * (attempt + 1)));
    }
  }
}
