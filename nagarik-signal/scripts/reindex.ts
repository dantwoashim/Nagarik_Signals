import { PROGRAM_ID, getConnection } from './lib/nagarikClient';

async function main() {
  const connection = getConnection();
  const accounts = await connection.getProgramAccounts(PROGRAM_ID);

  console.log(JSON.stringify({
    ok: true,
    mode: 'chain_account_scan',
    programId: PROGRAM_ID.toBase58(),
    accountCount: accounts.length,
    accounts: accounts.map(({ pubkey, account }) => ({
      pubkey: pubkey.toBase58(),
      lamports: account.lamports,
      owner: account.owner.toBase58(),
      dataLength: account.data.length,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
