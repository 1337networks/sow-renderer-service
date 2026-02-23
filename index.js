/**
 * Ethos SOW Renderer Service
 * 
 * Pixel-perfect SOW generation using docxtemplater.
 * Uses the actual Ethos DOCX template with placeholders.
 */

const express = require('express');
const cors = require('cors');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Load template on startup
const TEMPLATE_PATH = process.env.TEMPLATE_PATH || './templates/ethos_sow_template_with_placeholders.docx';
let templateContent = null;

try {
  templateContent = fs.readFileSync(TEMPLATE_PATH, 'binary');
  console.log(`✅ Template loaded: ${TEMPLATE_PATH}`);
} catch (err) {
  console.error(`❌ Failed to load template: ${err.message}`);
  console.log('   Place your template at:', path.resolve(TEMPLATE_PATH));
}

/**
 * Format number with commas
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '';
  return num.toLocaleString('en-US');
}

/**
 * Format currency (no $ sign, just formatted number)
 */
function formatCurrency(num) {
  if (num === null || num === undefined) return '';
  return formatNumber(Math.round(num));
}

/**
 * Format date with ordinal suffix
 * Input: ISO string or Date object
 * Output: "February 23rd, 2026"
 */
function formatDate(dateInput) {
  if (!dateInput) return '';
  
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return dateInput; // Return as-is if invalid
  
  const months = ["January", "February", "March", "April", "May", "June", 
                  "July", "August", "September", "October", "November", "December"];
  const day = date.getDate();
  const suffix = [11, 12, 13].includes(day % 100) ? "th" 
    : day % 10 === 1 ? "st" 
    : day % 10 === 2 ? "nd" 
    : day % 10 === 3 ? "rd" : "th";
  
  return `${months[date.getMonth()]} ${day}${suffix}, ${date.getFullYear()}`;
}

/**
 * Transform SOW content from generate-sow format to template placeholders
 */
function transformContent(content) {
  const c = content;
  
  // Basic fields
  const data = {
    CLIENT_NAME: c.cover?.clientName || 'Client Name',
    CLIENT_SHORT: c.signature?.clientName?.split(' ')[0] || c.cover?.clientName?.split(' ')[0] || 'Client',
    DATE: c.cover?.date || formatDate(new Date()),
    SOW_NUMBER: c.cover?.sowNumber || 'SOWXXXXX',
    
    // Project
    PROJECT_PURPOSE: c.projectPurpose || 'The Client has partnered with Ethos to design, configure/develop, and integrate the NetSuite platform into their business environment.',
    PROJECT_GOAL: c.projectPurpose?.includes('goal of this project is to') 
      ? c.projectPurpose.split('goal of this project is to ')[1]?.split('.')[0] 
      : 'optimize and standardize the Client\'s business processes via utilization of the NetSuite platform',
    
    // Timeline
    START_DATE: c.timeline?.startDate || 'TBD',
    GO_LIVE_DATE: c.timeline?.targetGoLive || 'TBD',
    COMPLETION_DATE: c.timeline?.completionDate || 'TBD',
    TIMELINE_WEEKS_COUNT: c.timeline?.totalWeeks || 24,
    
    // Fees
    TOTAL_HOURS: formatNumber(c.fees?.totalHours),
    TOTAL_AMOUNT: formatCurrency(c.fees?.totalAmount),
    DISCOUNT_PERCENT: c.fees?.discountPercent || 10,
    DISCOUNTED_TOTAL: formatCurrency(c.fees?.discountedTotal),
    DEPOSIT_PERCENT: c.fees?.depositPercent || 10,
    DEPOSIT_AMOUNT: formatCurrency(c.fees?.depositAmount),
    DEPOSIT_TERMS: c.fees?.depositTerms || 'Each month, 25% of the deposit will be applied to invoices sent to the client until the deposit has been fully applied.',
    BILLING_TERMS: c.fees?.billingTerms || 'Ethos will invoice the client on the first (1st) calendar day of each month in arrears and such invoices shall be due and payable within fifteen (15) days of the Client\'s receipt of the invoice.',
    
    // Signatures
    CLIENT_SIGNATORY: c.signature?.clientSignatory || '',
    ETHOS_SIGNATORY: c.signature?.ethosSignatory || 'Cedric Carter',
    
    // Delivery mode
    REMOTE_ONLY: c.delivery?.mode === 'remote',
    INCLUDE_ONSITE: c.delivery?.mode === 'onsite' || c.delivery?.mode === 'hybrid',
    
    // Third party
    HAS_VENDORS: (c.thirdParty?.vendors?.length || 0) > 0,
    THIRD_PARTY_INTRO: c.thirdParty?.intro || '"Third-Party" refers to any entity that has contracted with the Client and is providing an integral service for the successful implementation of NetSuite.',
  };
  
  // Functional modules (loop)
  data.FUNCTIONAL_MODULES = (c.functionalScope || []).map(module => ({
    MODULE_NAME: module.name,
    INCLUDED_ACTIVITIES: module.includedActivities || [],
    EXCLUDED_ACTIVITIES: module.excludedActivities || [],
    ASSUMPTIONS: module.assumptions || [],
  }));
  
  // Data migration tables (loops)
  data.MASTER_DATA = (c.dataMigration?.masterData || []).map(row => ({
    OBJECT: row.object || '',
    MAX_COUNT: row.maxCount || 'n/a',
    IMPORT_METHOD: row.importMethod || 'CSV',
    EXTRACTION: row.extractionResponsibility || 'Client',
    IMPORT: row.importResponsibility || 'Ethos',
    COMMENTS: row.comments || '',
  }));
  
  data.TRANSACTIONAL_DATA = (c.dataMigration?.transactionalData || []).map(row => ({
    OBJECT: row.object || '',
    MAX_COUNT: row.maxCount || '',
    IMPORT_METHOD: row.importMethod || 'CSV',
    EXTRACTION: row.extractionResponsibility || 'Client',
    IMPORT: row.importResponsibility || 'Ethos',
    COMMENTS: row.comments || '',
  }));
  
  // Vendors (loop)
  data.VENDORS = (c.thirdParty?.vendors || []).map(v => ({
    NAME: v.name,
    PURPOSE: v.purpose,
  }));
  
  // Timeline weeks (loop)
  data.TIMELINE_WEEKS = (c.timeline?.weeks || []).map(w => ({
    WEEK: w.week?.toString() || '',
    WEEK_OF: w.date || '',
    STAGE: w.stage || '',
    ACTIVITIES: w.activities || '',
    IS_ONSITE: w.isOnsite || false,
  }));
  
  // Staffing / rate card (loop)
  data.STAFFING = (c.fees?.staffing || []).map(s => ({
    CATEGORY: s.category,
    RATE: s.rate?.toFixed(2) || '0.00',
    HOURS: formatNumber(s.hours),
    AMOUNT: formatCurrency(s.amount),
    DISCOUNTED_RATE: s.discountedRate?.toFixed(2) || '0.00',
    DISCOUNTED_AMOUNT: formatCurrency(s.discountedAmount),
  }));
  
  return data;
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    templateLoaded: !!templateContent,
    version: '1.0.0',
  });
});

/**
 * Render SOW endpoint
 * 
 * POST /render
 * Body: { content: <SOW content from generate-sow> }
 * Returns: { success: true, filename: "...", base64: "...", mimeType: "..." }
 */
app.post('/render', async (req, res) => {
  try {
    if (!templateContent) {
      return res.status(500).json({ 
        error: 'Template not loaded. Please configure TEMPLATE_PATH.',
      });
    }
    
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }
    
    // Transform content to template placeholders
    const data = transformContent(content);
    
    // Load template
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '', // Return empty string for undefined values
    });
    
    // Render with data
    doc.render(data);
    
    // Generate output
    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    
    // Convert to base64
    const base64 = buf.toString('base64');
    
    // Generate filename
    const clientName = (content.cover?.clientName || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    const sowNumber = content.cover?.sowNumber || 'DRAFT';
    const filename = `Ethos_SOW_${sowNumber}_${clientName}.docx`;
    
    res.json({
      success: true,
      filename,
      base64,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    
  } catch (error) {
    console.error('Render error:', error);
    
    // Docxtemplater provides detailed error info
    if (error.properties && error.properties.errors) {
      const errors = error.properties.errors.map(e => ({
        message: e.message,
        name: e.name,
        properties: e.properties,
      }));
      return res.status(500).json({ error: 'Template rendering failed', details: errors });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * Download rendered SOW (for testing)
 * 
 * POST /download
 * Returns: DOCX file directly
 */
app.post('/download', async (req, res) => {
  try {
    if (!templateContent) {
      return res.status(500).json({ error: 'Template not loaded' });
    }
    
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }
    
    const data = transformContent(content);
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });
    
    doc.render(data);
    
    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    
    const clientName = (content.cover?.clientName || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    const sowNumber = content.cover?.sowNumber || 'DRAFT';
    const filename = `Ethos_SOW_${sowNumber}_${clientName}.docx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Ethos SOW Renderer running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Render: POST http://localhost:${PORT}/render`);
});
