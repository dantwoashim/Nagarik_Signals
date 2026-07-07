export const nagarikSignalIdl = {
  name: 'nagarik_signal',
  instructions: [
    'initialize_registry',
    'add_steward',
    'revoke_steward',
    'create_issue',
    'verify_issue',
    'update_status',
  ],
  accounts: ['Registry', 'Steward', 'Issue', 'Verification', 'StatusUpdate'],
} as const;
