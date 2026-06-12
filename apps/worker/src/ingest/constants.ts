/**
 * pump.fun on-chain program.
 *
 * ⚠ RE-VERIFY before going live (handoff Section 5):
 *   1. Confirm this program ID against current Helius docs / explorers.
 *   2. Confirm the create-instruction discriminator with at least one
 *      sample transaction.
 *   3. Confirm the deployer == create-instruction signer/creator field
 *      mapping with 3 sample transactions before trusting it.
 */
export const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

/** Helius enhanced-transaction labels for pump.fun token creates. */
export const HELIUS_CREATE_TYPE = 'CREATE';
export const HELIUS_PUMP_FUN_SOURCE = 'PUMP_FUN';

export const VENUE_PUMPFUN = 'pumpfun';
