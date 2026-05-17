#!/usr/bin/env node
import { Command } from 'commander';

import { runInit } from './init.js';
import { runTokenCreate, runTokenList, runTokenRevoke } from './token.js';

const program = new Command();

program.name('relay').description('Relay — multi-device agent harness CLI').version('0.0.0');

program
  .command('init')
  .description(
    'First-run setup: scaffold ~/.relay/, copy default personas, mint initial bearer token, emit pairing snippet.',
  )
  .option('--url <url>', 'Server URL embedded in the pairing snippet')
  .option('--force', 'Overwrite an existing ~/.relay/ scaffold')
  .action((opts: { url?: string; force?: boolean }) => {
    const result = runInit({ url: opts.url, force: opts.force });
    process.stdout.write(result.pairingSnippet + '\n');
  });

const token = program
  .command('token')
  .description('Manage bearer tokens stored in ~/.relay/tokens.json');

token
  .command('create')
  .description('Mint a new bearer token. The plaintext is printed once.')
  .requiredOption('--device <name>', 'Human-readable label for this device')
  .action((opts: { device: string }) => {
    const { tokenId, plaintext } = runTokenCreate(opts.device);
    process.stdout.write(`Token (id ${tokenId}): ${plaintext}\n`);
    process.stdout.write('Copy now — the plaintext is shown exactly once.\n');
  });

token
  .command('revoke')
  .description('Revoke a token by id. In-flight WebSockets close on next message boundary.')
  .argument('<id>', 'Token id (from `relay token list` or the create output)')
  .action((id: string) => {
    const { revoked } = runTokenRevoke(id);
    if (revoked) {
      process.stdout.write(`Revoked ${id}.\n`);
    } else {
      process.stderr.write(`No active token with id ${id}. (Already revoked, or id not found.)\n`);
      process.exitCode = 1;
    }
  });

token
  .command('list')
  .description(
    'List bearer tokens (id, device label, createdAt, revokedAt). Never prints plaintext or hash.',
  )
  .action(() => {
    const rows = runTokenList();
    if (rows.length === 0) {
      process.stdout.write('No tokens.\n');
      return;
    }
    const lines = rows.map((r) => {
      const status = r.revokedAt === null ? 'active' : `revoked ${r.revokedAt}`;
      return `${r.id}\t${r.deviceLabel}\t${r.createdAt}\t${status}`;
    });
    process.stdout.write(lines.join('\n') + '\n');
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
