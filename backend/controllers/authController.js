import User from '../models/User.js';
import OTP from '../models/OTP.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import sendEmail from '../utils/sendEmail.js';

// Generate JWT token
const generateToken = (res, userId) => {
    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });

    res.cookie('jwt', token, {
        httpOnly: true,
        secure: true, // MUST be true for sameSite 'none' across different domains
        sameSite: 'none', // Allows cross-origin Vercel -> Render cookie passing
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req, res) => {
    try {
        const { name, username, email, password, otp } = req.body;

        if (!otp) return res.status(400).json({ message: 'OTP is required' });
        if (!username) return res.status(400).json({ message: 'Username is required' });

        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'User already exists' });

        const usernameExists = await User.findOne({ username: username.toLowerCase() });
        if (usernameExists) return res.status(400).json({ message: 'Username already taken' });

        const validOtp = await OTP.findOne({ email, otp, type: 'registration' });
        if (!validOtp) return res.status(400).json({ message: 'Invalid or expired OTP' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const user = await User.create({ name, username: username.toLowerCase(), email, passwordHash });

        if (user) {
            await OTP.deleteOne({ _id: validOtp._id });
            generateToken(res, user._id);
            res.status(201).json({
                _id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                mutedChannels: user.mutedChannels || [],
                leftChannels: user.leftChannels || [],
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Send OTP
// @route   POST /api/auth/send-otp
// @access  Public
export const sendOtp = async (req, res) => {
    try {
        const { email, type } = req.body; // type: 'registration' | 'reset'

        if (!email || !type) return res.status(400).json({ message: 'Email and type required' });

        const userExists = await User.findOne({ email });

        if (type === 'registration' && userExists) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }
        if (type === 'reset' && !userExists) {
            return res.status(404).json({ message: 'No user found with this email' });
        }

        // Generate 6 digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Save to DB (this overwrites or just adds a new one depending on your security logic. 
        // We'll just create a new one. TTL will handle old ones, or we can delete old ones first)
        await OTP.deleteMany({ email, type });
        await OTP.create({ email, otp: otpCode, type });

        // Send Email
        const subject = type === 'registration' ? 'SyncSpace - Verify your email' : 'SyncSpace - Password Reset';
        const messageText = `Your OTP code is: ${otpCode}. It will expire in 10 minutes.`;
        const html = `
            <h2>SyncSpace Verification</h2>
            <p>Your OTP code is: <strong>${otpCode}</strong></p>
            <p>It will expire in 10 minutes.</p>
        `;

        await sendEmail({ to: email, subject, text: messageText, html });

        res.status(200).json({ message: 'OTP sent to email successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Reset password with OTP
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        const validOtp = await OTP.findOne({ email, otp, type: 'reset' });
        if (!validOtp) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        await user.save();

        await OTP.deleteOne({ _id: validOtp._id });

        res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && (await bcrypt.compare(password, user.passwordHash))) {
            generateToken(res, user._id);
            res.json({
                _id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                mutedChannels: user.mutedChannels || [],
                leftChannels: user.leftChannels || [],
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Public
export const logoutUser = async (req, res) => {
    res.cookie('jwt', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        expires: new Date(0),
    });
    res.status(200).json({ message: 'Logged out successfully' });
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
export const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (user) {
            res.json({
                _id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                avatar: user.avatar,
                joinedWorkspaces: user.joinedWorkspaces,
                mutedChannels: user.mutedChannels || [],
                leftChannels: user.leftChannels || [],
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (user) {
            user.name = req.body.name || user.name;
            user.username = (req.body.username || user.username).toLowerCase();
            user.email = req.body.email || user.email;
            user.avatar = req.body.avatar || user.avatar;
            if (req.body.mutedChannels) user.mutedChannels = req.body.mutedChannels;
            if (req.body.leftChannels) user.leftChannels = req.body.leftChannels;

            if (req.body.password) {
                const salt = await bcrypt.genSalt(10);
                user.passwordHash = await bcrypt.hash(req.body.password, salt);
            }

            const updatedUser = await user.save();
            res.json({
                _id: updatedUser._id,
                name: updatedUser.name,
                username: updatedUser.username,
                email: updatedUser.email,
                avatar: updatedUser.avatar,
                mutedChannels: updatedUser.mutedChannels || [],
                leftChannels: updatedUser.leftChannels || [],
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
