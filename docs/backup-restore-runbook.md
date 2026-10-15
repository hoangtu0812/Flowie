# Flowie backup and isolated restore

## Decision and production gate

Use restic 0.19.1 with an HTTPS S3-compatible bucket in an account independent
of CT107. An existing NAS is suitable only if it is on a different host/storage
failure domain and has an additional off-site copy. No destination, account or
paid service has been created, and no production schedule has been enabled.
Credentials and the repository password stay outside Git. Keep a second copy
of the password in an offline password vault accessible during a CT107 failure.

Restic encrypts repository contents and supports independent S3 storage;
see its [repository setup](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html).
The intended retention is 7 daily, 4 weekly and 6 monthly snapshots; these are
overlapping calendar buckets, not a promise of 17 separate copies. Missing
backup days cannot be reconstructed. See the official
[retention rules](https://restic.readthedocs.io/en/stable/060_forget.html).

Target RPO is 24 hours after the first successful scheduled backup. Alert at
28 hours without success. RTO is not yet measured for CT107; a local fixture
rehearsal is not evidence of production restore speed or an off-site copy.

## Capture invariants

`scripts/flowie-backup.py` separates capture, repository operations, manifests
and restore verification. Capture requires `--allow-maintenance`: API and worker
briefly stop, PostgreSQL stays online, MinIO stops, then a custom-format pg_dump,
the complete MinIO data directory and production environment are captured.
Only containers that were running are restarted, with MinIO first. Upload and
encryption happen after services restart. Failure also attempts restarts and
writes a protected failure status. A host crash still requires an operator to
inspect/start the recorded services; Python cleanup cannot survive host loss.

The deployment and capture share `/opt/flowie/.flowie-operation.lock`; neither
can mutate schema/source while capture runs. A running migration rejects the
capture. Inventory all other DB/object-store writers before activation and add
them to `writers`; application-only quiescence cannot stop unknown external
clients. Do not add PostgreSQL or MinIO to `writers`. Live copying of MinIO's
internal files is deliberately unsupported.

The scratch directory is 0700 and environment capture is 0600. Ensure enough
free encrypted local disk for one full DB/object-store capture. Temporary data
is removed after upload; filesystem-level secure erasure is not claimed. Redis
is excluded: it is a transient queue/cache; durable jobs live in PostgreSQL.
Do not delete original storage after taking a backup.

## Configure on CT107 after review

1. Inventory database size, MinIO volume size/version, external writers, disk,
   Docker container names, production env location and off-site bucket region.
2. Install the official restic 0.19.1 binary and verify its release SHA256SUMS.
   Install Python 3.12+, Docker CLI and `flock`. No API packages are required.
3. Create `/etc/flowie-backup` and `/var/lib/flowie-backup/scratch` with mode 0700.
   Copy `infrastructure/backup/config.example.json` to the protected config path.
   Copy `credentials.example` outside Git and replace placeholders. Store the
   high-entropy repository password in the configured password file, mode 0600.
   Provision `/opt/flowie/.flowie-operation.lock` mode 0600 owned by the production
   deployment user (or let the deployment workflow create it first). Root backup
   opens the same existing inode and never changes its ownership.
4. Use a bucket-scoped credential. Separate routine backup from deletion/prune
   credentials where the provider permits; repository lock cleanup also needs
   appropriate permissions. Enable provider-side versioning/recovery using an
   independently administered identity. Test its recovery procedure; this script
   does not establish immutable backups merely by using HTTPS or encryption.
5. Load credentials in the protected operator shell and run:

```sh
python3 /opt/flowie/scripts/flowie-backup.py initialize
python3 /opt/flowie/scripts/flowie-backup.py capture --config /etc/flowie-backup/config.json --allow-maintenance
python3 /opt/flowie/scripts/flowie-backup.py check
python3 /opt/flowie/scripts/flowie-backup.py status
```

6. Verify `/readyz`, worker heartbeat and a real attachment after capture.
   Perform the isolated restore below from the off-site repository. Record SHA,
   snapshot ID, object counts, start/end times and measured RPO/RTO outside Git.
7. Only then copy the four service/timer files to `/etc/systemd/system`, run
   `systemctl daemon-reload`, and enable the two timers. This may cause brief
   maintenance at 02:00 +07. Monitor service failures and run `status` from the
   existing monitoring system; exit 1 means failure, missing status or stale age.
   A timer alone does not provide alert delivery.

Retention is a separate operator step. First run `retention` for a dry run.
After verifying a recent restore and using the maintenance credential, run
`retention --apply` to forget/prune. Do not schedule deletion with the daily
backup identity before testing provider recovery and retention behavior.

## Isolated restore rehearsal

Choose an explicit snapshot ID, never an ambiguous `latest`. The target must
not exist. This command downloads and verifies the restic snapshot plus every
manifest size/hash; it does not start a database or write to production:

```sh
python3 /opt/flowie/scripts/flowie-backup.py restore --snapshot SNAPSHOT_ID --target /var/lib/flowie-restore-UNIQUE
```

On a separate host/network with no production credentials or outbound delivery:

1. Locate the single restored `manifest.json`. Use the recorded application SHA
   and compatible PostgreSQL/MinIO image versions, not a newer schema by guess.
2. Create an empty disposable database and restore `database.dump` using
   `pg_restore --exit-on-error --no-owner --no-acl`. Never use `--clean` against
   production. Confirm `_prisma_migrations` has no failed/unapplied migrations;
   compare counts for users, workspaces, issues, documents and attachments.
3. Copy restored `objects/` into a **new empty disposable MinIO volume** while
   its server is stopped. Keep source MinIO version/layout compatible. Start it
   and read/hash representative attachments, avatars and emojis via S3.
4. Keep SMTP, Discord, SCM webhooks, agents and background delivery disabled.
   The restored DB contains live credentials, sessions and pending jobs; never
   point a normal worker at it until those effects are isolated. Rotate secrets
   if performing actual disaster recovery, invalidate restored user sessions
   and MCP connections as appropriate, then test a selected project/issue/doc.
5. Record actual recovery timings and failures. Delete only the explicitly
   named disposable test DB, volume and directory after evidence is retained.

`verify --target DIR` can repeat manifest verification without repository access.
`--rehearsal` permits a loopback/local repository for synthetic tests only; it
must never be presented as evidence that off-site production backup is active.

## Local evidence, 2026-10-15

`test_backup_tooling.py`: 3 passed (manifest corruption/traversal, writer restart
on failure, unsafe repository/restore/retention guards).
`test_backup_rehearsal.py`: 1 passed using checksum-verified restic 0.19.1,
an owned loopback MinIO S3 repository, real pg_dump/pg_restore into a fresh DB,
and a second MinIO server opened from the restored physical directory. Counts
for six database tables matched, all migration records were finished, 16,384
attachment bytes matched and a wrong password could not decrypt snapshots.
This is synthetic local evidence; CT107 inventory, remote credentials, restore
time and monitoring delivery remain production acceptance requirements.
