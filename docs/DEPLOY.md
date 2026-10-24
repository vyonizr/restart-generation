# Deploy to a VPS

This guide is the whole procedure for a public server on one virtual private server (VPS): Docker, Caddy for HTTPS, and Discord sign-in. [On the internet (Caddy)](HOSTING.md#on-the-internet-caddy) in the hosting guide holds the short version for a host that is ready; this guide adds what comes before and after it.

> **Caution:** This procedure was tested only on a PC with Docker Desktop, at `RG_DOMAIN=localhost`. Steps 1 and 2, a real certificate, the Discord sign-in round trip, the cron job, and the `chown` command haven't been tested on a VPS.

The steps leave out `RG_GAME_PATH`, so each player chooses their own copy of the game (see the architecture decision record [ADR 0001](adr/0001-players-bring-their-own-game-files.md)), and the server guesses battle results. Giving the server its own copy, and sending that copy with a download code, are separate decisions: see [Optional: send the game with a download code](#optional-send-the-game-with-a-download-code).

You need a VPS running Ubuntu 24.04 or Debian 12 that you can reach with SSH, a domain name, and a Discord application (see [Guests and members](HOSTING.md#guests-and-members)). The commands in this guide that run on your PC are PowerShell; the others run on the VPS.

## 1. Prepare the VPS

1. Log in to the VPS with an SSH key as a user other than `root`. Check that `~/.ssh/authorized_keys` holds your public key (`wc -l ~/.ssh/authorized_keys` prints at least 1). If the file is empty, your provider logs you in some other way, such as a web console or a password, and step 2 would lock you out: add your key first.
2. Turn off password login: create `/etc/ssh/sshd_config.d/00-keys-only.conf` containing `PasswordAuthentication no`, and then run `sudo systemctl reload ssh`.

   > **Warning:** Keep this session open until a second SSH login works.
3. Check the setting that the server uses. On Ubuntu, a file in `/etc/ssh/sshd_config.d/`, such as a cloud image's `50-cloud-init.conf`, can turn password login back on:

   ```sh
   sudo sshd -T | grep -i passwordauthentication
   ```

   The output is `passwordauthentication no`.
4. Open only the ports that the server needs. On Debian, first run `sudo apt install ufw`. If you changed your SSH port, allow that port instead of 22:

   ```sh
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 443/udp
   sudo ufw enable
   ```

   Docker publishes the ports it is told to by editing the firewall itself, so `ufw` doesn't guard them. That is fine here: `compose.yaml` publishes 80 and 443 for Caddy and nothing else. If your provider has its own firewall panel, allow the same ports there.
5. Install security updates automatically: run `sudo apt install unattended-upgrades`. Ubuntu turns automatic updates on by default; on Debian, also run `sudo dpkg-reconfigure -plow unattended-upgrades`.
6. Install Docker Engine and the Compose plugin by following [Docker's installation page for your system](https://docs.docker.com/engine/install/), and then run `sudo apt install git`. Use Docker's own apt repository, not Ubuntu's `docker.io` package; installing Docker's packages replaces Ubuntu's `containerd` and `runc`, which is expected. If `sudo apt update` fails with `Malformed entry 1 in sources file /etc/apt/sources.list.d/docker.sources`, an earlier attempt left an incomplete file (empty `Suites:`, no key in `/etc/apt/keyrings/`): run `sudo rm /etc/apt/sources.list.d/docker.sources`, and then follow Docker's page again. To check the installation, run the following command:

   ```sh
   docker compose version
   ```

   To run Docker without `sudo`, add yourself to the `docker` group (`sudo usermod -aG docker $USER`) and log in again. Anyone in that group can become root on the host.

## 2. Configure DNS

Create an `A` record that points your domain straight at the VPS's address, with the provider's proxy turned off ("DNS only"). Create only an `A` record for now, not an `AAAA` record for IPv6: with `compose.yaml` as written, Docker may show every IPv6 visitor as one address, and so give them one shared guest limit. Don't put a content delivery network or another proxy, such as Cloudflare's proxy (the orange cloud), in front: Caddy sets `X-Forwarded-For` to the visitor's address and the server trusts it (`RG_TRUST_PROXY`), so a second proxy would make every visitor look like one address and share one guest limit. A second proxy can also stop Caddy from getting its certificate.

Before you go on, check that the name already points at this VPS, because Caddy asks Let's Encrypt for the certificate as soon as it starts, and a wrong record makes that fail:

```sh
getent hosts play.example.com
curl -4 -s ifconfig.me
```

Replace `play.example.com` with your domain. Both commands print the same address. If they differ, wait for DNS to update and check again.

## 3. Get the code

```sh
git clone https://github.com/vyonizr/restart-generation.git
cd restart-generation
```

## 4. Send the private files

Battle templates ([ADR 0006](adr/0006-capture-battle-templates-from-a-live-client.md)) come from a capture on your PC and are never in the repository (see [Keep the legal risk of this project low](LEGAL.md)). Without a usable template, the server refuses to start.

1. On the VPS, in `restart-generation/`, create the `data` folder, owned by the container's user (UID 1000):

   ```sh
   mkdir -p data && sudo chown -R 1000:1000 data
   ```

   Without the `chown` command, Docker creates `data` as root and the server stops with `EACCES`.
2. On your PC, in the folder that holds `data`, zip your templates and send the zip (for more information, see [Back up and restore](HOSTING.md#back-up-and-restore)):

   ```powershell
   Compress-Archive -Force data\templates data\battle-templates.zip
   scp data\battle-templates.zip VPS_USER@VPS_HOST:restart-generation/data/
   ```

   Replace the following:
   - `VPS_USER`: your user name on the VPS
   - `VPS_HOST`: the VPS's hostname or IP address

The server reads `data/battle-templates.zip` as it is. Send only the zip. Leave out the rest of your PC's `data/` (its accounts, `capture.log`, and `oracle/`): they are your test data. Make the `.env` on the VPS from the example, and don't copy the one from your PC, whose settings (a local address and a Windows path) are wrong on the VPS.

## 5. Configure the server

Create the `.env` file from the example, readable only by you:

```sh
cp .env.example .env
chmod 600 .env
```

Edit `.env`; step 3 of [On the internet (Caddy)](HOSTING.md#on-the-internet-caddy) explains each line. Set at least the following:

```sh
RG_DOMAIN=play.example.com
RG_DISCORD_CLIENT_ID=
RG_DISCORD_CLIENT_SECRET=
# The admin's account delete (docs/HOSTING.md, "Delete an account"). A long random value, for example from: openssl rand -hex 24
RG_ADMIN_TOKEN=
# Your legal name, who stores the server and its data, and where players and rights holders write: the Terms and the Privacy
# policy name them, and the server won't start without them (docs/HOSTING.md, "Terms and Privacy policy").
RG_ADMIN_NAME=
RG_HOSTING=
RG_CONTACT=
```

In the Discord application, set the redirect to `https://DOMAIN/auth/discord/callback`, the Privacy Policy URL to `https://DOMAIN/privacy`, and the Terms of Service URL to `https://DOMAIN/terms`. Replace `DOMAIN` with your `RG_DOMAIN` value. `RG_PUBLIC_URL` defaults to `https://DOMAIN`, so leave it empty.

## 6. Start and check the server

Start the containers and read their logs. `RG_VERSION` gives the image the version that `/status` reports, because the build can't see `.git`:

```sh
RG_VERSION=$(git describe --tags --always) docker compose up -d --build
docker compose ps
docker compose logs rg
docker compose logs caddy
```

If you haven't logged in again since `usermod`, Docker needs `sudo`. Then write `RG_VERSION=$(git describe --tags --always) sudo -E docker compose up -d --build`. Without `-E`, `sudo` drops `RG_VERSION` and `/status` reports `"version":"unknown"`. The same applies to every `docker compose up --build` in [step 8](#8-update-the-server).

The server's log contains `Discord sign-in is on: players are guests or members (ADR 0011)`. If the server stops instead, the log says why (usually no usable battle template, or a folder owned by the wrong user). Caddy's log shows it getting the certificate; the first visit can wait a few seconds for it.

To check the server, do the following. Replace `play.example.com` with your domain.

1. Check the status endpoint:

   ```sh
   curl -s https://play.example.com/status
   ```

   The output includes `"accounts":true`, `"servesGame":false`, and `"version"` with the release you checked out, such as `"0.1.2"`. A version such as `0.1.2+1` means that you pulled a commit, one commit past that release, before its own release was tagged.
2. Open `https://play.example.com/` in a browser. Check that the page loads, that **Sign in with Discord** goes to Discord and comes back signed in, and that a guest can start a game. Open `https://play.example.com/privacy` and `https://play.example.com/terms`, and check that they name you, your hosting provider, and your contact.
3. With `RG_ADMIN_TOKEN` set, check that Caddy keeps `/admin/` from the internet ([ADR 0016](adr/0016-the-admin-deletes-accounts-through-the-running-server.md)):

   ```sh
   curl -si -H "Authorization: Bearer wrong" "https://play.example.com/admin/account?name=x"
   ```

   The response is `404` with an empty body. A `401` with `{"error":"unauthorized"}` means that the request reached the server, so the Caddy block isn't working: stop and fix it before you continue.
4. Check what the containers use, and size the VPS from that:

   ```sh
   docker stats --no-stream
   ```

## 7. Back up the accounts

The accounts database holds each member's Discord ID, name, stats, friend links, and saved game ([ADR 0010](adr/0010-sqlite-for-accounts-starting-empty.md), [ADR 0014](adr/0014-a-members-saved-game-is-kept-on-the-server.md)); a saved game can't be recreated. A guest's account is wiped 24 hours after its last activity, but guests are in the file too.

`npm run backup` writes a consistent copy while the server runs, into `data/backups/`, and keeps the newest 7 backups. To keep a different number, add `-- --keep NUMBER` after `npm run backup`, where `NUMBER` is how many backups to keep.

To make a backup now, create the backups folder, owned by the container's user, and run the command. The folder must exist before the cron job below runs: the shell opens `cron.log` before Docker starts, and the job fails if the folder is missing.

```sh
mkdir -p data/backups && sudo chown 1000:1000 data/backups
docker compose exec rg npm run backup
```

To make a backup every night, run `crontab -e` as the VPS user and add the following line:

```cron
17 3 * * * cd /home/VPS_USER/restart-generation && docker compose exec -T rg npm run backup >> data/backups/cron.log 2>&1
```

The cron job runs `docker` as that user, so the user must be in the `docker` group (see [step 1](#1-prepare-the-vps)). Run the command above once by hand first, and check that a file appears in `data/backups/`.

If you lose the VPS, you lose the backups on it. Copy the newest backup to your PC regularly, for example weekly, and delete the copy it replaces: the Privacy policy says that you keep one copy off the server, and that a deleted account leaves the backups as they're replaced.

```powershell
scp VPS_USER@VPS_HOST:restart-generation/data/backups/accounts-TIMESTAMP.db .
```

Replace `TIMESTAMP` with the UTC date and time in the backup's file name, in the form `YYYYMMDD-HHMMSS`.

A backup holds Discord IDs: keep it private, and never publish or commit it (see [Keep the legal risk of this project low](LEGAL.md)).

To restore a backup, stop the server, put the file in place, and remove the old database's side files, which would otherwise be applied to the restored copy:

```sh
docker compose stop rg
cp data/backups/accounts-TIMESTAMP.db data/accounts.db
rm -f data/accounts.db-wal data/accounts.db-shm
sudo chown 1000:1000 data/accounts.db
docker compose start rg
```

A server without Discord sign-in keeps `accounts-names.db` instead. Keep `data/battle-templates.zip` as your templates' backup, as [Back up and restore](HOSTING.md#back-up-and-restore) says.

## 8. Update the server

Each release on the repository's [Releases page](https://github.com/vyonizr/restart-generation/releases) lists what changed. Read the notes of every release since the one you run (`/status` shows it). While the version is below 1.0, a new minor number, such as 0.2.0 after 0.1.5, means a breaking change: the notes say what you must do during the update, and going back afterward may need the backup.

The schema has no migrations (`server/store.js`), so a downgrade after a schema change isn't safe. Back up first, every time:

```sh
cd ~/restart-generation
docker compose exec -T rg npm run backup
git describe --tags --always   # note it: this is where you roll back to
git pull
RG_VERSION=$(git describe --tags --always) docker compose up -d --build
```

Then repeat the checks in [step 6](#6-start-and-check-the-server). To free disk space, run `docker image prune -f`.

To roll back, run the following commands:

```sh
git checkout RELEASE
RG_VERSION=$(git describe --tags --always) docker compose up -d --build
```

Replace `RELEASE` with what `git describe` printed before the update, such as `v0.1.2`.

If the schema changed between the two versions, also restore the backup from before the update ([step 7](#7-back-up-the-accounts)). Before the next update, run `git checkout main`, so that `git pull` has a branch to pull.

## 9. Run the server day to day

- View the logs: `docker compose logs -f --tail 100 rg`. Docker keeps only the newest 30 MB of each container's log (three 10 MB files, set in `compose.yaml`), and the server keeps `data/capture.log` under 20 MB, so the logs can't fill the disk.
- Restart the server: `docker compose restart rg`. The server loads the battle templates only at start.
- Stop everything: `docker compose down`. The data stays in `data/`, and the certificates stay in a volume.
- Watch the outbound transfer your plan includes, in your host's dashboard. Without the game, each online player costs about 0.6 MB an hour, so 100 players online on average use about 45 GB a month. Some hosts shut the VPS down when the allowance runs out, until the next month; if usage passes half the allowance before mid-month, move to a bigger plan.
- Delete an account: see [Delete an account](HOSTING.md#delete-an-account).

## Optional: send the game with a download code

This makes your server send RedLynx's game files to the people you give its download code, in a link ([ADR 0031](adr/0031-the-server-sends-its-copy-only-to-a-download-code.md)). That is distribution of their work, and it's your decision and your risk. Before you continue, read [Rules for a server that sends the game](LEGAL.md#rules-for-a-server-that-sends-the-game).

It also costs bandwidth: each download is about 23 MiB, and a browser keeps the game, so it downloads it once. A code allows 20 downloads, one network 2 a day, and the server sends at most `RG_GAME_MB_PER_DAY` MiB a day (700 by default). Check what your host does when the monthly allowance runs out first: some shut the VPS down.

You need the game's `.zip` on the VPS, `RG_ADMIN_TOKEN` (see [Delete an account](HOSTING.md#delete-an-account)), and `RG_CONTACT`, where a rights holder can reach you, which every public server already sets.

1. Copy the game to the VPS:

   ```powershell
   scp ResetGeneration-Standalone.zip VPS_USER@VPS_HOST:restart-generation/
   ```
2. Add the following line to `.env`, and then run `docker compose up -d`:

   ```sh
   RG_GAME_PATH=./ResetGeneration-Standalone.zip
   ```

   This alone sends nothing: it gives the server its own copy, whose witness decides battle results instead of guessing them ([ADR 0020](adr/0020-the-server-follows-every-battle-with-a-witness.md)). It costs about 270 MB of memory once booted, plus about 4 MB for every battle it follows. The first time, the server also spends a few minutes compressing the game for the download code, and keeps the result in `data/`.
3. Make a code, and give the link it prints to your friends, and nobody else:

   ```sh
   docker compose exec rg npm run download-code -- --new
   ```

`docker compose exec rg npm run download-code` shows the code and what it has sent. To stop sending the game at once, run `docker compose exec rg npm run download-code -- --end`. `/status` says `"servesGame":false` either way: nothing on the page tells anyone without the code that the server sends the game. For the limits, see [Send the game with a download code](HOSTING.md#send-the-game-with-a-download-code).
