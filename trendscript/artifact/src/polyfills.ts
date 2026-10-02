/**
 * Small polyfills for the browser APIs the server code relies on
 * (crypto.randomUUID, AbortSignal.timeout / AbortSignal.any), for older
 * viewers and non-secure contexts.
 */

export function installPolyfills(): void {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (cryptoObject && typeof cryptoObject.randomUUID !== "function") {
    Object.defineProperty(cryptoObject, "randomUUID", {
      configurable: true,
      value: () => {
        const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      },
    });
  }

  const signalClass = AbortSignal as unknown as {
    timeout?: (ms: number) => AbortSignal;
    any?: (signals: AbortSignal[]) => AbortSignal;
  };
  if (typeof signalClass.timeout !== "function") {
    signalClass.timeout = (ms: number) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Délai dépassé", "TimeoutError")), ms);
      return controller.signal;
    };
  }
  if (typeof signalClass.any !== "function") {
    signalClass.any = (signals: AbortSignal[]) => {
      const controller = new AbortController();
      for (const signal of signals) {
        if (signal.aborted) {
          controller.abort(signal.reason);
          break;
        }
        signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
      }
      return controller.signal;
    };
  }
}
