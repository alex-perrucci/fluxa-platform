# PostgreSQL backup and restore

## Backup

`pg_dump` and `pg_restore` must be installed on the operator machine.

```powershell
$env:DATABASE_URL = "<PRODUCTION_DATABASE_URL>"
$env:DATABASE_SSL = "true"
$env:RELEASE_SHA = "<DEPLOYED_GIT_SHA>"

npm run backup:postgres -- --label pre-release
```

The command creates:

- a PostgreSQL custom-format dump;
- a JSON manifest containing size and SHA-256;
- no printed database password.

Store the dump and manifest in encrypted, access-controlled storage outside the
application host.

## Integrity check

```powershell
npm run backup:verify -- --file release-artifacts/backups/<FILE>.dump
```

This validates the manifest checksum and the PostgreSQL archive catalog.

## Restore drill

Never run a restore drill against the production database.

Example with a disposable database:

```powershell
createdb --host <HOST> --username <ADMIN_USER> fluxa_restore_drill
pg_restore `
  --host <HOST> `
  --username <ADMIN_USER> `
  --dbname fluxa_restore_drill `
  --no-owner `
  --no-privileges `
  <BACKUP_FILE>
```

Then point a temporary API instance to the restored database and verify:

```text
health ready
platform overview
merchant login
event list
reservation list
audit history
fiscal document counts
```

Drop the disposable database after recording the result.

## Minimum policy

- daily automated backup;
- backup before every migration;
- encrypted off-host storage;
- retention appropriate to contractual and legal requirements;
- monthly restore drill;
- alert when the newest verified backup is older than the agreed recovery point.
