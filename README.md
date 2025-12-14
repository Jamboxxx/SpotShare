# SpotShare - Urban Explorer Spot Sharing Platform

A self-hosted platform for urban explorers to safely share locations with their trusted community. Share spots with pins on an interactive map, organize into groups, and import GPX data.

## Features

✨ **Interactive Map Interface**
- Add pins with custom titles, descriptions, and images
- View your pins and pins from group members
- Click on map to set pin locations
- OpenStreetMap integration with geolocation support

🔐 **Privacy-Focused Authentication**
- No email required - just username and password
- Referral code system for controlled signups
- JWT-based authentication

👥 **Groups System**
- Create groups and invite members with unique codes
- Only see pins from your group members
- Leave groups anytime
- View group membership

🎫 **Referral Code Management**
- Generate referral codes for inviting new users
- Track which codes have been used
- New users get 3 referral codes upon signup

📍 **GPX Import**
- Import waypoints and tracks from GPX files
- Automatically converts GPS data to pins
- Perfect for importing existing exploration routes

🐳 **Easy Docker Deployment**
- Complete Docker Compose setup
- PostgreSQL database included
- Persistent data storage
- One-command deployment

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- At least 512MB RAM available
- Port 8080 and 3000 available

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Jamboxxx/SpotShare
cd SpotShare
```

2. Copy the environment file and configure:
```bash
cp .env.example .env
```

3. Edit `.env` and change:
   - `POSTGRES_PASSWORD` - Set a secure database password
   - `JWT_SECRET` - Set a random 32+ character string
   - `ADMIN_REFERRAL_CODE` - Set your initial referral code (optional)

4. Start the application:
```bash
docker-compose up -d
```

5. Access the application:
   - Open your browser to `http://localhost:8080`
   - Use the admin referral code (from .env) to create your first account

## Usage Guide

### First Time Setup

1. **Create Account**: Use the referral code you set in `.env` (default: `SPOTSHARE2025`)
2. **Generate Codes**: After signup, you'll have 3 referral codes to invite others
3. **Add First Pin**: Click the menu, go to "My Pins", and add your first location

### Adding Pins

1. Open the sidebar menu (☰)
2. Click "Add Pin"
3. Click on the map to set the location (or enter coordinates manually)
4. Add a title and optional description
5. Upload up to 5 images
6. Submit

### Creating Groups

1. Go to the "Groups" tab
2. Click "Create Group"
3. Share the invite code with trusted explorers
4. Members can see each other's pins on the map

### Importing GPX Data

1. Export your GPS tracks as GPX files
2. Go to "My Pins" tab
3. Click "Import GPX"
4. Select your GPX file
5. Waypoints and track endpoints will be imported as pins

### Managing Referral Codes

1. Go to "Codes" tab
2. View your available and used codes
3. Generate new codes as needed
4. Share codes with people you trust

## API Documentation

### Authentication

**Register**
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "explorer",
  "password": "secure_password",
  "referralCode": "ABC123XYZ"
}
```

**Login**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "explorer",
  "password": "secure_password"
}
```

### Pins

**Get Pins** (Returns user's pins + group members' pins)
```http
GET /api/pins
Authorization: Bearer <token>
```

**Create Pin**
```http
POST /api/pins
Authorization: Bearer <token>
Content-Type: multipart/form-data

title: Location Name
description: Optional description
latitude: 40.7128
longitude: -74.0060
images: [file1, file2, ...]
```

**Delete Pin**
```http
DELETE /api/pins/:id
Authorization: Bearer <token>
```

### Groups

**Get User's Groups**
```http
GET /api/groups
Authorization: Bearer <token>
```

**Create Group**
```http
POST /api/groups
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "NYC Explorers"
}
```

**Join Group**
```http
POST /api/groups/join
Authorization: Bearer <token>
Content-Type: application/json

{
  "inviteCode": "INVITE123"
}
```

**Leave Group**
```http
DELETE /api/groups/:id/leave
Authorization: Bearer <token>
```

**Get Group Members**
```http
GET /api/groups/:id/members
Authorization: Bearer <token>
```

### Referral Codes

**Get User's Codes**
```http
GET /api/referrals
Authorization: Bearer <token>
```

**Generate New Code**
```http
POST /api/referrals/generate
Authorization: Bearer <token>
```

### GPX Import

**Import GPX File**
```http
POST /api/import/gpx
Authorization: Bearer <token>
Content-Type: multipart/form-data

gpxFile: file.gpx
```

## Docker Architecture

### Services

- **postgres** - PostgreSQL 15 database
  - Port: 5432 (internal)
  - Volume: `postgres_data`

- **backend** - Node.js API server
  - Port: 3000 (exposed)
  - Volume: `uploads` for images
  - Environment: Production mode

- **frontend** - Nginx web server
  - Port: 8080 (exposed)
  - Proxies API requests to backend

### Volumes

- `postgres_data` - Database persistence
- `uploads` - User-uploaded images

### Network

All services communicate on the `spotshare_network` bridge network.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_DB` | Database name | spotshare |
| `POSTGRES_USER` | Database user | spotshare |
| `POSTGRES_PASSWORD` | Database password | (required) |
| `JWT_SECRET` | JWT signing secret | (required) |
| `PORT` | Backend port | 3000 |
| `ADMIN_REFERRAL_CODE` | Initial referral code | SPOTSHARE2025 |

### Security Recommendations

1. **Change Default Credentials**: Always change default passwords in `.env`
2. **Secure JWT Secret**: Use at least 32 random characters
3. **HTTPS**: Put behind reverse proxy with SSL (nginx/Caddy/Traefik)
4. **Firewall**: Only expose necessary ports
5. **Backups**: Regularly backup the `postgres_data` volume
6. **Referral Codes**: Only share with trusted individuals

## Backup and Restore

### Backup Database

```bash
docker-compose exec postgres pg_dump -U spotshare spotshare > backup.sql
```

### Backup Uploads

```bash
docker cp $(docker-compose ps -q backend):/app/uploads ./uploads_backup
```

### Restore Database

```bash
cat backup.sql | docker-compose exec -T postgres psql -U spotshare spotshare
```

### Restore Uploads

```bash
docker cp ./uploads_backup $(docker-compose ps -q backend):/app/uploads
```

## Troubleshooting

### Cannot connect to backend

1. Check if containers are running:
```bash
docker-compose ps
```

2. Check backend logs:
```bash
docker-compose logs backend
```

3. Verify environment variables in `.env`

### Database connection errors

1. Wait for PostgreSQL to fully start (takes 10-20 seconds)
2. Check postgres logs:
```bash
docker-compose logs postgres
```

3. Restart services:
```bash
docker-compose restart
```

### Map not loading

1. Check browser console for errors
2. Verify frontend can reach backend
3. Check CORS settings if using custom domain

### Referral code not working

1. Check that `ADMIN_REFERRAL_CODE` is set in `.env`
2. Verify database initialized correctly:
```bash
docker-compose logs backend | grep "Database initialized"
```

## Development

### Running in Development Mode

1. Install dependencies:
```bash
cd backend && npm install
```

2. Create `.env` file with development settings

3. Run backend:
```bash
npm run dev
```

4. Serve frontend:
```bash
cd frontend
python -m http.server 8080
```

### Database Schema

- **users** - User accounts
- **referral_codes** - Invitation codes
- **groups** - Explorer groups
- **group_members** - Group membership
- **pins** - Location markers
- **pin_images** - Pin image attachments

## Tech Stack

- **Backend**: Node.js, Express, PostgreSQL
- **Frontend**: Vanilla JavaScript, Leaflet.js, OpenStreetMap
- **Authentication**: JWT, bcrypt
- **Deployment**: Docker, Docker Compose
- **File Upload**: Multer
- **GPX Parsing**: gpxparser

## License

MIT License - Feel free to use and modify for your own urban exploration community!

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## Security Note

This application is designed for trusted communities. While it includes basic security measures:
- Keep your instance private or behind authentication
- Only share referral codes with people you trust
- Consider additional security layers for public-facing deployments
- Regularly update dependencies and Docker images

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Happy Exploring! 🗺️**
