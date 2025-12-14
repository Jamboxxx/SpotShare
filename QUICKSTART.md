# SpotShare Quick Setup

## 1. Configure Environment

```bash
cp .env.example .env
nano .env  # or vim, or your favorite editor
```

Change these values:
- `POSTGRES_PASSWORD` → A secure password
- `JWT_SECRET` → A random 32+ character string
- `ADMIN_REFERRAL_CODE` → Your initial signup code (e.g., "EXPLORE2025")

## 2. Start Application

```bash
docker-compose up -d
```

Wait about 30 seconds for everything to start.

## 3. Access

Open browser: http://localhost:8080

## 4. Create First Account

- Click "Register"
- Enter username and password
- Use the referral code from your `.env` file
- Click Register

## 5. Start Adding Spots!

1. Click the ☰ menu
2. Click "+ Add Pin"
3. Click on the map to set location
4. Add title and description
5. Upload photos (optional)
6. Submit

## Commands

**View logs:**
```bash
docker-compose logs -f
```

**Stop:**
```bash
docker-compose stop
```

**Restart:**
```bash
docker-compose restart
```

**Update:**
```bash
docker-compose pull
docker-compose up -d
```

**Backup:**
```bash
docker-compose exec postgres pg_dump -U spotshare spotshare > backup.sql
```

## Port Configuration

If port 8080 is in use, edit `docker-compose.yml`:

```yaml
frontend:
  ports:
    - "8081:80"  # Change 8080 to 8081 (or any available port)
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

## Security Tips

- Change all default passwords in `.env`
- Use strong passwords for user accounts
- Only share referral codes with trusted people
- For public deployment, use HTTPS (reverse proxy)

## Need Help?

Check the full [README.md](README.md) for detailed documentation.
