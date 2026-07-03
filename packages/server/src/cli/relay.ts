#!/usr/bin/env node
// Per ND-18: this dispatcher must not load `node-pty`, `better-sqlite3`, or
// `fastify` at module-init time. `relay --help`, `relay --version`, and
// `relay attach` should run on a thin-client device that has Node 22 but no
// native build toolchain. Heavy modules are loaded via dynamic `await
// import(...)` inside the matching commander `.action()` callback. The
// top-level imports below are restricted to:
//   - commander (the dispatcher itself)
//   - cli/attach.js + cli/http.js (no native deps)
//   - error-class values needed by the global catch
//
// Adding a new subcommand whose handler pulls a heavy dep MUST use the
// dynamic-import pattern; an integration test guards against drift.

import { Command } from 'commander';

import { runAttach } from './attach.js';
import { CliHttpError, CliHttpUnreachableError } from './http.js';
import { runTokenCreate, runTokenList, runTokenRevoke } from './token.js';

const program = new Command();

program.name('relay').description('Relay — multi-device agent harness CLI').version('0.0.0');

program
  .command('init')
  .description(
    'First-run setup: scaffold ~/.relay/, mint initial bearer token, emit pairing snippet.',
  )
  .option('--url <url>', 'Server URL embedded in the pairing snippet')
  .option('--force', 'Overwrite an existing ~/.relay/ scaffold')
  .action(async (opts: { url?: string; force?: boolean }) => {
    // Lazy-load: init.ts opens better-sqlite3 to migrate the schema.
    const { runInit } = await import('./init.js');
    const result = runInit({ url: opts.url, force: opts.force });
    // Per ND-32: snippet first (also in last-pairing.txt), then the ephemeral
    // next-steps narrative bridge — guidance that is not persisted.
    process.stdout.write(result.pairingSnippet + '\n\n' + result.nextSteps + '\n');
  });

program
  .command('doctor')
  .description(
    'Diagnose a Relay install: probe credentials, `claude` on PATH, storage, and server reachability. Read-only.',
  )
  .action(async () => {
    // Per ND-35, the one P0 diagnostics deliverable. Lazy-load so the
    // dispatcher stays thin (ND-18); doctor.ts pulls only light deps (js-yaml,
    // fetch), never better-sqlite3.
    const { runDoctor } = await import('./doctor.js');
    const report = await runDoctor();
    const glyph = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL' } as const;
    process.stdout.write(`relay doctor (relay v${report.version})\n\n`);
    for (const check of report.checks) {
      process.stdout.write(`[${glyph[check.status]}] ${check.name} — ${check.detail}\n`);
      if (check.remediation !== undefined && check.status !== 'ok') {
        process.stdout.write(`         → ${check.remediation}\n`);
      }
    }
    process.stdout.write(
      `\n${report.ok ? 'All checks passed.' : 'One or more checks failed — see remediations above.'}\n`,
    );
    if (!report.ok) process.exitCode = 1;
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

const project = program
  .command('project')
  .description('Manage registered project working directories.');

project
  .command('add')
  .description(
    'Register <path> in place as a project (writes <path>/.relay/project.json and appends to .gitignore).',
  )
  .argument('<path>', 'Absolute or relative path to the project working directory')
  .option('--name <slug>', 'Override the auto-derived slug (kebab-case)')
  .option('--display-name <name>', 'Override the human-readable display name')
  .option('--agent-cli <cli>', 'Override the default agent CLI (claude)')
  .action(
    async (path: string, opts: { name?: string; displayName?: string; agentCli?: string }) => {
      // Lazy-load: project.ts pulls @techgardencode/relay store (better-sqlite3) +
      // the loopback REST client.
      const { runProjectAdd } = await import('./project.js');
      const row = await runProjectAdd({
        path,
        slug: opts.name,
        name: opts.displayName,
        agentCli: opts.agentCli,
      });
      process.stdout.write(`${row.id}\t${row.slug}\t${row.displayName}\t${row.canonicalPath}\n`);
    },
  );

project
  .command('list')
  .description('List registered projects (id, slug, displayName, canonicalPath).')
  .action(async () => {
    const { runProjectList } = await import('./project.js');
    const rows = runProjectList();
    if (rows.length === 0) {
      process.stdout.write('No projects.\n');
      return;
    }
    for (const row of rows) {
      process.stdout.write(`${row.id}\t${row.slug}\t${row.displayName}\t${row.canonicalPath}\n`);
    }
  });

project
  .command('remove')
  .description('Remove a project row (cascades sessions). The on-disk directory is NOT touched.')
  .argument('<id>', 'Project id from `relay project list`')
  .action(async (id: string) => {
    const { runProjectRemove } = await import('./project.js');
    await runProjectRemove(id);
    process.stdout.write(`Removed ${id}.\n`);
  });

// Per D-17: personas are descoped from MVP; the `relay persona` command block
// and the persona module were removed (restore: tag pre-cleanup-phase1).

const session = program.command('session').description('Inspect or kill agent sessions.');

session
  .command('list')
  .description('List sessions (defaults to --status running; --all shows every row).')
  .option('--all', 'Include rows for every status (alias for --status all)')
  .option('--status <status>', 'Filter: running | idle | killed | all', 'running')
  .option('--project-id <id>', 'Restrict to a single project id')
  .action(async (opts: { all?: boolean; status?: string; projectId?: string }) => {
    const status = opts.all === true ? 'all' : opts.status;
    if (
      status !== undefined &&
      status !== 'running' &&
      status !== 'idle' &&
      status !== 'killed' &&
      status !== 'all'
    ) {
      process.stderr.write(`relay session list: unknown --status '${status}'\n`);
      process.exitCode = 1;
      return;
    }
    const { runSessionList } = await import('./session.js');
    const rows = runSessionList({
      status: status as 'running' | 'idle' | 'killed' | 'all' | undefined,
      projectId: opts.projectId,
    });
    if (rows.length === 0) {
      process.stdout.write('No sessions.\n');
      return;
    }
    for (const row of rows) {
      const term = row.terminatedReason ?? '';
      process.stdout.write(
        `${row.id}\t${row.status}\t${row.projectId}\t${term}\t${String(row.totalBytes)}\n`,
      );
    }
  });

session
  .command('kill')
  .description(
    'Terminate a running session (DELETE /sessions/:id; transitions row to killed/operator_kill).',
  )
  .argument('<id>', 'Session id from `relay session list`')
  .action(async (id: string) => {
    const { runSessionKill } = await import('./session.js');
    await runSessionKill(id);
    process.stdout.write(`Killed ${id}.\n`);
  });

session
  .command('show')
  .description('Show one session row (id, status, project, total bytes, timestamps).')
  .argument('<id>', 'Session id')
  .action(async (id: string) => {
    const { runSessionShow } = await import('./session.js');
    const row = runSessionShow(id);
    if (row === undefined) {
      process.stderr.write(`No session with id ${id}.\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      [
        `id: ${row.id}`,
        `status: ${row.status}`,
        `projectId: ${row.projectId}`,
        `terminatedReason: ${row.terminatedReason ?? 'null'}`,
        `agentSessionId: ${row.agentSessionId ?? 'null'}`,
        `ptyPid: ${row.ptyPid === null ? 'null' : String(row.ptyPid)}`,
        `totalBytes: ${String(row.totalBytes)}`,
        `createdAt: ${row.createdAt}`,
        `updatedAt: ${row.updatedAt}`,
      ].join('\n') + '\n',
    );
  });

program
  .command('server')
  .description('Run the long-lived API + WebSocket process. Default config: ~/.relay/config.yaml.')
  .option('--config <path>', 'Override the path to config.yaml')
  .action(async (opts: { config?: string }) => {
    // Lazy-load: server.ts is the heaviest module — pulls fastify, node-pty
    // (via session/registry), and the full store. Per ND-18 nothing else
    // should reach into server.ts on the main code path.
    const { runServer } = await import('./server.js');
    const { app, config, shutdown } = await runServer({ configPath: opts.config });
    process.stdout.write(
      `relay server listening on http://${config.host}:${String(config.port)}\n`,
    );
    const onSignal = async (signal: NodeJS.Signals): Promise<void> => {
      process.stdout.write(`\n[relay] caught ${signal}, draining...\n`);
      try {
        await shutdown();
      } catch (err) {
        process.stderr.write(`[relay] shutdown error: ${(err as Error).message}\n`);
      }
      process.exit(0);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    void app;
    return new Promise<void>(() => {});
  });

program
  .command('attach')
  .description(
    'Thin terminal client. Streams PTY output and accepts input over /sessions/:id/stream.',
  )
  .argument('<session-id>', 'Target session id')
  .option('--url <url>', 'Override the server URL (default: ~/.relay/config.yaml)')
  .option('--token <token>', 'Override the bearer token (default: RELAY_TOKEN env)')
  .action(async (sessionId: string, opts: { url?: string; token?: string }) => {
    const code = await runAttach({
      sessionId,
      url: opts.url,
      token: opts.token,
    });
    if (code !== 0) process.exitCode = code;
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CliHttpUnreachableError) {
    process.stderr.write(
      `${err.message}\nHint: is the relay server running? Start it with \`relay server\`.\n`,
    );
    process.exit(3);
  }
  if (err instanceof CliHttpError) {
    process.stderr.write(`${err.message}\n`);
    process.exit(err.status >= 500 ? 4 : 2);
  }
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
