const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');


require('dotenv').config();
const accesstok = process.env.EMOJI_API_KEY;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
const app = express();
const PORT = 3000;

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

// Set up Handlebars view engine with custom helpers
//
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

    if (res.locals.userId) {
        res.locals.userName = findUserById(res.locals.userId).username;
        res.locals.userPfp = findUserById(res.locals.userId).avatar_url;
    } else {
        res.locals.userName = '';
        res.locals.userPfp = undefined;
    }

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
app.get('/', (req, res) => {
    const posts = getPosts();
    const user = getCurrentUser(req) || {};
    res.render('home', { posts, user });
});

// Register GET route is used for error response from registration
app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

// Login route GET route is used for error response from login
app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Error route: render error page
app.get('/error', (req, res) => {
    res.render('error');
});

// Additional routes that you must implement
app.get('/post/:id', (req, res) => {
    const post = getPostById(req.params.id);
    const user = findUserById(req.session.userId);
    res.render('post', { post, user });
});

app.post('/posts', (req, res) => {
    const curUser = findUserById(req.session.userId);
    addPost(req.body.title, req.body.content, curUser.username, req.session.userId);
    res.redirect('/');
});

app.post('/like/:id', (req, res) => {
    const likedPost = updatePostLikes(req, res);
    res.json(likedPost);
});

app.get('/profile', isAuthenticated, (req, res) => {
    if (isAuthenticated) { renderProfile(req, res); }
});

app.get('/avatar/:username', (req, res) => {
    handleAvatar(req, res);
});

app.post('/register', (req, res) => {
    registerUser(req, res);
});

app.post('/login', (req, res) => {
    loginUser(req, res);
    res.render('loginRegister', { loginError: "User not found" });
});

app.get('/logout', (req, res) => {
    logoutUser(req, res);
});

app.post('/delete/:id', isAuthenticated, (req, res) => {
    const curUser = findUserById(req.session.userId);
    deletePostById(req.params.id, curUser.username);
    const posts = getPosts();
    res.render('home', { posts, curUser });
});
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Example data for posts and users
let posts = [
    { id: 1, title: 'Sample Post', content: 'This is a sample post.', username: 'SampleUser', timestamp: '2024-01-01 10:00', likes: 0, userid: 1 },
    { id: 2, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0, userid: 2 },
    { id: 3, title: 'New Post', content: 'This is a new post.', username: 'NewUser', timestamp: '2024-01-03 14:00', likes: 0, userid: 3 },
    { id: 4, title: 'Exciting Post', content: 'This is an exciting post.', username: 'ExcitingUser', timestamp: '2024-01-04 16:00', likes: 0, userid: 4 },
    { id: 5, title: 'Interesting Post', content: 'This is an interesting post.', username: 'InterestingUser', timestamp: '2024-01-05 18:00', likes: 0, userid: 5 }
];
let users = [
    { id: 1, username: 'SampleUser', avatar_url: undefined, memberSince: '2024-01-01 08:00' },
    { id: 2, username: 'AnotherUser', avatar_url: undefined, memberSince: '2024-01-02 09:00' },
    { id: 3, username: 'NewUser', avatar_url: undefined, memberSince: '2024-01-03 10:00' },
    { id: 4, username: 'ExcitingUser', avatar_url: undefined, memberSince: '2024-01-04 11:00' },
    { id: 5, username: 'InterestingUser', avatar_url: undefined, memberSince: '2024-01-05 12:00' }
];

// Functions to find a user
function findUserByUsername(username) {
    for (var i = 0; i < users.length; i++) {
        if (users[i].username == username) {
            return users[i];
        }
    }
    return undefined;
}

function findUserById(userId) {
    for (var i = 0; i < users.length; i++) {
        if (users[i].id == userId) {
            return users[i];
        }
    }
    return undefined;
}

// Function to add a new user
function addUser(username) {
    // Generate a unique ID for the new user
    const newUserId = users.length > 0 ? users[users.length - 1].id + 1 : 1;

    const newUser = {
        id: newUserId,
        username: username,
        avatar_url: undefined,
        memberSince: new Date().toISOString()
    };

    users.push(newUser);
    return newUser;
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        console.log("User authenticated: ", req.session.userId);
        next();
    } else { res.redirect('/login'); }
}

// Function to register a user
function registerUser(req, res) {
    if (users.some(user => user.username === req.body.register_username)) {
        res.render('loginRegister', { regError: "User already exists" });
        return;
    }

    addUser(req.body.register_username);
    console.log("Registration successful: ", req.body.register_username);
    res.redirect('/login');
}

// Function to login a user
function loginUser(req, res) {
    const user = users.some(user => user.username === req.body.login_username);

    if (!user) {
        res.render('loginRegister', { loginError: "User does not exist" });
        return;
    }

    req.session.userId = user.id;
    res.locals.userId = user.id;
    req.session.loggedIn = true;
    res.locals.loggedIn = true;
    console.log("Logged in as: ", user.id);
    res.redirect('/');
}

// Function to logout a user
function logoutUser(req, res) {
    req.session.userId = '';
    res.locals.userId = '';
    req.session.loggedIn = false;
    res.locals.loggedIn = false;
    console.log("Logged out successfully");
    res.redirect('/');
}

// Function to render the profile page
function renderProfile(req, res) {
    const userObject = findUserById(req.session.userId);
    const userPosts = posts.filter(post => post.username === userObject.username);
    res.render('profile', { userObject, userPosts });
}

// Function to update post likes
function updatePostLikes(req, res) {
    for (var i = 0; i < posts.length; i++) {
        if (posts[i].id == req.params.id) {
            posts[i].likes++;
            console.log('liked this post', posts[i].likes);
            return posts[i];
        }
    }
}

// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    // Extract username from request parameters
    const { username } = req.params;

    // Get the first letter of the username
    const firstLetter = username.charAt(0).toUpperCase(); // Ensure it's uppercase for consistency

    // Generate avatar image data URL using generateAvatar function
    const avatarDataURL = generateAvatar(firstLetter);

    // Set response headers to indicate image content
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');

    // Send the image as a response
    res.send(Buffer.from(avatarDataURL.split(',')[1], 'base64'));
}

// Function to get the current user from session
function getCurrentUser(req) {
    return req.session.userId;
}

// Function to get all posts, sorted by latest first
function getPosts() {
    return posts.slice().reverse();
}

// Function to add a new post
function addPost(title, content, user, uid) {
    // Generate a unique ID for the new post
    const id = posts.length > 0 ? posts[posts.length - 1].id + 1 : 1;

    // Get the current timestamp
    const timestamp = new Date().toISOString();

    // Create the new post object
    const newPost = {
        id: id,
        title: title,
        content: content,
        username: user,
        timestamp: timestamp,
        likes: 0,
        userid: uid,
    };

    // Add the new post to the posts array
    posts.push(newPost);

    // Optionally, return the new post
    return newPost;
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

function getPostById(id) {
    for (var i = 0; i < posts.length; i++) {
        if (posts[i].id == id) {
            return posts[i];
        }
    }
}

function deletePostById(post_id, cur_user) {
    postInQuestion = getPostById(post_id);

    if (cur_user === postInQuestion.username) {
        const index = posts.indexOf(postInQuestion);

        if (index > -1) { // only splice array when item is found
            posts.splice(index, 1); // 2nd parameter means remove one item only
            console.log("deletion success");
        }
    }

    return posts;
}