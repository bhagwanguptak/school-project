const dotenv = require('dotenv');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
// const fs = require('fs');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken'); 

const dbManager = require('./database');

const saltRounds = 10;
const app = express();
let mailTransporter;
const envConfig = dotenv.config({ path: path.resolve(__dirname, 'variables.env') });


// Import the 'put' function from Vercel Blob
const { put,del } = require('@vercel/blob');


if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  mailTransporter.verify(function(error) {
    if (error) console.warn("Nodemailer: Error configuring mail transporter.", error.message);
    else console.log("Nodemailer: Server is ready to take our messages");
  });
} else {
  console.warn("Nodemailer: SMTP environment variables not fully set.");
}

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}
if (!process.env.JWT_SECRET) {
    console.error("💥 FATAL ERROR: JWT_SECRET is not defined in your variables.env file.");
    process.exit(1);
}
if (envConfig.error) {
  console.error("💥 FATAL ERROR: Could not load variables.env file. Please ensure it exists.");
  process.exit(1); 
}
const allowedOrigins = [''];

if (process.env.VERCEL_URL) {
    const vercelUrl = process.env.VERCEL_URL.trim(); 
    if (!allowedOrigins.includes(vercelUrl)) { 
        allowedOrigins.push(vercelUrl);
        console.log(`INFO: Added VERCEL_URL: ${vercelUrl}`);
    }
}

if (process.env.FRONTEND_URL && process.env.NODE_ENV !== 'production') {
    const localFrontendUrl = process.env.FRONTEND_URL.trim();
    if (!allowedOrigins.includes(localFrontendUrl)) { 
        allowedOrigins.push(localFrontendUrl);
        console.log(`INFO: Added local FRONTEND_URL: ${localFrontendUrl}`);
    }
}


//    you can set an env var like: ADDITIONAL_ALLOWED_ORIGINS="https://staging.example.com,https://dev.example.com"
if (process.env.ADDITIONAL_ALLOWED_ORIGINS) {
    process.env.ADDITIONAL_ALLOWED_ORIGINS.split(',').forEach(url => {
        const trimmedUrl = url.trim();
        if (trimmedUrl && !allowedOrigins.includes(trimmedUrl)) {
            allowedOrigins.push(trimmedUrl);
            console.log(`INFO: Added additional allowed origin: ${trimmedUrl}`);
        }
    });
}


console.log('Final computed allowedOrigins array:', allowedOrigins); 

const corsOptions = {
    origin: function (origin, callback) {
        console.log(`Incoming request origin: '${origin}'`); 
        if (!origin || allowedOrigins.includes(origin)) {
            console.log(`Origin ALLOWED: '${origin}'`);
            callback(null, true);
        } else {
            console.error(`CORS BLOCKED: Origin '${origin}' is not in allowed list.`);
            console.error('Allowed list:', allowedOrigins);
            callback(new Error('The CORS policy for this site does not allow access from your origin.'));
        }
    },
    credentials: true 
};

app.use(cors(corsOptions));

app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));
// app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));



function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.warn('Invalid token received:', err.message);
            return res.status(403).json({ message: 'Access denied. Invalid or expired token.' });
        }
        req.user = user; 
        next();
    });
}




app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }
    try {
        const user = await dbManager.get('SELECT id, username, password FROM users WHERE username = ?', [username]);
        if (user && await bcrypt.compare(password, user.password)) {
            const payload = { id: user.id, username: user.username };
            const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
            console.log(`Login successful for '${username}'. JWT created.`);
            return res.json({ success: true, message: 'Login successful', token: token });
          
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }
    } catch (dbError) {
        console.error("Login DB error:", dbError);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

app.post('/api/logout', (req, res) => {
    console.log("Logout endpoint called. The client is responsible for deleting the token.");
    res.status(200).json({ message: "Logout acknowledged." });
});

app.get('/api/settings', async (req, res) => {
    try {
        const rows = await dbManager.all('SELECT setting_name, setting_value FROM settings');
        const settings = {};
        const jsonKeys = ['socialLinks', 'facilityCards', 'heroGradient', 'aboutGradient', 'admissionsGradient', 'academicsGradient', 'facilitiesGradient', 'contactGradient'];
        rows.forEach(row => {
            let value = row.setting_value;
            if (jsonKeys.includes(row.setting_name) && value && value.trim()) {
                try { value = JSON.parse(value); } catch (e) { value = (row.setting_name === 'facilityCards') ? [] : {}; }
            }
            settings[row.setting_name] = value;
        });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve settings.' });
    }
});
app.post('/api/settings', verifyToken, async (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: "Missing or invalid 'settings' object." });
    }
    try {
        const operations = Object.entries(settings).map(async ([key, value]) => {
            let valueToStore = (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value || '');
            await dbManager.run('DELETE FROM settings WHERE setting_name = ?', [key]);
            return dbManager.run('INSERT INTO settings (setting_name, setting_value) VALUES (?, ?)', [key, valueToStore]);
        });
        await Promise.all(operations);
        res.json({ message: 'Settings saved successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings.' });
    }
});

// const UPLOADS_DIR_PUBLIC = path.join(__dirname, 'public', 'uploads');
// if (!fs.existsSync(UPLOADS_DIR_PUBLIC)) {
//     fs.mkdirSync(UPLOADS_DIR_PUBLIC, { recursive: true });
// }
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => cb(null, UPLOADS_DIR_PUBLIC),
//     filename: (req, file, cb) => {
//         const timestamp = Date.now();
//         const randomString = Math.random().toString(36).substring(2, 8);
//         const ext = path.extname(file.originalname);
//         const basename = path.basename(file.originalname, ext).substring(0, 50).replace(/[^a-zA-Z0-9_.-]/g, '_');
//         cb(null, `${basename}-${timestamp}-${randomString}${ext}`);
//     }
// });
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed.'), false);
    },
    limits: { fileSize: 1000 * 1024 * 1024 }
});
const multerErrorHandler = (error, req, res, next) => {
    if (error) return res.status(400).json({ message: error.message });
    next();
};
async function handleUpload(req, res, fileType) {
    if (!req.file) {
        return res.status(400).json({ message: `No ${fileType} file provided.` });
    }
    try {
        const blob = await put(req.file.originalname, req.file.buffer, { access: 'public',allowOverwrite: true });
        res.json({ message: `${fileType} uploaded successfully`, url: blob.url });
    } catch (error) {
        console.error(`Error uploading ${fileType} to Vercel Blob:`, error);
        res.status(500).json({ message: `Failed to upload ${fileType}.` });
    }
}

app.post('/api/upload-logo', verifyToken, upload.single('logo'), multerErrorHandler, (req, res) => handleUpload(req, res, 'logo'));
app.post('/api/upload-about-image', verifyToken, upload.single('aboutImage'), multerErrorHandler, (req, res) => handleUpload(req, res, '"About Us" image'));
app.post('/api/upload-academics-image', verifyToken, upload.single('academicsImage'), multerErrorHandler, (req, res) => handleUpload(req, res, '"Academics" image'));


app.get('/api/carousel', async (req, res) => {
    try {
        const rows = await dbManager.all('SELECT * FROM carousel_images ORDER BY display_order ASC, id ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Failed to retrieve carousel images." });
    }
});
app.post('/api/carousel', verifyToken, upload.single('carouselImage'), multerErrorHandler, async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No carousel image file was uploaded.' });
    const imageUrl = `/uploads/${req.file.filename}`;
    const { linkURL, altText } = req.body;
    const sql = `INSERT INTO carousel_images (image_url, link_url, alt_text, file_name, display_order) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM carousel_images))`;
    try {
         const blob = await put(req.file.originalname, req.file.buffer, { access: 'public' });
         const result = await dbManager.run(sql, [blob.url, linkURL || null, altText || 'Carousel Image', req.file.originalname]);
        
        res.status(201).json({ message: 'Carousel image added successfully.', image: { id: result.lastID, image_url: blob.url } });
    } catch (err) {
         console.error("💥 BLOB UPLOAD FAILED! 💥");
        console.error("Error details:", error); // Print the full error object
        res.status(500).json({ error: "Failed to save carousel image." });
    }
});
app.delete('/api/carousel/:id', verifyToken, async (req, res) => {
    const imageId = parseInt(req.params.id, 10);
    if (isNaN(imageId)) return res.status(400).json({ error: 'Invalid image ID.' });
    try {
         // Step 1: Get the image record from DB to find the Blob URL
        const image = await dbManager.get('SELECT image_url FROM carousel_images WHERE id = ?', [imageId]);
        if (!image) return res.status(404).json({ error: 'Image not found.' });

        // Step 2: Delete the image from the database
        await dbManager.run('DELETE FROM carousel_images WHERE id = ?', [imageId]);
        
        // Step 3: Delete the file from Vercel Blob using its URL
        if (image.image_url) {
            try {
                await del(image.image_url);
            } catch (blobError) {
                // Log an error if Blob deletion fails, but don't fail the request
                // The DB record is already gone, which is the most important part.
                console.warn(`DB record for image ${imageId} deleted, but failed to delete file from Vercel Blob:`, blobError.message);
            }
        }
        res.json({ message: 'Carousel image deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Database error during deletion.' });
    }
});



app.get('/api/users', verifyToken, async (req, res) => {
    console.log(`User '${req.user.username}' is requesting user list.`);
    try {
        const users = await dbManager.all('SELECT id, username FROM users');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: 'Failed to retrieve users.' });
    }
});
app.post('/api/add-user', verifyToken, async (req, res) => {
    const data = req.body;
    if (!data.username || !data.password) return res.status(400).json({ error: 'Username and password are required.' });
    try {
        const existingUser = await dbManager.get("SELECT id FROM users WHERE username = ?", [data.username]);
        if (existingUser) return res.status(409).json({ message: `User '${data.username}' already exists.` });
        const hashedPassword = await bcrypt.hash(data.password, saltRounds);
        await dbManager.run("INSERT INTO users (username, password) VALUES (?, ?)", [data.username, hashedPassword]);
        res.status(201).json({ message: `User '${data.username}' added successfully.` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add user.' });
    }
});
app.delete('/api/delete-user/:id', verifyToken, async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID.' });
    try {
        const users = await dbManager.all('SELECT id FROM users');
        if (users.length <= 1) return res.status(403).json({ message: "Cannot delete the last user." });
        const result = await dbManager.run('DELETE FROM users WHERE id = ?', [userId]);
        if (result.changes > 0) res.json({ message: 'User deleted successfully.' });
        else res.status(404).json({ error: 'User not found.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user.' });
    }
});


app.post('/api/submit-contact', async (req, res) => {
  
   const { contactName, contactEmail, phoneNumber, contactSubject, contactMessage } = req.body;

  if (!contactName || !contactSubject || !contactMessage || !phoneNumber) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  let contactFormAction = process.env.CONTACT_FORM_ACTION_DEFAULT || 'whatsapp';
  let schoolContactEmail = process.env.SCHOOL_CONTACT_EMAIL_TO;
  let adminSchoolWhatsappNumber = '';

  try {
    const settingsRows = await dbManager.all(
        "SELECT setting_name, setting_value FROM settings WHERE setting_name IN (?, ?, ?)",
        ['contactFormAction', 'schoolContactEmail', 'adminSchoolWhatsappNumber']
    );
    settingsRows.forEach(row => {
        if (row.setting_name === 'contactFormAction' && row.setting_value) contactFormAction = row.setting_value;
        if (row.setting_name === 'schoolContactEmail' && row.setting_value) schoolContactEmail = row.setting_value;
        if (row.setting_name === 'adminSchoolWhatsappNumber' && row.setting_value) adminSchoolWhatsappNumber = row.setting_value;
    });
  } catch (dbError) {
      console.error("DB error fetching contact settings, using defaults.", dbError);
  }

  console.log(`Contact Form Action determined: ${contactFormAction}`);
  
  if (contactFormAction === 'whatsapp') {
      const whatsappNumber = adminSchoolWhatsappNumber || process.env.SCHOOL_WHATSAPP_NUMBER;
      if (!whatsappNumber) {
          return res.status(500).json({ success: false, message: "Server configuration error: WhatsApp number not set." });
      }
      const whatsappMessageBody = `*New Contact Form Submission:*\n-----------------------------\n*Name:* ${contactName}\n*Email:* ${contactEmail}\n*Phone Number*: ${phoneNumber}\n*Subject:* ${contactSubject}\n-----------------------------\n*Message:*\n${contactMessage}\n-----------------------------\nSent from the school website.`;
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessageBody)}`;
      return res.json({ success: true, action: 'whatsapp', whatsappUrl: whatsappUrl, message: "Please click 'Send' in WhatsApp." });
  } else if (contactFormAction === 'email') {
      if (!mailTransporter || !schoolContactEmail) {
          return res.status(500).json({ success: false, message: "Server configuration error: Email service not available or recipient not set." });
      }
      const mailOptions = {
          from: `"${contactName} via School Website" <${process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com'}>`,
          replyTo: contactEmail,
          to: schoolContactEmail,
          subject: `New Contact Form: ${contactSubject}`,
          text: `You have a new contact form submission:\n\nName: ${contactName}\nEmail: ${contactEmail}\nPhone Number: ${phoneNumber}\nSubject: ${contactSubject}\n\nMessage:\n${contactMessage}`,
          html: `<p><strong>You have a new contact form submission:</strong></p><ul><li><strong>Name:</strong> ${contactName}</li><li><strong>Email:</strong> ${contactEmail}</li><li><strong>Phone Number:</strong> ${phoneNumber}</li><li><strong>Subject:</strong> ${contactSubject}</li></ul><p><strong>Message:</strong></p><p>${contactMessage.replace(/\n/g, '<br>')}</p>`,
      };
      try {
          await mailTransporter.sendMail(mailOptions);
          return res.json({ success: true, action: 'email', message: 'Your message has been sent successfully!' });
      } catch (emailError) {
          console.error('Error sending email:', emailError);
          return res.status(500).json({ success: false, action: 'email', message: 'Failed to send message. Please try again later.' });
      }
  } else {
    return res.status(500).json({ success: false, message: "Server configuration error: Invalid contact form action." });
  }
});



app.use(express.static(path.join(__dirname, 'public')));



app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'school.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => {
        if (!res.token) {
            console.log('No token found. Redirecting to login.');
            res.sendFile(path.join(__dirname, 'public', 'login.html'))
        }
        else{
             res.sendFile(path.join(__dirname, 'public', 'admin.html'));
        }
    

   });
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/school', (req, res) => res.sendFile(path.join(__dirname, 'public', 'school.html')));


async function startServer() {
  try {
    await dbManager.initialize();

    const defaultAdminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminUser = await dbManager.get('SELECT id FROM users WHERE username = ?', [defaultAdminUsername]);
    if (!adminUser) {
        const defaultAdminPasswordPlain = process.env.ADMIN_PASSWORD_PLAIN || 'password123';
        const hashedPassword = await bcrypt.hash(defaultAdminPasswordPlain, saltRounds);
        await dbManager.run('INSERT INTO users (username, password) VALUES (?, ?)', [defaultAdminUsername, hashedPassword]);
        console.log(`Default admin user ('${defaultAdminUsername}') created.`);
    } else {
        console.log(`Admin user ('${defaultAdminUsername}') already exists.`);
    }

    const SERVER_PORT = process.env.PORT || 3000;
    app.listen(SERVER_PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Server is running on http://localhost:${SERVER_PORT}`);
      console.log(`🗃️  Database mode: ${dbManager.mode.toUpperCase()}`);
      console.log(`🔑 Authentication Mode: STATELESS (JWT)`);
    });
  } catch (error) {
    console.error("💥 FATAL ERROR during server startup:", error);
    process.exit(1);
  }
}


process.on('SIGINT', async () => {
  console.log('\nSIGINT signal received: closing DB connection.');
  await dbManager.close();
  console.log('DB connection closed. Exiting.');
  process.exit(0);
});

startServer();