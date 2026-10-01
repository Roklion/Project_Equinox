// xirr 1.1.0 is CommonJS and ships no TypeScript declarations.
// Declare only the public options used by Equinox.
declare module "xirr" {
  function xirr(
    transactions: { amount: number; when: Date }[],
    options?: { guess?: number; tolerance?: number; maxIterations?: number },
  ): number;
  export = xirr;
}
