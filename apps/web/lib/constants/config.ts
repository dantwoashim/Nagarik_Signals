export const appConfig = {
  name: 'Nagarik Signal',
  tagline: 'Public proof for public problems.',
  positioning: 'A public record for what was reported, what was sourced, and what changed next.',
  cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet',
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
  programId: process.env.NEXT_PUBLIC_NAGARIK_PROGRAM_ID ?? '76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY',
};
