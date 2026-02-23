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

/**
 * Fix Word's habit of splitting placeholder tags across XML runs
 * e.g., <w:t>{{CLIE</w:t></w:r><w:r><w:t>NT_NAME}}</w:t> -> <w:t>{{CLIENT_NAME}}</w:t>
 */
function fixSplitTags(zip) {
  const xmlFiles = ['word/document.xml', 'word/header1.xml', 'word/header2.xml', 'word/footer1.xml', 'word/footer2.xml'];
  
  for (const filename of xmlFiles) {
    try {
      let content = zip.file(filename)?.asText();
      if (!content) continue;
      
      // Pattern: find text runs and merge consecutive ones that contain partial placeholders
      // This regex finds <w:t> tags and their content
      let modified = true;
      let iterations = 0;
      const maxIterations = 50; // Safety limit
      
      while (modified && iterations < maxIterations) {
        modified = false;
        iterations++;
        
        // Find cases where {{ or }} or {# or {/ are split across runs
        // Match: </w:t></w:r><w:r><w:t> or </w:t></w:r><w:r ...><w:t> patterns
        const splitPattern = /<\/w:t>(<\/w:r>)(<w:r[^>]*>)(<w:rPr>.*?<\/w:rPr>)?(<w:t[^>]*>)/gs;
        
        // Check if we have any partial placeholder tags that span runs
        const partialOpenPattern = /\{\{[^}]*<\/w:t>/;
        const partialClosePattern = /<w:t[^>]*>[^{]*\}\}/;
        const partialLoopOpenPattern = /\{[#/][^}]*<\/w:t>/;
        
        if (partialOpenPattern.test(content) || partialLoopOpenPattern.test(content)) {
          // Merge adjacent text runs
          const newContent = content.replace(splitPattern, (match, closeR, openR, rPr, openT) => {
            modified = true;
            return ''; // Remove the run boundary, merging text content
          });
          
          if (newContent !== content) {
            content = newContent;
          } else {
            modified = false;
          }
        }
      }
      
      // Alternative approach: Use a more aggressive merge for placeholder patterns
      // Find all {{ ... }} patterns that might be split and reconstruct them
      content = mergeTemplateTags(content);
      
      zip.file(filename, content);
    } catch (e) {
      // File might not exist, skip
    }
  }
  
  return zip;
}

/**
 * More aggressive tag merging - extracts all text, finds placeholders, rebuilds
 */
function mergeTemplateTags(xml) {
  // Find sequences of <w:t> tags within the same paragraph that form a placeholder
  // This handles the case where Word splits {{CLIENT_NAME}} into multiple runs
  
  // Pattern to match a paragraph or run containing partial placeholder syntax
  const runPattern = /(<w:r[^>]*>)(.*?)(<\/w:r>)/gs;
  
  // First pass: identify paragraphs with split placeholders
  const paragraphPattern = /(<w:p[^>]*>)(.*?)(<\/w:p>)/gs;
  
  return xml.replace(paragraphPattern, (match, pOpen, pContent, pClose) => {
    // Extract all text content from this paragraph
    const textParts = [];
    const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let textMatch;
    
    while ((textMatch = textPattern.exec(pContent)) !== null) {
      textParts.push(textMatch[1]);
    }
    
    const fullText = textParts.join('');
    
    // Check if this paragraph has placeholder patterns
    if (!/\{\{|\}\}|\{#|\{\//.test(fullText)) {
      return match; // No placeholders, return unchanged
    }
    
    // Check if placeholders are complete (not split)
    const hasOpenBrace = fullText.includes('{{') || fullText.includes('{#') || fullText.includes('{/');
    const hasCloseBrace = fullText.includes('}}');
    
    if (!hasOpenBrace || !hasCloseBrace) {
      return match; // Incomplete, might span paragraphs - leave alone
    }
    
    // Rebuild paragraph with merged text runs for placeholders
    // This is a simplified approach - merge all <w:t> content into fewer runs
    let newContent = pContent;
    
    // Remove formatting splits within placeholder patterns
    // Match: }}anything{{ and merge the runs between
    const mergePattern = /(<w:t[^>]*>)([^<]*\{\{[A-Z_#/.]+)(<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>.*?<\/w:rPr>)?<w:t[^>]*>)([^<]*\}\})/g;
    
    newContent = newContent.replace(mergePattern, '$1$2$4');
    
    // More aggressive: merge any adjacent runs where one ends mid-placeholder
    // Pattern: ends with {{ or {# or {/ but no }}
    let prevContent = '';
    while (newContent !== prevContent) {
      prevContent = newContent;
      
      // Merge runs where text ends with partial opening tag
      newContent = newContent.replace(
        /(<w:t[^>]*>)([^<]*(?:\{\{|\{#|\{\/)[A-Z_]*?)(<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>.*?<\/w:rPr>)?<w:t[^>]*>)([A-Z_]*\}\}[^<]*)/gi,
        '$1$2$4'
      );
      
      // Merge runs where text is middle of placeholder (only uppercase, underscore, dot)
      newContent = newContent.replace(
        /(<w:t[^>]*>)([^<]*(?:\{\{|\{#|\{\/)[A-Z_.]*?)(<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>.*?<\/w:rPr>)?<w:t[^>]*>)([A-Z_.]*[^<]*)/gi,
        '$1$2$4'
      );
    }
    
    return pOpen + newContent + pClose;
  });
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
    
    // Load template and fix split placeholder tags
    let zip = new PizZip(templateContent);
    zip = fixSplitTags(zip);
    
    // Render with docxtemplater
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '', // Return empty string for undefined values
      delimiters: { start: '{{', end: '}}' },
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
