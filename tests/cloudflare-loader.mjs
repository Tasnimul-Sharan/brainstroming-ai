const cloudflareWorkersStub =
  "data:text/javascript,export const env = Object.create(null);";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: cloudflareWorkersStub, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
