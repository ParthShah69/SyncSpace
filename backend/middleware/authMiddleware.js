import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const protect = async (req, res, next) => {
    const token = req.cookies.jwt;

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-passwordHash');

        if (!user) {
            // User was deleted (e.g., DB reset) — clear the stale cookie
            res.cookie('jwt', '', { httpOnly: true, secure: true, sameSite: 'none', expires: new Date(0) });
            return res.status(401).json({ message: 'User no longer exists. Please log in again.' });
        }

        req.user = user;
        next();
    } catch (error) {
        // Token invalid or expired
        res.cookie('jwt', '', { httpOnly: true, secure: true, sameSite: 'none', expires: new Date(0) });
        res.status(401).json({ message: 'Not authorized, token failed' });
    }
};

export { protect };
