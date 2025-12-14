require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const gpxParser = require('gpxparser');
const { pool, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/gpx+xml', 'text/xml'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.gpx')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Generate random code
const generateCode = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// ============= AUTH ROUTES =============

// Register
app.post('/api/auth/register', [
  body('username').isLength({ min: 3, max: 50 }).trim().escape(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password, referralCode } = req.body;

  try {
    // Check if referral code is valid
    const referralResult = await pool.query(
      'SELECT id, is_used FROM referral_codes WHERE code = $1',
      [referralCode]
    );

    if (referralResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid referral code' });
    }

    if (referralResult.rows[0].is_used) {
      return res.status(400).json({ error: 'Referral code already used' });
    }

    // Check if username exists
    const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userResult = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );

    const user = userResult.rows[0];

    // Mark referral code as used
    await pool.query(
      'UPDATE referral_codes SET is_used = TRUE, used_by = $1, used_at = CURRENT_TIMESTAMP WHERE id = $2',
      [user.id, referralResult.rows[0].id]
    );

    // Generate new referral codes for the new user
    for (let i = 0; i < 3; i++) {
      const newCode = generateCode();
      await pool.query(
        'INSERT INTO referral_codes (code, created_by) VALUES ($1, $2)',
        [newCode, user.id]
      );
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', [
  body('username').trim().escape(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user's referral codes
app.get('/api/referrals', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT code, is_used, created_at, used_at FROM referral_codes WHERE created_by = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get referrals error:', error);
    res.status(500).json({ error: 'Failed to fetch referral codes' });
  }
});

// Generate new referral code
app.post('/api/referrals/generate', authenticateToken, async (req, res) => {
  try {
    const code = generateCode();
    const result = await pool.query(
      'INSERT INTO referral_codes (code, created_by) VALUES ($1, $2) RETURNING code, created_at',
      [code, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Generate referral error:', error);
    res.status(500).json({ error: 'Failed to generate referral code' });
  }
});

// ============= PINS ROUTES =============

// Get pins (user's own + group members')
app.get('/api/pins', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT p.*, u.username, 
        ARRAY_AGG(pi.filename) FILTER (WHERE pi.filename IS NOT NULL) as images
      FROM pins p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN pin_images pi ON p.id = pi.pin_id
      WHERE p.user_id = $1
        OR p.user_id IN (
          SELECT gm2.user_id 
          FROM group_members gm1
          JOIN group_members gm2 ON gm1.group_id = gm2.group_id
          WHERE gm1.user_id = $1 AND gm2.user_id != $1
        )
      GROUP BY p.id, u.username
      ORDER BY p.created_at DESC
    `, [req.user.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get pins error:', error);
    res.status(500).json({ error: 'Failed to fetch pins' });
  }
});

// Create pin
app.post('/api/pins', authenticateToken, upload.array('images', 5), async (req, res) => {
  const { title, description, latitude, longitude } = req.body;

  if (!title || !latitude || !longitude) {
    return res.status(400).json({ error: 'Title, latitude, and longitude are required' });
  }

  try {
    const pinResult = await pool.query(
      'INSERT INTO pins (user_id, title, description, latitude, longitude) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, title, description, parseFloat(latitude), parseFloat(longitude)]
    );

    const pin = pinResult.rows[0];

    // Save image references
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await pool.query(
          'INSERT INTO pin_images (pin_id, filename) VALUES ($1, $2)',
          [pin.id, file.filename]
        );
      }
    }

    // Get pin with images
    const result = await pool.query(`
      SELECT p.*, ARRAY_AGG(pi.filename) FILTER (WHERE pi.filename IS NOT NULL) as images
      FROM pins p
      LEFT JOIN pin_images pi ON p.id = pi.pin_id
      WHERE p.id = $1
      GROUP BY p.id
    `, [pin.id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create pin error:', error);
    res.status(500).json({ error: 'Failed to create pin' });
  }
});

// Delete pin
app.delete('/api/pins/:id', authenticateToken, async (req, res) => {
  try {
    // Get images to delete files
    const imagesResult = await pool.query(
      'SELECT filename FROM pin_images WHERE pin_id = $1',
      [req.params.id]
    );

    // Delete pin (cascade will delete images)
    const result = await pool.query(
      'DELETE FROM pins WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pin not found or unauthorized' });
    }

    // Delete image files
    for (const img of imagesResult.rows) {
      const filePath = path.join('uploads', img.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.json({ message: 'Pin deleted successfully' });
  } catch (error) {
    console.error('Delete pin error:', error);
    res.status(500).json({ error: 'Failed to delete pin' });
  }
});

// ============= GROUPS ROUTES =============

// Get user's groups
app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.*, u.username as creator_username,
        (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
      FROM groups g
      JOIN users u ON g.created_by = u.id
      WHERE g.id IN (
        SELECT group_id FROM group_members WHERE user_id = $1
      )
      ORDER BY g.created_at DESC
    `, [req.user.id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Create group
app.post('/api/groups', authenticateToken, [
  body('name').isLength({ min: 1, max: 100 }).trim().escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name } = req.body;
  const inviteCode = generateCode(10);

  try {
    const groupResult = await pool.query(
      'INSERT INTO groups (name, invite_code, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, inviteCode, req.user.id]
    );

    const group = groupResult.rows[0];

    // Add creator as member
    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, req.user.id]
    );

    res.status(201).json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Join group
app.post('/api/groups/join', authenticateToken, async (req, res) => {
  const { inviteCode } = req.body;

  if (!inviteCode) {
    return res.status(400).json({ error: 'Invite code required' });
  }

  try {
    const groupResult = await pool.query(
      'SELECT * FROM groups WHERE invite_code = $1',
      [inviteCode]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    const group = groupResult.rows[0];

    // Check if already a member
    const memberCheck = await pool.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group.id, req.user.id]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
      [group.id, req.user.id]
    );

    res.json({ message: 'Joined group successfully', group });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

// Get group members
app.get('/api/groups/:id/members', authenticateToken, async (req, res) => {
  try {
    // Check if user is a member
    const memberCheck = await pool.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const result = await pool.query(`
      SELECT u.id, u.username, gm.joined_at
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = $1
      ORDER BY gm.joined_at ASC
    `, [req.params.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({ error: 'Failed to fetch group members' });
  }
});

// Leave group
app.delete('/api/groups/:id/leave', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING group_id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not a member of this group' });
    }

    // Check if group has no members left, delete it
    const memberCount = await pool.query(
      'SELECT COUNT(*) FROM group_members WHERE group_id = $1',
      [req.params.id]
    );

    if (parseInt(memberCount.rows[0].count) === 0) {
      await pool.query('DELETE FROM groups WHERE id = $1', [req.params.id]);
    }

    res.json({ message: 'Left group successfully' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

// ============= GPX IMPORT ROUTE =============

app.post('/api/import/gpx', authenticateToken, upload.single('gpxFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'GPX file required' });
  }

  try {
    const gpxContent = fs.readFileSync(req.file.path, 'utf8');
    const gpx = new gpxParser();
    gpx.parse(gpxContent);

    const importedPins = [];

    // Import waypoints
    if (gpx.waypoints && gpx.waypoints.length > 0) {
      for (const waypoint of gpx.waypoints) {
        const result = await pool.query(
          'INSERT INTO pins (user_id, title, description, latitude, longitude) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [
            req.user.id,
            waypoint.name || 'Imported Waypoint',
            waypoint.desc || waypoint.cmt || '',
            waypoint.lat,
            waypoint.lon
          ]
        );
        importedPins.push(result.rows[0]);
      }
    }

    // Import track points as pins
    if (gpx.tracks && gpx.tracks.length > 0) {
      for (const track of gpx.tracks) {
        if (track.points && track.points.length > 0) {
          // Import first and last point of each track segment
          const firstPoint = track.points[0];
          const lastPoint = track.points[track.points.length - 1];

          const firstResult = await pool.query(
            'INSERT INTO pins (user_id, title, description, latitude, longitude) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [
              req.user.id,
              `${track.name || 'Track'} - Start`,
              'Imported from GPX track',
              firstPoint.lat,
              firstPoint.lon
            ]
          );
          importedPins.push(firstResult.rows[0]);

          if (track.points.length > 1) {
            const lastResult = await pool.query(
              'INSERT INTO pins (user_id, title, description, latitude, longitude) VALUES ($1, $2, $3, $4, $5) RETURNING *',
              [
                req.user.id,
                `${track.name || 'Track'} - End`,
                'Imported from GPX track',
                lastPoint.lat,
                lastPoint.lon
              ]
            );
            importedPins.push(lastResult.rows[0]);
          }
        }
      }
    }

    // Delete temporary GPX file
    fs.unlinkSync(req.file.path);

    res.json({ 
      message: `Imported ${importedPins.length} pins from GPX`,
      pins: importedPins
    });
  } catch (error) {
    console.error('GPX import error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Failed to import GPX file' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const startServer = async () => {
  try {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
