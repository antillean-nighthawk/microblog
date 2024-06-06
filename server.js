const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const dotenv = require('dotenv');
const crypto = require('crypto');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Load environment variables from .env file
dotenv.config();
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const accesstok = process.env.EMOJI_API_KEY;

const app = express();
const PORT = 3000;
const dbFileName = 'microblog.db';

// oauth flow structure
const GOOGLE_LOGIN = `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${CLIENT_ID}&redirect_uri=http://localhost:3000/auth/google/callback&scope=https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile&prompt=consent`;

// set up db conection
async function connectToDatabase() {
    try {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
        console.log('Connected to the database successfully.');
        return db;
    } catch (error) {
        console.error('Error connecting to the database:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}

// Configure passport
passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Handlebars Helpers

Handlebars helpers are custom functions that can be used within the templates 
to perform specific tasks. They enhance the functionality of templates and 
help simplify data manipulation directly within the view files.

In this project, two helpers are provided:

1. toLowerCase:
- Converts a given string to lowercase.
- Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

2. ifCond:
- Compares two values for equality and returns a block of content based on 
the comparison result.
- Usage example: 
{{#ifCond value1 value2}}
<!-- Content if value1 equals value2 -->
{{else}}
<!-- Content if value1 does not equal value2 -->
{{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/
app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
            json: function(object) {
                return JSON.stringify(object);
            },
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use((req, res, next) => {
    res.locals.appName = 'PlantToucher';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Touch';

    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    res.locals.userName = req.session.userName || '';
    res.locals.userPfp = req.session.userPfp || undefined;
    res.locals.hashedGoogleId = req.session.hashedGoogleId || '';

    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', async (req, res) => { // Make the route handler asynchronous
    try {
        const posts = await getPosts(req); 
        const user = getCurrentUser(req) || {};
        res.render('home', { posts, user });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Could not fetch homepage');
    }
});

// sorting
app.get('/:order', async (req, res) => { // Make the route handler asynchronous
    try {
        const posts = await getPosts(req); 
        const user = getCurrentUser(req) || {};
        res.render('home', { posts, user });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Could not fetch homepage');
    }
});

// Error route: render error page
app.get('/error', (req, res) => {
    res.render('error');
});

// Additional routes that you must implement
app.get('/post/:id', (req, res) => {
    const post = getPostById(req.params.id);
    const user = findUserById(getCurrentUser(req));
    res.render('post', { post, user });
});

app.post('/posts', async (req, res) => {
    try {
        await addPost(req);
        res.redirect('/');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('New post failed');
    }
});

app.post('/like/:id', async (req, res) => {
    try {
        const updatedLikes = await updatePostLikes(req, res);
        res.send({ likes: updatedLikes }); // Return updated like count
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('New post failed');
    }
});

app.get('/profile', async (req, res) => {
    try {
        await renderProfile(req, res);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Could not render profile page');
    }
});

app.get('/avatar/:username', (req, res) => {
    handleAvatar(req, res);
});

app.post('/delete/:id', isAuthenticated, async (req, res) => {
    try {
        if (isAuthenticated) {
            await deletePostById(req);
            res.status(200).send({ success: true }); // Sending a success response
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Could not delete post');
    }
});

app.post('/unregister', isAuthenticated, async (req, res) => {
    try {
        if (isAuthenticated) {
            await deleteUserById(req);
            loggedIn = false;
            res.redirect("/logout");
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Could not delete post');
    }
});

// oauth routes

// Route for initiating Google OAuth authentication
app.get('/auth/google', async (req, res) => {
    res.redirect(GOOGLE_LOGIN);
});

// Callback route after successful authentication

app.get('/auth/google/callback', async (req, res) => {
    // Successful authentication, redirect to some other page
    const hashedGoogleId = crypto.createHash('sha256').update(req.query.code).digest('hex');
    req.session.hashedGoogleId = hashedGoogleId;
    const existingUser = await findUserByHash(hashedGoogleId);

    if (existingUser) {
        await loginUser(req, res);
        console.log("logged in");
        res.redirect('/');
    }

    res.render("registerUsername");
});

app.get('/registerUsername', async (req, res) => {
    console.log("redirectjjjj");
    console.log(req.originalUrl);
    console.log(req.path);
    console.log('username creation page');
    res.render('registerUsername');
});

app.post('/registerUsername', async (req, res) => {
    if (!req.session.hashedGoogleId) { // If Google ID is not provided, return error
        res.redirect('error');
        return;
    }

    let sanitizedUsername = (req.body.register_username).trim();
    sanitizedUsername = escapeHtml(sanitizedUsername);
   
    const checkUsername = await findUserByUsername(sanitizedUsername);
    if (checkUsername) {
        req.query.error = "Sorry, username already exists :( Try again";
        res.render('registerUsername', { regError: req.query.error });
    } else {
        try {
            await addUser(req);
            await loginUser(req, res);
            res.redirect('/');
        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Could not register user.');
        }
    }
});

app.get('/logout', async (req, res) => {
    try {
        await logoutUser(req, res);
        res.redirect('/googleLogout');
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Could not logout user.');
    }
});

app.get('/googleLogout', async (req, res) => {
    res.render('googleLogout');
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
connectToDatabase(); // init db async

app.listen(PORT, () => { // then init server
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Functions to find a user
async function findUserByUsername(username) {
    try {
        const myDb = await connectToDatabase();
        const user = await myDb.get('SELECT * FROM users WHERE username = ?', [username]);
        return user !== undefined ? user : undefined;
    } catch (error) {
        console.error('Error finding user by username:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}
async function findUserById(userId) {
    try {
        const myDb = await connectToDatabase();
        const user = await myDb.get('SELECT * FROM users WHERE id = ?', [userId]);
        return user !== undefined ? user : undefined;
    } catch (error) {
        console.error('Error finding user by username:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}
async function findUserByHash(hash) {
    try {
        const myDb = await connectToDatabase();
        const user = await myDb.get('SELECT * FROM users WHERE hashedGoogleId = ?', [hash]);
        return user !== undefined ? user : undefined;
    } catch (error) {
        console.error('Error finding user by hash:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}

// Function to add a new user
async function addUser(req) {
    const now = new Date().toISOString()
    try {
        const myDb = await connectToDatabase();
        await myDb.run(
            'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
            [escapeHtml(req.body.register_username.trim()), req.session.hashedGoogleId, undefined, now]
        );
        console.log(`User '${req.body.register_username}' added successfully.`);
    } catch (error) {
        console.error('Error adding user to the database:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}

// Function to delete a user
async function deleteUserById(req) {
    try {
        const myDb = await connectToDatabase();
        await myDb.run(`DELETE FROM users WHERE id = ?`, getCurrentUser(req));
        console.log(`User deleted successfully.`);
    } catch (error) {
        console.error('Error deleting user from db:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        console.log("User authenticated: ", req.session.userId);
        next();
    } else { res.redirect('login'); }
}

// Function to login a user 
async function loginUser(req, res) {
    const user = await findUserByHash(req.session.hashedGoogleId);
    console.log(user);
    
    req.session.userId = user.id;
    req.session.loggedIn = true;
    req.session.userName = user.username;
    req.session.userPfp = user.avatar_url;

    res.locals.userId = user.id;
    res.locals.loggedIn = true;
    res.locals.userName = user.username;
    res.locals.userPfp = user.avatar_url;

    console.log("Logged in as: ", user.id);
}

// Function to logout a user
async function logoutUser(req, res) {
    req.session.userId = '';
    req.session.loggedIn = false;
    req.session.userName = '';
    req.session.userPfp = undefined;
    req.session.hashedGoogleId = '';

    res.locals.userId = '';
    res.locals.loggedIn = false;
    res.locals.userName = '';
    res.locals.userPfp = undefined;

    console.log("Logged out successfully");
}

// Function to render the profile page
async function renderProfile(req, res) {
    try {
        const myDb = await connectToDatabase();
        const userObject = await findUserById(getCurrentUser(req));
        console.log(userObject);
        const userPosts = await myDb.all(
            'SELECT * FROM posts WHERE username = ?',
            [userObject.username]
        );
        console.log(`Posts for '${userObject.username}' found successfully.`);
        res.render('profile', { userObject, userPosts });
    } catch (error) {
        console.error(`Error finding user '${userObject.username}':`, error);
        throw error; // Rethrow the error for the caller to handle
    }
}

// Function to update post likes
async function updatePostLikes(req, res) {
    try {
        const myDb = await connectToDatabase();
        const postToLike = await getPostById(req.params.id);
        const newLikeCount = postToLike.likes + 1;
        await myDb.run(
            'UPDATE posts SET likes = ? WHERE id = ?',
            [newLikeCount, req.params.id]
        );
        console.log(`Likes for post '${req.params.id}' incremented successfully.`);
        return newLikeCount;
    } catch (error) {
        console.error(`Error liking post '${req.params.id}':`, error);
        throw error; // Rethrow the error for the caller to handle
    }
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    const { username } = req.params;
    const firstLetter = username.charAt(0).toUpperCase(); // Ensure it's uppercase for consistency
    const avatarDataURL = generateAvatar(firstLetter);

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(avatarDataURL.split(',')[1], 'base64'));
}

// Function to get the current user from session
function getCurrentUser(req) {
    return req.session.userId;
}

// Function to get all posts, sorted by latest first
async function getPosts(req) {
    try {
        const myDb = await connectToDatabase(); // Wait for the database connection to be initialized
        let posts = await myDb.all('SELECT * FROM posts ORDER BY id DESC');

        if (req.params.order == "oldestFirst") {
            posts = await myDb.all('SELECT * FROM posts ORDER BY id ASC');
        } else if (req.params.order == "mostLiked") {
            posts = await myDb.all('SELECT * FROM posts ORDER BY likes DESC');
        }

        console.log(`Posts fetched successfully.`);
        return posts;
    } catch (error) {
        console.error('Error fetching posts:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}

// Function to add a new post
async function addPost(req) {
    const now = new Date().toISOString();
    const cur_user = await findUserById(getCurrentUser(req));

    try {
        const myDb = await connectToDatabase();
        await myDb.run(
            'INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',
            [escapeHtml(req.body.title), escapeHtml(req.body.content), cur_user.username, now, 0]
        );
        console.log(`Post '${req.body.title}' added successfully.`);
    } catch (error) {
        console.error('Error adding post to the database:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}

function generateAvatar(letter, width = 100, height = 100) {
    // Choose a color scheme based on the letter
    const colors = ['#FF5733', '#FFC300', '#36D7B7', '#3498DB', '#9B59B6', '#E74C3C'];
    const charCode = letter.charCodeAt(0);
    const colorIndex = charCode % colors.length;
    const color = colors[colorIndex];

    // Create a new canvas (not using document.createElement)
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw the background color
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    // Draw the letter in the center
    ctx.font = `${Math.min(width, height) * 0.5}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'white';
    ctx.fillText(letter, width / 2, height / 2);

    // Convert the canvas to a PNG buffer
    return canvas.toDataURL('image/png');
}

async function getPostById(id) {
    try {
        const myDb = await connectToDatabase();
        const post = await myDb.get('SELECT * FROM posts WHERE id = ?', [id]);
        return post;
    } catch (error) {
        console.error('Error finding user by username:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}

async function deletePostById(req) {
    try {
        const myDb = await connectToDatabase();
        const find_post = await getPostById(req.params.id);
        const find_user = await findUserById(getCurrentUser(req));
        if (find_post.username === find_user.username) {
            await myDb.run(`DELETE FROM posts WHERE id = ?`, [req.params.id]);
            console.log(`Post deleted successfully.`);
        }
    } catch (error) {
        console.error('Error deleting post from dbFileName:', error);
        throw error; // Rethrow the error for the caller to handle
    }
}

function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}