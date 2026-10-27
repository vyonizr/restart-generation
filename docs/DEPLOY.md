# Deploy to a VPS

This guide gives the full procedure to deploy a public server on a single Virtual Private Server (VPS). It covers setting up Docker, securing connections with Caddy (HTTPS), and enabling Discord sign-in. 

> **Caution:** This setup was tested only on a local PC using Docker Desktop at `RG_DOMAIN=localhost`. Steps 1 and 2, real SSL certificates, the Discord login flow, cron jobs, and the `chown` permissions change have not been tested on a live VPS.

By default, these steps leave out `RG_GAME_PATH`. This means each player must provide their own copy of the game (see [ADR 0001](adr/0001-players-bring-their-own-game-files.md)), and the server will estimate battle results. To host the game files directly on the server and share them via download codes, see [Optional: send the game with a download code](#optional-send-the-game-with-a-download-code).

### System Requirements
*   A VPS running Ubuntu 24.04 or Debian 12 accessible via SSH
*   A registered domain name
*   A Discord developer application (see [Guests and members](HOSTING.md#guests-and-members))

*Note: Commands labeled for your PC use PowerShell. All other commands must be run directly on the VPS.*

---

## 1. Prepare the VPS

1. **SSH Key Login:** Log in to your VPS using an SSH key as a non-root user. Verify your public key is present by running `wc -l ~/.ssh/authorized_keys`. The output must be at least 1. If it is 0, your provider is using a password or web console; do not proceed to step 2 until you add your public key manually, or you will be locked out.
2. **Disable Password Authentication:** Create a configuration file at `/etc/ssh/sshd_config.d/00-keys-only.conf` containing the line `PasswordAuthentication no`. Reload the SSH service:
   ```sh
   sudo systemctl reload ssh
   ```
   *Warning: Keep your current SSH session open until you successfully connect via a new, separate terminal window.*
3. **Verify SSH Settings:** Confirm that password login is disabled (especially on Ubuntu, where cloud-init files might override changes):
   ```sh
   sudo sshd -T | grep -i passwordauthentication
   ```
   The output must explicitly read `passwordauthentication no`.
4. **Configure Firewall:** Open only the essential ports. On Debian, install the firewall utility first via `sudo apt install ufw`. If you use a custom SSH port, replace `22` with your specific port:
   ```sh
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 443/udp
   sudo ufw enable
   ```
   *Note: Docker manages its own firewall rules to expose ports. This is safe here because our `compose.yaml` only exposes ports 80 and 443 for Caddy. If your cloud provider uses an external firewall panel, open these same ports there.*
5. **Enable Security Updates:** Install automated security patches by running `sudo apt install unattended-upgrades`. This runs automatically on Ubuntu. On Debian, configure it manually by running `sudo dpkg-reconfigure -plow unattended-upgrades`.
6. **Install Docker and Git:** Install Docker Engine and Docker Compose by following the [Official Docker Installation Guide](https://docs.docker.com/engine/install/), then install git via `sudo apt install git`. Use Docker's official repository rather than your OS package manager (`docker.io`). Verify the installation:
   ```sh
   docker compose version
   ```
   To run Docker commands without typing `sudo`, add your user to the docker group via `sudo usermod -aG docker $USER` and log back into your SSH session. *Warning: Users in the docker group can easily gain root privileges on the host.*

---

## 2. Configure DNS

Create an **A record** pointing your domain name directly to your VPS IP address. 
*   **Turn off proxies:** Ensure any provider proxy features (like Cloudflare's orange cloud) are set to "DNS only". 
*   **IPv4 Only:** Do not create an IPv6 `AAAA` record. Under the current Docker network setup, an `AAAA` record causes all IPv6 visitors to share a single IP address, which exhausts the guest connection limits. 
*   **SSL Preparation:** External proxies alter incoming IP headers and break Caddy's automatic SSL certificate registration.

Verify that your domain successfully resolves to your VPS IP address before proceeding:
```sh
getent hosts play.example.com
curl -4 -s ifconfig.me
```
*(Replace `play.example.com` with your actual domain. Both commands must return the exact same IP address. If they do not, wait for DNS propagation).*

---

## 3. Clone the Repository

Clone the project files to your VPS and enter the directory:
```sh
git clone https://github.com/vyonizr/restart-generation.git
cd restart-generation
```

---

## 4. Transfer Private Battle Templates

Battle templates ([ADR 0006](adr/0006-capture-battle-templates-from-a-live-client.md)) must be captured from a running PC client and are not included in the public repository. The server will fail to start without them.

1. **Create Data Directory:** On the VPS, create the storage folder and assign ownership to the container user (UID 1000) to prevent `EACCES` permission errors:
   ```sh
   mkdir -p data && sudo chown -R 1000:1000 data
   ```
2. **Pack and Send Templates:** On your local PC, compress your custom templates folder into a ZIP archive and secure copy (`scp`) it to the VPS:
   ```powershell
   Compress-Archive -Force data\templates data\battle-templates.zip
   scp data\battle-templates.zip VPS_USER@VPS_HOST:restart-generation/data/
   ```
   *(Replace `VPS_USER` with your VPS username and `VPS_HOST` with your VPS IP address).*

*Note: Send only the `battle-templates.zip` file. Do not copy over your local accounts, log files, or environment configurations.*

---

## 5. Configure Environment Variables

Create your production environment file from the provided template and restrict its read permissions:
```sh
cp .env.example .env
chmod 600 .env
```

Open the `.env` file in a text editor and fill out the values (see [On the internet (Caddy)](HOSTING.md#on-the-internet-caddy) for comprehensive details):
```sh
RG_DOMAIN=play.example.com
RG_DISCORD_CLIENT_ID=your_discord_id
RG_DISCORD_CLIENT_SECRET=
# Administrative token used to delete accounts. Generate a secure string using: openssl rand -hex 24
RG_ADMIN_TOKEN=
# Legal compliance settings required to generate the Privacy Policy and Terms of Service pages
RG_ADMIN_NAME=Your Legal Name or Company
RG_HOSTING=Your VPS Provider Name
RG_CONTACT=your-email@example.com
```

### Discord Portal Setup
In your Discord Developer Portal application settings, update the following OAuth2 redirect and informational fields exactly:
*   **Redirect URI:** `https://play.example.com/auth/discord/callback`
*   **Privacy Policy URL:** `https://play.example.com/privacy`
*   **Terms of Service URL:** `https://play.example.com/terms`

*(Replace `play.example.com` with your active domain name).*

---

## 6. Launch the Server

Build and start the application containers in the background. We pass the Git version tag to the container environment so it displays accurately on the `/status` page:
```sh
RG_VERSION=$(git describe --tags --always) docker compose up -d --build
```
*(If your user is not yet recognized in the docker group, execute instead: `RG_VERSION=$(git describe --tags --always) sudo -E docker compose up -d --build`)*

### Verify the Installation
Check your container status and application startup logs:
```sh
docker compose ps
docker compose logs rg
docker compose logs caddy
```
Verify the following items by replacing `play.example.com` with your domain:
1. **Status Endpoint:** Run `curl -s https://play.example.com/status`. The JSON output should show `"accounts":true`, `"servesGame":false`, and your current version tag.
2. **Browser Test:** Open your domain in a web browser. Confirm the page loads cleanly, the footer privacy/terms links display your configuration details, and the Discord login flow works seamlessly.
3. **Admin Security:** Confirm Caddy successfully blocks public access to the admin endpoints ([ADR 0016](adr/0016-the-admin-deletes-accounts-through-the-running-server.md)):
   ```sh
   curl -si -H "Authorization: Bearer wrong" "https://play.example.com/admin/account?name=x"
   ```
   The server **must** return a `404` status with an empty body. If it returns a `401`, your firewall or Caddy rules are failing; stop the server immediately and resolve the configuration.
4. **Resource Usage:** Check resource metrics to monitor hardware allocation:
   ```sh
   docker stats --no-stream
   ```

---

## 7. Automated Backups

The account database (`accounts.db`) stores user configurations, stats, friend lists, and persistent save states. Guest accounts are automatically deleted after 24 hours of inactivity, but they are also stored here temporarily.

### Manual Backup
Run the backup script inside the container. It creates a point-in-time snapshot inside `data/backups/` and keeps the last 7 instances by default:
```sh
mkdir -p data/backups && sudo chown 1000:1000 data/backups
docker compose exec rg npm run backup
```
*(To change the retention limit, append your number to the command: `-- --keep 14`)*

### Scheduled Automated Backups
Open your system crontab file:
```sh
crontab -e
```
Add the following line to schedule an automated backup every night at 3:17 AM:
```cron
17 3 * * * cd /home/VPS_USER/restart-generation && docker compose exec -T rg npm run backup >> data/backups/cron.log 2>&1
```
*(Ensure `VPS_USER` matches your home directory path. Run the command manually once to confirm it writes to `cron.log` without permission errors).*

### Off-Server Storage
Download your backups to a secure local machine regularly. Database backups contain user Discord IDs and must be stored privately:
```powershell
scp VPS_USER@VPS_HOST:restart-generation/data/backups/accounts-YYYYMMDD-HHMMSS.db .
```

### Restore a Backup
To restore a snapshot, stop the backend container, overwrite the database file, remove temporary database state files, and restart:
```sh
docker compose stop rg
cp data/backups/accounts-TIMESTAMP.db data/accounts.db
rm -f data/accounts.db-wal data/accounts.db-shm
sudo chown 1000:1000 data/accounts.db
docker compose start rg
```

---

## 8. Update the Server

Always review the repository [Releases page](https://github.com/vyonizr/restart-generation/releases) for changes before upgrading. Pay attention to minor version changes (e.g., `0.2.0` from `0.1.5`) and **BREAKING CHANGES** notices. Database migrations are not handled automatically; always take a manual backup before updating.

```sh
cd ~/restart-generation
docker compose exec -T rg npm run backup
git describe --tags --always # Note down this current version string as your rollback point
git pull
RG_VERSION=$(git describe --tags --always) docker compose up -d --build
```
Perform the verification steps listed in [Step 6](#6-launch-the-server) to confirm a successful update.

### Rolling Back An Update
If the update fails, roll back to your noted stable version tag:
```sh
git checkout v0.1.2
RG_VERSION=$(git describe --tags --always) docker compose up -d --build
```
If the database schema changed during the failed update, restore your pre-update database backup using the steps in [Step 7](#restore-a-backup). When ready to try updating again later, remember to return to the main branch via `git checkout main` first.

---

## 9. Day-to-Day Maintenance

*   **View Logs:** Monitor real-time logs using `docker compose logs -f --tail 100 rg`. Container logs are automatically capped at 30MB total via `compose.yaml` limits, and `data/capture.log` stays below 20MB to protect disk space.
*   **Restart Applications:** Run `docker compose restart rg`. Note that battle templates are only read into memory during initial container startup.
*   **Stop Applications:** Run `docker compose down`. App data in `data/` and Caddy SSL configurations inside its volume will persist.
*   **Weekly Disk Cleanup:** Building new Docker images leaves old image layers and build caches behind. Add the following entry to your `crontab -e` configuration to automatically clean up assets older than a week every Sunday at 4:17 AM:
    ```cron
    17 4 * * 0 docker system prune -f --filter "until=168h" 2>&1 | logger -t docker-prune
    ```
    *Warning: Never add the `--volumes` flag to this prune script. On older Docker versions, it will erase your persistent Caddy certificates volume, which can cause you to hit Let's Encrypt API rate limits.*
*   **Bandwidth Monitoring:** Without hosting the game files directly, active gameplay consumes roughly 0.6 MB per hour per player (around 45 GB per month for an average of 100 concurrent players). Track usage in your cloud console to avoid overage fees.

---

## Optional: Send the Game with a Download Code

You can configure the server to host and distribute the original game assets to players using a secure download code system ([ADR 0031](adr/0031-the-server-sends-its-copy-only-to-a-download-code.md)). 

> **Important Legal Risk:** Distributing proprietary game files carries legal liabilities. Review [Rules for a server that sends the game](LEGAL.md#rules-for-a-server-that-sends-the-game) before proceeding.

### Bandwidth Impacts
Each full game download is roughly 23 MiB. The server caps total file distribution at 700 MiB per day by default (`RG_GAME_MB_PER_DAY`). A single download code permits 20 total downloads, limited to 2 unique network downloads per day.

### Setup Steps
1. **Upload Game File:** Transfer the original standalone game ZIP archive to the application root directory on the VPS:
   ```powershell
   scp ResetGeneration-Standalone.zip VPS_USER@VPS_HOST:restart-generation/
   ```
2. **Configure Environment:** Add the game path to your `.env` file, then update the container status:
   ```sh
   RG_GAME_PATH=./ResetGeneration-Standalone.zip
   ```
   Run `docker compose up -d` to apply. The server will verify game rules using a battle witness ([ADR 0020](adr/0020-the-server-follows-every-battle-with-a-witness.md)). This adds roughly 270 MB of memory usage on startup, plus 4 MB per concurrent battle. The server will take a few minutes during its first boot to compress the assets for download preparation.
3. **Generate a Download Code:** Create a secure access token link to share with trusted players:
   ```sh
   docker compose exec rg npm run download-code -- --new
   ```

To monitor active downloads and check code stats, run `docker compose exec rg npm run download-code`. To instantly terminate file distribution, run `docker compose exec rg npm run download-code -- --end`. The public `/status` endpoint will display `"servesGame":false` regardless, hiding the feature from unauthorized visitors.
