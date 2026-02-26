// src/middleware/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Allow all file types for demo
  // You can add restrictions here
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE) || 10) * 1024 * 1024,
  },
  fileFilter: fileFilter,
});

// Dynamic storage for lead documents
const leadDocStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const leadId = req.params.id;
    const documentType = req.body.documentType || req.query.documentType || 'Other';
    const safeDocType = documentType.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    const leadDir = path.join(process.cwd(), 'uploads', 'leads', leadId, safeDocType);

    if (!fs.existsSync(leadDir)) {
      fs.mkdirSync(leadDir, { recursive: true });
    }

    cb(null, leadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const leadDocumentUpload = multer({
  storage: leadDocStorage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE) || 50) * 1024 * 1024, // 50MB limit for docs
  }
  // no strict file filter so we can accept spread sheets, powerpoints, etc.
});

// Dynamic storage for deal documents
const dealDocStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dealId = req.params.id;
    const documentType = req.body.documentType || req.query.documentType || 'Other';
    const safeDocType = documentType.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    const dealDir = path.join(process.cwd(), 'uploads', 'deals', dealId, safeDocType);

    if (!fs.existsSync(dealDir)) {
      fs.mkdirSync(dealDir, { recursive: true });
    }

    cb(null, dealDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const dealDocumentUpload = multer({
  storage: dealDocStorage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE) || 50) * 1024 * 1024, // 50MB limit
  }
});

module.exports = {
  upload,
  leadDocumentUpload,
  dealDocumentUpload
};