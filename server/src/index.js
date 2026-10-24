import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { analyzeIssueImage, DEMO_PRESETS } from './services/geminiService.js';
import {
  lookupWardDepartment,
  detectDuplicates,
  calculateImpactScore,
  createComplaintTicket,
  getComplaintStatus,
  getAllComplaints,
  updateComplaintStatus
} from './services/complaintService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Setup directories
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const SAMPLES_DIR = path.join(__dirname, '..', 'sample-images');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(SAMPLES_DIR)) fs.mkdirSync(SAMPLES_DIR, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/sample-images', express.static(SAMPLES_DIR));

// Multer storage setup for image validation (FR-01)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `civic-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Please upload JPG, PNG, or WebP images only.'));
    }
  }
});

// --- API ROUTES ---

// Health & Config Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'CivicSathi AI Backend',
    timestamp: new Date().toISOString(),
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    mode: process.env.GEMINI_API_KEY ? 'live_enabled' : 'demo_fallback'
  });
});

// FR-01, FR-02, FR-03: Analyze Image via Vision AI or Labelled Demo Mode
app.post('/api/analyze', upload.single('photo'), async (req, res) => {
  try {
    const hintScenario = req.body.hintScenario;
    const customApiKey = req.body.customApiKey;

    let imagePath = null;
    let mimeType = 'image/jpeg';
    let fileUrl = null;

    if (req.file) {
      imagePath = req.file.path;
      mimeType = req.file.mimetype;
      fileUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.sampleImagePath) {
      fileUrl = req.body.sampleImagePath;
      imagePath = path.join(__dirname, '..', req.body.sampleImagePath.replace(/^\//, ''));
    }

    const analysis = await analyzeIssueImage({
      filePath: imagePath,
      mimeType,
      hintScenario,
      customApiKey
    });

    // Enrich analysis with ward / department info if area is provided
    const areaName = req.body.area || '';
    if (areaName) {
      const lookup = lookupWardDepartment(areaName, analysis.issueType);
      if (lookup.ward) {
        analysis.wardId = lookup.ward.wardId;
        analysis.wardName = lookup.ward.wardName;
      }
      if (lookup.department) {
        analysis.departmentId = lookup.department.departmentId;
        analysis.departmentName = lookup.department.departmentName;
      }
    }

    res.json({
      success: true,
      imageUrl: fileUrl,
      analysis
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Image analysis failed'
    });
  }
});

// FR-04 & FR-05: Deterministic Ward & Department Lookup
app.get('/api/wards/lookup', (req, res) => {
  const { area, issueType } = req.query;
  const result = lookupWardDepartment(area, issueType);
  res.json({
    success: true,
    ...result
  });
});

// USP 1: Duplicate Complaint Intelligence
app.post('/api/complaints/duplicates', (req, res) => {
  const { issueType, areaName, excludeTicketId } = req.body;
  if (!issueType || !areaName) {
    return res.status(400).json({ success: false, error: 'issueType and areaName are required.' });
  }
  const duplicates = detectDuplicates(issueType, areaName, excludeTicketId);
  res.json({
    success: true,
    ...duplicates
  });
});

// USP 2: Impact Score preview
app.post('/api/complaints/impact-score', (req, res) => {
  const { severity, issueType, duplicateCount } = req.body;
  const score = calculateImpactScore({ severity, issueType, duplicateCount });
  res.json({
    success: true,
    impact: score
  });
});

// FR-06, FR-07, FR-10: Persistent Ticket Creation
app.post('/api/complaints', (req, res) => {
  try {
    const ticketPayload = req.body;

    if (!ticketPayload.issueType || !ticketPayload.areaName) {
      return res.status(400).json({
        success: false,
        error: 'Issue type and area name are required to register a ticket.'
      });
    }

    const ticket = createComplaintTicket(ticketPayload);
    res.status(201).json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error('Ticket creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create complaint ticket'
    });
  }
});

// FR-08: Status Lookup by Ticket ID
app.get('/api/complaints/:ticketId', (req, res) => {
  const ticket = getComplaintStatus(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({
      success: false,
      error: `Ticket '${req.params.ticketId}' not found in local municipal records. Please check the ticket number.`
    });
  }
  res.json({
    success: true,
    ticket
  });
});

// Admin / Demo List all complaints
app.get('/api/complaints', (req, res) => {
  const { status, wardId, departmentId } = req.query;
  const complaints = getAllComplaints({ status, wardId, departmentId });
  res.json({
    success: true,
    count: complaints.length,
    complaints
  });
});

// FR-11: Admin Status Update
app.patch('/api/complaints/:ticketId/status', (req, res) => {
  const { status, note, actor } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, error: 'Status is required.' });
  }

  const updated = updateComplaintStatus(req.params.ticketId, status, note, actor);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Complaint ticket not found.' });
  }

  res.json({
    success: true,
    ticket: updated
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

app.listen(PORT, () => {
  console.log(`CivicSathi AI Server running on port ${PORT}`);
  console.log(`Local JSON storage active in: ${path.join(__dirname, '..', 'data')}`);
});
