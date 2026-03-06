import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        // Force PDF, ZIP and other documents to upload as 'raw' so Cloudinary doesn't block them with 401 Unauthorized
        const isMedia = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
        return {
            folder: 'syncspace_chat',
            resource_type: isMedia ? 'auto' : 'raw',
            original_filename: file.originalname.split('.')[0]
        };
    },
});

export const upload = multer({ storage });
export { cloudinary };
