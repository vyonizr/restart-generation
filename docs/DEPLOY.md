# Deploy to a VPS

This is the whole procedure for a public server on one VPS: Docker, Caddy for HTTPS, and Discord sign-in. The README's [On the internet (Caddy)](../README.md#on-the-internet-caddy) holds the short version for a host that is ready; this adds what comes before and after it.

> **Status.** Run once on a PC with Docker Desktop, at `RG_DOMAIN=localhost` with test Discord values, from a fresh folder holding `compose.yaml`, the `Caddyfile`, a `.env` and `data/templates/`. That worked: the build, the start, the log line in step 6, `/status`, the http to https redirect, the `/admin/` 404 (with the gateway itself answering 401 behind it), `npm run backup` through `docker compose exec -T` with its pruning, the restore, the no-template refusal, and the game-zip section (the refusal without `RG_CONTACT`, enabling, switching off). **Not checked, because it needs a real VPS:** steps 1 and 2 (SSH, `ufw`, updates, DNS), a real certificate (localhost uses Caddy's own authority), the Discord round trip, the cron line, and the `chown` (Docker Desktop doesn't enforce who owns `data`). Run it on the VPS once, fix what is wrong, then delete this paragraph.

The steps leave out `RG_GAME_PATH`, so each player chooses their own copy of the game (ADR 0001). Sending the game from your server is a separate decision, with legal consequences, at the [end](#optional-send-the-game-from-your-server).

You need a VPS running Ubuntu 24.04 or Debian 12 that you can reach with SSH, a domain name, and a Discord application (README, [Guests and members](../README.md#guests-and-members)). The commands below that run on your PC are PowerShell; the others run on the VPS.

## 1. Prepare the VPS

1. Log in as a user that is not `root`, with an SSH key, and turn password login off. On Ubuntu a file in `/etc/ssh/sshd_config.d/` (a cloud image's `50-cloud-init.conf`, for one) can switch it back on, so check what the server really uses:

   ```sh
   sudo sshd -T | grep -i passwordauthentication
   ```

   It must say `no`. Set `PasswordAuthentication no` in a new `/etc/ssh/sshd_config.d/00-keys-only.conf`, then `sudo systemctl reload ssh`, and keep your session open until a second login works.
2. Open only what the server needs (on Debian, `sudo apt install ufw` first; use your SSH port if you changed it):

   ```sh
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 443/udp
   sudo ufw enable
   ```

   Docker publishes the ports it is told to by editing the firewall itself, so `ufw` does not guard them. That is fine here: `compose.yaml` publishes 80 and 443 for Caddy and nothing else. If your provider has its own firewall panel, allow the same ports there.
3. Install security updates by themselves: `sudo apt install unattended-upgrades` (Ubuntu turns it on already; on Debian run `sudo dpkg-reconfigure -plow unattended-upgrades`).
4. Install Docker Engine and the compose plugin by following [Docker's page for your system](https://docs.docker.com/engine/install/), then `sudo apt install git` and check:

   ```sh
   docker compose version
   ```

   To run Docker without `sudo`, add yourself to the `docker` group (`sudo usermod -aG docker $USER`) and log in again. Anyone in that group can become root on the host.

## 2. DNS

Create an `A` record (and `AAAA` for IPv6) that points your domain straight at the VPS's address, with the provider's proxy switched off ("DNS only"). Don't put a CDN or proxy, such as Cloudflare's orange cloud, in front: Caddy sets `X-Forwarded-For` to the visitor's address and the server trusts it (`RG_TRUST_PROXY`), so a second proxy would make every visitor look like one address and share one guest limit. It can also get in the way of Caddy obtaining its certificate.

## 3. Get the code

```sh
git clone https://github.com/vyonizr/restart-generation.git
cd restart-generation
```

## 4. Send the private files

Battle templates (ADR 0006) come from a capture on your PC and are never in the repository (`docs/LEGAL.md`). Without a usable template the server refuses to start. From the folder on your PC that holds `data/templates/`:

```powershell
tar -czf rg-templates.tar.gz data/templates
scp rg-templates.tar.gz <user>@<server>:restart-generation/
```

On the VPS, in `restart-generation/`:

```sh
tar -xzf rg-templates.tar.gz && rm rg-templates.tar.gz
sudo chown -R 1000:1000 data
```

`1000` is the user the container runs as; without it Docker creates `data` as root and the server stops with `EACCES`. Send only `data/templates/`. Leave out the rest of your PC's `data/` (its accounts, `capture.log`, `oracle/`): they are your test data. Make the `.env` on the VPS from the example and don't copy the one from your PC, whose settings (a local address, a Windows path) are wrong here.

## 5. Configure

```sh
cp .env.example .env
chmod 600 .env
```

Edit `.env` (README step 3 explains each line). At least:

```sh
RG_DOMAIN=play.example.com
RG_DISCORD_CLIENT_ID=
RG_DISCORD_CLIENT_SECRET=
# The admin's account delete (README, "Delete an account"). A long random value, for example from: openssl rand -hex 24
RG_ADMIN_TOKEN=
```

The Discord application's redirect must be `https://<your domain>/auth/discord/callback`. `RG_PUBLIC_URL` defaults to `https://<RG_DOMAIN>`, so leave it empty.

## 6. Start it and check

```sh
docker compose up -d --build
docker compose ps
docker compose logs rg
docker compose logs caddy
```

The server's log must say `Discord sign-in is on: players are guests or members (ADR 0011)`. If it stops instead, the log says why (usually no usable battle template, or a folder owned by the wrong user). Caddy's log shows the certificate being obtained; the first visit can wait a few seconds for it.

Then check, with your domain in place of `play.example.com`:

1. `curl -s https://play.example.com/status` answers JSON with `"accounts":true` and `"servesGame":false`.
2. Open `https://play.example.com/` in a browser: the page loads, **Sign in with Discord** goes to Discord and comes back signed in, and a guest can start a game.
3. Caddy keeps `/admin/` from the internet (ADR 0016). With `RG_ADMIN_TOKEN` set:

   ```sh
   curl -si -H "Authorization: Bearer wrong" "https://play.example.com/admin/account?name=x"
   ```

   It must answer `404` with an empty body. A `401` with `{"error":"unauthorized"}` means the request reached the server, so the Caddy block isn't working: stop and fix it before going on.
4. `docker stats --no-stream` shows what the containers use. Size the VPS from that.

## 7. Back up the accounts

The accounts database holds each member's Discord ID, name, stats, friend links and saved game (ADR 0010, ADR 0014); a saved game can't be recreated. A guest's account is wiped after 24 hours, but guests are in the file too. `npm run backup` writes a consistent copy while the server runs, into `data/backups/`, and keeps the newest 7 (`--keep <n>` changes that). Run it once by hand, then every night from the VPS user's `crontab -e`:

```sh
docker compose exec rg npm run backup
```

```cron
17 3 * * * cd /home/<user>/restart-generation && docker compose exec -T rg npm run backup >> data/backups/cron.log 2>&1
```

Backups on the VPS go with the VPS. Now and then copy the newest one to your PC:

```powershell
scp <user>@<server>:restart-generation/data/backups/accounts-<date>-<time>.db .
```

A backup holds Discord IDs: keep it private and never publish it or commit it (`docs/LEGAL.md`).

To restore, stop the server, put the file in place, and remove the old database's side files, which would otherwise be applied to the restored copy:

```sh
docker compose stop rg
cp data/backups/accounts-<date>-<time>.db data/accounts.db
rm -f data/accounts.db-wal data/accounts.db-shm
sudo chown 1000:1000 data/accounts.db
docker compose start rg
```

(A server without Discord sign-in keeps `accounts-names.db` instead.) Back up `data/templates/` too, as the README says in [Back up and restore](../README.md#back-up-and-restore).

## 8. Update

The schema has no migrations (`server/store.js`), so a downgrade after a change to it isn't safe. Back up first, every time:

```sh
cd ~/restart-generation
docker compose exec -T rg npm run backup
git rev-parse --short HEAD     # note it: this is where you roll back to
git pull
docker compose up -d --build
```

Then repeat the checks in step 6. Remove the old images now and then: `docker image prune -f`.

To roll back:

```sh
git checkout <the commit you noted>
docker compose up -d --build
```

If the schema changed between the two, restore the backup from before the update too (step 7). Before the next update run `git checkout main`, so `git pull` has a branch to pull.

## 9. Day to day

- Logs: `docker compose logs -f --tail 100 rg`.
- Restart the server: `docker compose restart rg`. It loads the battle templates only at start.
- Stop everything: `docker compose down`. The data stays in `data/`, and the certificates in a volume.
- Delete an account: README, [Delete an account](../README.md#delete-an-account).

## Optional: send the game from your server

This makes your server send RedLynx's game files to every visitor. That is distribution of their work, and it is your decision and your risk. Read `docs/LEGAL.md` "Serving the game" first. It needs the game's `.zip` on the VPS, and a way for a rights holder to reach you:

```powershell
scp ResetGeneration-Standalone.zip <user>@<server>:restart-generation/
```

Add to `.env`, then `docker compose up -d`:

```sh
RG_GAME_PATH=./ResetGeneration-Standalone.zip
# An email address or an https address; the page shows it in its Notices dialog, and the server won't start without it.
RG_CONTACT=
```

`/status` then says `"servesGame":true` and the Notices dialog shows your contact. To stop sending the game at once, empty `RG_GAME_PATH` and run `docker compose up -d` again.
