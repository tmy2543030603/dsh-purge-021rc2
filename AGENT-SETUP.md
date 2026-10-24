# Agent Setup

This repository ships a **prebuilt tarball** of the `dsh-purge` workspace plugin.
Installing it is a file-copy operation: verify, back up, unpack, write version stamps.
No build step, no network, no compilation.

## Facts

| | |
|---|---|
| Plugin package | `dsh-purge@1.1.72-dsh021rc2.4` |
| Target host | `@deepseek-ai/dsh` / `dsh-base` **0.2.1-rc.2**, `web` profile |
| Archive | `dsh-purge-1.1.72-dsh021rc2.4.tgz` (2.0 MB, 105 files) |
| Checksum | `SHA256SUMS.txt` |
| Install path | `$DSH_HOME/profiles/web/node_modules/dsh-purge` |
| DSH home | `$DSH_HOME`, default `~/.dsh` |

## One command

```sh
node scripts/setup-local.mjs            # installs
node scripts/setup-local.mjs --dry-run  # prints the plan, writes nothing
```

The script verifies SHA-256, renames any existing install to
`dsh-purge.<timestamp>.bak`, unpacks with `--strip-components=1`, and writes
`installed-rev` + `applied.json` under `$DSH_HOME/dsh-purge/` so the host does
not think the plugin is stale on first start.

## Manual equivalent

```sh
shasum -a 256 -c SHA256SUMS.txt
DEST="$DSH_HOME/profiles/web/node_modules"
[ -d "$DEST/dsh-purge" ] && mv "$DEST/dsh-purge" "$DEST/dsh-purge.$(date +%Y%m%d-%H%M%S).bak"
mkdir -p "$DEST/dsh-purge"
tar xzf dsh-purge-1.1.72-dsh021rc2.4.tgz -C "$DEST/dsh-purge" --strip-components=1
```

## Post-install

1. Quit DSH completely and reopen it — the plugin patches already-loaded JS, so a
   restart is required for the panel to appear.
2. Sidebar → **Purge** → status page → **Apply**. The panel should report
   `69 patch rows / 0 pending`.
3. Open a fresh conversation; the configuration applies from the next turn.

## Rollback

```sh
rm -rf "$DSH_HOME/profiles/web/node_modules/dsh-purge"
mv "$DSH_HOME/profiles/web/node_modules/dsh-purge.<timestamp>.bak" \
   "$DSH_HOME/profiles/web/node_modules/dsh-purge"
```

`dsh-purge revert` also restores the host files it patched, keeping
`$DSH_HOME/prompt-inject.md` untouched.

## Self-check

```sh
node -e "import('./lib/index.js').then(m=>console.log(Object.keys(m).length+' exports ok'))"
node test/identity.test.mjs
node test/patches.test.mjs
```

`patches.test.mjs` reports host-dependent rows as `skip (no DSH host)` when the
`@deepseek-ai/dsh` package is not resolvable from this directory. That is
expected for a standalone checkout and does not indicate a broken plugin.
