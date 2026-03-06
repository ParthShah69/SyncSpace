import express from 'express';
import { upload } from '../config/cloudinary.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Wrap multer upload to gracefully catch and return errors like Cloudinary 401s
const uploadSingle = (req, res, next) => {
    const uploader = upload.single('file');
    uploader(req, res, function (err) {
        if (err) {
            console.error('Multer/Cloudinary Upload Error:', err);
            return res.status(err.http_code || 500).json({ message: err.message || 'File upload failed due to server error' });
        }
        next();
    });
};

// @desc    Upload a single file
// @route   POST /api/upload
// @access  Private
router.post('/', protect, uploadSingle, (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        res.status(200).json({
            url: req.file.path,
            name: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// @desc    Download a file from Cloudinary bypassing fl_attachment constraints
// @route   GET /api/upload/download
// @access  Private
router.get('/download', protect, async (req, res) => {
    try {
        const { url, name } = req.query;
        if (!url) return res.status(400).json({ message: 'URL is required' });

        console.log(`[Proxy Download] Attempting to fetch: ${url}`);
        let response = await fetch(url);

        if (!response.ok && url.includes('/image/upload/')) {
            console.log(`[Proxy Download] Failed. Retrying as raw fallback...`);
            const fallbackUrl = url.replace('/image/upload/', '/raw/upload/');
            response = await fetch(fallbackUrl);
        }

        if (!response.ok) {
            console.error(`[Proxy Download] Cloudinary returned ${response.status} ${response.statusText}`);
            throw new Error(`Cloudinary fetch failed: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader('Content-Disposition', `attachment; filename="${name || 'download'}"`);
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
        res.send(buffer);
    } catch (error) {
        console.error('Proxy download error:', error);
        res.status(500).json({ message: 'Failed to proxy download' });
    }
});

export default router;
