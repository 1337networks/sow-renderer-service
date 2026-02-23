/**
 * Ethos SOW Renderer - Vercel Serverless Function
 * Matches ethos_sow_template_FINAL.docx placeholders exactly
 */

const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

// Load template at cold start
let templateContent = null;
const templatePath = path.join(process.cwd(), 'templates', 'ethos_sow_template_FINAL.docx');

try {
  templateContent = fs.readFileSync(templatePath, 'binary');
  console.log('✅ Template loaded');
} catch (err) {
  console.error('❌ Template load error:', err.message);
}

function formatNumber(num) {
  if (num === null || num === undefined) return '';
  return Math.round(num).toLocaleString('en-US');
}

function numberToWords(num) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  return words[num] || num.toString();
}

/**
 * Transform SOW content to match template placeholders exactly
 * 
 * Template placeholders:
 * - Simple: CLIENT_NAME, CLIENT_SHORT, DATE, PROJECT_PURPOSE, TOTAL_HOURS, TOTAL_AMOUNT, 
 *           DISCOUNTED_TOTAL, DISCOUNT_PERCENT_WORD, DEPOSIT_AMOUNT, DEPOSIT_TERMS
 * - Loops: FUNCTIONAL_MODULES (with INCLUDED, EXCLUDED, ASSUMPTIONS), VENDORS
 * - Table fields: MODULE_NAME, NAME, PURPOSE, RATE, HOURS, AMOUNT, DISC_RATE,
 *                 MAX_COUNT, IMPORT_METHOD, EXTRACTION, IMPORT, WEEK_OF, STAGE
 */
function transformContent(content) {
  const c = content || {};
  const fees = c.fees || {};
  
  const data = {
    // Cover & Header
    CLIENT_NAME: c.cover?.clientName || 'Client Name',
    CLIENT_SHORT: c.cover?.clientName?.split(' ')[0] || 'Client',
    DATE: c.cover?.date || '',
    SOW_NUMBER: c.cover?.sowNumber || 'SOWXXXXX',
    
    // Project
    PROJECT_PURPOSE: c.projectPurpose || 'The Client has partnered with Ethos to design, configure/develop, and integrate the NetSuite platform into their business environment. The goal of this project is to optimize and standardize the Client\'s business processes via utilization of the NetSuite platform that is designed to promote industry leading practices.',
    
    // Fees Summary
    TOTAL_HOURS: formatNumber(fees.totalHours),
    TOTAL_AMOUNT: formatNumber(fees.totalAmount),
    DISCOUNTED_TOTAL: formatNumber(fees.discountedTotal),
    DISCOUNT_PERCENT_WORD: numberToWords(fees.discountPercent || 10),
    DEPOSIT_AMOUNT: formatNumber(fees.depositAmount),
    DEPOSIT_TERMS: fees.depositTerms || 'Each month, 25% of the deposit will be applied to invoices sent to the client until the deposit has been fully applied.',
    
    // Timeline (if static fields exist)
    START_DATE: c.timeline?.startDate || '',
    GO_LIVE_DATE: c.timeline?.targetGoLive || '',
    COMPLETION_DATE: c.timeline?.completionDate || '',
  };
  
  // Functional Modules Loop
  data.FUNCTIONAL_MODULES = (c.functionalScope || []).map(module => ({
    MODULE_NAME: module.name || '',
    INCLUDED: (module.includedActivities || []).map(item => ({ '.': item })),
    EXCLUDED: (module.excludedActivities || []).map(item => ({ '.': item })),
    ASSUMPTIONS: (module.assumptions || []).map(item => ({ '.': item })),
  }));
  
  // Vendors Loop
  data.VENDORS = (c.thirdParty?.vendors || []).map(v => ({
    NAME: v.name || '',
    PURPOSE: v.purpose || '',
  }));
  
  // Data Migration - Master Data
  data.MASTER_DATA = (c.dataMigration?.masterData || []).map(row => ({
    OBJECT: row.object || '',
    MAX_COUNT: row.maxCount || 'n/a',
    IMPORT_METHOD: row.importMethod || 'CSV',
    EXTRACTION: row.extractionResponsibility || 'Client',
    IMPORT: row.importResponsibility || 'Ethos',
    COMMENTS: row.comments || '',
  }));
  
  // Data Migration - Transactional Data
  data.TRANS_DATA = (c.dataMigration?.transactionalData || []).map(row => ({
    OBJECT: row.object || '',
    MAX_COUNT: row.maxCount || '',
    IMPORT_METHOD: row.importMethod || 'CSV',
    EXTRACTION: row.extractionResponsibility || 'Client',
    IMPORT: row.importResponsibility || 'Ethos',
    COMMENTS: row.comments || '',
  }));
  
  // Timeline Loop
  data.TIMELINE = (c.timeline?.weeks || []).map(w => ({
    WEEK: w.week?.toString() || '',
    WEEK_OF: w.date || '',
    STAGE: w.stage || '',
    ACTIVITIES: w.activities || '',
  }));
  
  // Staffing / Rate Card Loop
  data.STAFFING = (c.fees?.staffing || []).map(s => ({
    CATEGORY: s.category || '',
    RATE: s.rate?.toFixed(2) || '0.00',
    HOURS: formatNumber(s.hours),
    AMOUNT: formatNumber(s.amount),
    DISC_RATE: s.discountedRate?.toFixed(2) || '0.00',
    DISC_AMOUNT: formatNumber(s.discountedAmount),
  }));
  
  return data;
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      templateLoaded: !!templateContent,
      version: '2.0.0',
    });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    if (!templateContent) {
      return res.status(500).json({ 
        error: 'Template not loaded',
        hint: 'Ensure ethos_sow_template_FINAL.docx is in /templates folder'
      });
    }
    
    const { content } = req.body || {};
    if (!content) {
      return res.status(400).json({ error: 'content is required in request body' });
    }
    
    // Transform content to template placeholders
    const data = transformContent(content);
    
    // Load and render template
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '', // Return empty string for undefined values
    });
    
    doc.render(data);
    
    // Generate output buffer
    const buf = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    
    // Convert to base64 for JSON response
    const base64 = buf.toString('base64');
    
    // Generate filename
    const clientName = (content.cover?.clientName || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    const sowNumber = content.cover?.sowNumber || 'DRAFT';
    const filename = `Ethos_SOW_${sowNumber}_${clientName}.docx`;
    
    return res.status(200).json({
      success: true,
      filename,
      base64,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    
  } catch (error) {
    console.error('Render error:', error);
    
    // Docxtemplater provides detailed error info
    if (error.properties && error.properties.errors) {
      const details = error.properties.errors.map(e => ({
        message: e.message,
        name: e.name,
        properties: e.properties,
      }));
      return res.status(500).json({ 
        error: 'Template rendering failed',
        details 
      });
    }
    
    return res.status(500).json({ error: error.message });
  }
};
