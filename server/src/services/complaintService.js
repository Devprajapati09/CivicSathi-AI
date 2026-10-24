import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const WARDS_FILE = path.join(DATA_DIR, 'wards.json');
const DEPTS_FILE = path.join(DATA_DIR, 'departments.json');
const COMPLAINTS_FILE = path.join(DATA_DIR, 'complaints.json');

// Ensure data files exist
function readJson(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Write atomically
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

/**
 * Normalizes string for area alias matching
 */
function normalizeArea(str = '') {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FR-04: Resolves known area to mock ward.
 * Unknown areas return null/ambiguity instead of invented data.
 */
export function lookupWardDepartment(areaName = '', issueType = '') {
  const wards = readJson(WARDS_FILE);
  const departments = readJson(DEPTS_FILE);

  const cleanArea = normalizeArea(areaName);
  let matchedWard = null;

  if (cleanArea) {
    for (const ward of wards) {
      // Check ward name
      if (normalizeArea(ward.wardName).includes(cleanArea) || cleanArea.includes(normalizeArea(ward.wardName))) {
        matchedWard = ward;
        break;
      }
      // Check aliases
      if (ward.areaAliases && Array.isArray(ward.areaAliases)) {
        const foundAlias = ward.areaAliases.some(alias => {
          const normAlias = normalizeArea(alias);
          return normAlias === cleanArea || cleanArea.includes(normAlias) || normAlias.includes(cleanArea);
        });
        if (foundAlias) {
          matchedWard = ward;
          break;
        }
      }
    }
  }

  // FR-05: Deterministic local mapping from issue type to department
  let matchedDept = null;
  const cleanIssue = (issueType || '').toLowerCase().trim();

  for (const dept of departments) {
    if (dept.issueTypes && dept.issueTypes.includes(cleanIssue)) {
      matchedDept = dept;
      break;
    }
  }

  // Fallback if issue type is general
  if (!matchedDept && cleanIssue) {
    if (cleanIssue.includes('road') || cleanIssue.includes('pothole')) {
      matchedDept = departments.find(d => d.departmentId === 'DEMO-ROADS');
    } else if (cleanIssue.includes('garbage') || cleanIssue.includes('waste')) {
      matchedDept = departments.find(d => d.departmentId === 'DEMO-SWM');
    } else if (cleanIssue.includes('light') || cleanIssue.includes('electric')) {
      matchedDept = departments.find(d => d.departmentId === 'DEMO-LIGHT');
    } else if (cleanIssue.includes('water') || cleanIssue.includes('drain')) {
      matchedDept = departments.find(d => d.departmentId === 'DEMO-DRAIN');
    }
  }

  return {
    ward: matchedWard,
    department: matchedDept,
    isKnownArea: Boolean(matchedWard),
    availableWards: wards.map(w => ({ wardId: w.wardId, wardName: w.wardName, aliases: w.areaAliases })),
    availableDepartments: departments.map(d => ({ departmentId: d.departmentId, departmentName: d.departmentName, issueTypes: d.issueTypes }))
  };
}

/**
 * USP 1: Duplicate Complaint Intelligence
 * Scans unresolved complaints for identical issue type and matching area.
 */
export function detectDuplicates(issueType, areaName, excludeTicketId = null) {
  const complaints = readJson(COMPLAINTS_FILE);
  const cleanArea = normalizeArea(areaName);
  const cleanIssue = (issueType || '').toLowerCase().trim();

  const candidates = complaints.filter(ticket => {
    if (excludeTicketId && ticket.ticketId === excludeTicketId) return false;
    // Only look at unresolved complaints
    if (ticket.status === 'Resolved') return false;

    const ticketArea = normalizeArea(ticket.areaName);
    const areaMatches = ticketArea.includes(cleanArea) || cleanArea.includes(ticketArea);
    const issueMatches = ticket.issueType?.toLowerCase() === cleanIssue;

    return issueMatches && areaMatches;
  });

  return {
    hasPossibleDuplicates: candidates.length > 0,
    count: candidates.length,
    duplicates: candidates.map(c => ({
      ticketId: c.ticketId,
      issueType: c.issueType,
      areaName: c.areaName,
      status: c.status,
      createdAt: c.createdAt,
      description: c.description
    }))
  };
}

/**
 * USP 2: Explainable Civic Impact Score (0 - 100)
 */
export function calculateImpactScore({ severity = 'medium', issueType = 'pothole', duplicateCount = 0 }) {
  // 1. Severity component (0 - 40)
  let severityScore = 20;
  if (severity === 'high') severityScore = 40;
  else if (severity === 'medium') severityScore = 28;
  else if (severity === 'low') severityScore = 14;

  // 2. Safety Hazard risk component (0 - 40)
  let safetyRiskScore = 25;
  const issue = (issueType || '').toLowerCase();
  if (issue.includes('pothole') || issue.includes('waterlog')) {
    safetyRiskScore = 38; // high vehicular/pedestrian crash hazard
  } else if (issue.includes('light') || issue.includes('wire')) {
    safetyRiskScore = 32; // night crime & electrocution hazard
  } else if (issue.includes('garbage') || issue.includes('waste')) {
    safetyRiskScore = 26; // vector-borne health hazard
  }

  // 3. Citizen report density / duplicate surge (0 - 20)
  const duplicateSurgeScore = Math.min(20, duplicateCount * 10);

  const totalScore = Math.min(100, severityScore + safetyRiskScore + duplicateSurgeScore);

  return {
    totalScore,
    breakdown: {
      severityComponent: { score: severityScore, max: 40, label: `Severity rating (${severity.toUpperCase()})` },
      safetyHazardComponent: { score: safetyRiskScore, max: 40, label: 'Public Safety & Transit Risk' },
      duplicateDensityComponent: { score: duplicateSurgeScore, max: 20, label: `Citizen Density (${duplicateCount} existing reports)` }
    },
    isDemoEstimate: true,
    disclaimer: 'Calculated using CivicSathi multi-factor civic impact rubric for demo triage prioritization.'
  };
}

/**
 * FR-07 & FR-10: Persistent Ticket Creation
 */
export function createComplaintTicket(ticketPayload) {
  const complaints = readJson(COMPLAINTS_FILE);

  // Generate Collision-Safe Next Ticket ID (CIV-2026-XXXX)
  let maxNum = 0;
  for (const c of complaints) {
    const match = c.ticketId?.match(/CIV-2026-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }
  const nextNum = maxNum + 1;
  const ticketId = `CIV-2026-${String(nextNum).padStart(4, '0')}`;

  const now = new Date().toISOString();

  // Calculate Impact Score
  const duplicateCheck = detectDuplicates(ticketPayload.issueType, ticketPayload.areaName);
  const impact = calculateImpactScore({
    severity: ticketPayload.severity || 'medium',
    issueType: ticketPayload.issueType,
    duplicateCount: duplicateCheck.count
  });

  const newTicket = {
    ticketId,
    issueType: ticketPayload.issueType || 'pothole',
    categoryLabel: ticketPayload.categoryLabel || ticketPayload.issueType,
    description: ticketPayload.description || 'Civic infrastructure report filed via CivicSathi AI',
    severity: ticketPayload.severity || 'medium',
    impactScore: impact.totalScore,
    impactBreakdown: impact.breakdown,
    imagePath: ticketPayload.imagePath || '/sample-images/pothole.webp',
    areaName: ticketPayload.areaName || 'Unknown Area',
    wardId: ticketPayload.wardId || 'DEMO-WARD-01',
    wardName: ticketPayload.wardName || 'Navrangpura Ward #09',
    departmentId: ticketPayload.departmentId || 'DEMO-ROADS',
    departmentName: ticketPayload.departmentName || 'Roads & Bridges Engineering Department',
    status: 'Submitted',
    citizenContact: ticketPayload.citizenContact || 'Anonymous Citizen',
    createdAt: now,
    updatedAt: now,
    statusHistory: [
      {
        status: 'Submitted',
        timestamp: now,
        actor: 'Citizen (CivicSathi AI)',
        note: ticketPayload.submissionNote || 'Complaint verified and registered into municipal demo queue.'
      }
    ],
    agentTrace: ticketPayload.agentTrace || [
      { step: 'vision_analysis', detail: 'Analyzed photo with civil engineering vision model.', mode: ticketPayload.analysisMode || 'demo' },
      { step: 'ward_lookup', detail: `Resolved area '${ticketPayload.areaName}' to mock ward '${ticketPayload.wardName}'.`, mode: 'rule' },
      { step: 'dept_lookup', detail: `Deterministic routing to ${ticketPayload.departmentName}.`, mode: 'rule' },
      { step: 'confirmation', detail: 'Citizen reviewed and confirmed ticket details.', mode: 'user' },
      { step: 'persisted', detail: `Ticket ${ticketId} saved to complaints.json storage.`, mode: 'system' }
    ],
    analysisMode: ticketPayload.analysisMode || 'demo',
    demoOnly: true
  };

  complaints.unshift(newTicket);
  const success = writeJson(COMPLAINTS_FILE, complaints);

  if (!success) {
    throw new Error('Failed to persist complaint ticket to storage.');
  }

  return newTicket;
}

/**
 * FR-08: Status Lookup
 */
export function getComplaintStatus(ticketId) {
  const complaints = readJson(COMPLAINTS_FILE);
  const normalizedId = (ticketId || '').trim().toUpperCase();
  const found = complaints.find(c => c.ticketId?.toUpperCase() === normalizedId);
  return found || null;
}

/**
 * List all complaints (for demo/admin screen)
 */
export function getAllComplaints(filters = {}) {
  let complaints = readJson(COMPLAINTS_FILE);

  if (filters.status && filters.status !== 'all') {
    complaints = complaints.filter(c => c.status.toLowerCase() === filters.status.toLowerCase());
  }
  if (filters.wardId && filters.wardId !== 'all') {
    complaints = complaints.filter(c => c.wardId === filters.wardId);
  }
  if (filters.departmentId && filters.departmentId !== 'all') {
    complaints = complaints.filter(c => c.departmentId === filters.departmentId);
  }

  return complaints;
}

/**
 * FR-11: Admin Status Update with audit trail
 */
export function updateComplaintStatus(ticketId, newStatus, note = '', actor = 'Admin / Municipal Officer') {
  const complaints = readJson(COMPLAINTS_FILE);
  const normalizedId = (ticketId || '').trim().toUpperCase();
  const index = complaints.findIndex(c => c.ticketId?.toUpperCase() === normalizedId);

  if (index === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const current = complaints[index];

  current.status = newStatus;
  current.updatedAt = now;
  if (!current.statusHistory) current.statusHistory = [];

  current.statusHistory.push({
    status: newStatus,
    timestamp: now,
    actor: actor,
    note: note || `Status updated to ${newStatus}.`
  });

  writeJson(COMPLAINTS_FILE, complaints);
  return current;
}
