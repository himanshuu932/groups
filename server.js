const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const morgan = require('morgan');

const User = require('./models/User');
const Group = require('./models/Group');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 30001;
const MONGODB_URI = 'mongodb+srv://himanshuu932:88087408601@cluster0.lu2g8bw.mongodb.net/chatApp?retryWrites=true&w=majority&appName=Cluster0';

// Middleware
app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
const db = mongoose.connection;
db.on('error', (err) => console.log(err));
db.once('open', () => console.log("Connected to MongoDB"));

// User registration
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        let user = await User.findOne({ email });

        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        user = new User({ name, email, password });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        res.status(200).json({ success: true, message: 'User registered successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// User login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        
        if (!user) {
            return res.status(400).json({ success: false, msg: 'Invalid email' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.status(400).json({ success: false, msg: 'Invalid password' });
        }

        // Send user ID along with name and success message
        res.json({
            success: true,
            id: user._id,       // Include user ID
            name: user.name,
            message: 'User authenticated successfully'
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Serve the HTML files
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(__dirname, "groups", "index.html")));
app.get("/groups.html", (req, res) => res.sendFile(path.join(__dirname, "groups", "groups.html")));

// Group management
app.post('/groups', async (req, res) => {
    const { name, password } = req.body;
    try {
        const existingGroup = await Group.findOne({ name });
        if (existingGroup) {
            return res.status(400).json({ error: 'Group name already exists. Please choose a different name.' });
        }
        const group = new Group({ name, password });
        await group.save();
        res.status(201).json(group);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/groups', async (req, res) => {
    const groups = await Group.find({});
    res.json(groups);
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'groups', 'index.html'));
});

app.delete('/groups/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await Group.findByIdAndDelete(id);
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Endpoint to get group name by ID
app.get('/group/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const group = await Group.findById(id);
        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }
        res.json({ name: group.name });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});
app.post('/get-username-by-id', async (req, res) => {
    const { id } = req.body;

    try {
        // Ensure the ID is valid
        if (!id) {
            return res.status(400).json({ success: false, msg: 'ID is required' });
        }

        // Find the user by ID
        const user = await User.findById(id);
        
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        // Respond with the username
        res.json({
            success: true,
            username: user.name
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Serve socket.io.js file directly
app.get("/socket.io/socket.io.js", (req, res) => {
    res.sendFile(path.join(__dirname, "node_modules", "socket.io", "client-dist", "socket.io.js"));
});

io.on('connection', (socket) => {
    console.log('A user connected');

    // Variable to store group membership
    let currentGroupName = '';
    let currentUserName = '';

    // Handle join group
    socket.on('join group', (groupName, userName) => {
        currentGroupName = groupName;
        currentUserName = userName;

        socket.join(groupName);
        io.to(groupName).emit('user joined', userName);

        // Handle chat messages within the group
        socket.on('chat message', (data) => {
            io.to(groupName).emit('chat message', data);
        });

        // Handle user leaving explicitly
        socket.on('user left', (userName, groupName) => {
            if (userName && groupName && currentGroupName === groupName) {
                io.to(groupName).emit('user left', userName);
            }
        });
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
        if (currentGroupName && currentUserName) {
            io.to(currentGroupName).emit('user left', currentUserName);
            console.log('User disconnected');
        }
    });

    // Handle new user
    socket.on('new user', (userName) => {
        if (userName) {
            io.emit('new user', userName);
        }
    });
});



server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
