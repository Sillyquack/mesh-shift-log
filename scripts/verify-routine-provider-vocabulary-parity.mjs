// Permanent CI entry point for the complete exact 1.5R provider-vocabulary sweep.
// The Phase 10AC verifier builds a production-shaped disposable database, compares
// every provider closed vocabulary to the resulting constraints/server contract,
// and checks every corresponding canonical manager-editor vocabulary.
await import("./verify-phase10ac-location-vocabulary.mjs");
