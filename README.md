# Ethos SOW Renderer Service

Pixel-perfect SOW document generation using your actual DOCX template.

## How It Works

1. Your branded DOCX template (with placeholders like `{{CLIENT_NAME}}`) is loaded at startup
2. The service receives SOW content from the `generate-sow` Edge Function
3. Docxtemplater fills in the placeholders while preserving **all** formatting
4. Returns the rendered DOCX with logo, styling, and graphics intact

## Setup

### 1. Prepare Your Template

Open your template in Word and add placeholders (see `PLACEHOLDER_GUIDE.md`):

- Replace "Robbins Bros. Jewelry, Inc." with `{{CLIENT_NAME}}`
- Replace "April 2nd, 2024" with `{{DATE}}`
- etc.

Save as `ethos_sow_template_with_placeholders.docx`

### 2. Install & Run Locally

```bash
cd sow-renderer-service
npm install

# Place your template
mkdir -p templates
cp /path/to/ethos_sow_template_with_placeholders.docx templates/

# Run
npm start
```

### 3. Test

```bash
curl -X POST http://localhost:3001/render \
  -H "Content-Type: application/json" \
  -d '{"content": {"cover": {"clientName": "Test Corp", "date": "February 23rd, 2026", "sowNumber": "SOW99999"}}}' \
  | jq -r '.base64' | base64 -d > test.docx
```

## Deployment Options

### Option A: Railway (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Set environment variable:
- `TEMPLATE_PATH`: `/app/templates/ethos_sow_template_with_placeholders.docx`

### Option B: Vercel

Create `vercel.json`:
```json
{
  "version": 2,
  "builds": [{ "src": "index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "index.js" }]
}
```

```bash
vercel deploy
```

### Option C: Docker

```bash
docker build -t ethos-sow-renderer .
docker run -p 3001:3001 -v /path/to/template:/app/templates ethos-sow-renderer
```

### Option D: VPS (PM2)

```bash
# On your server
git clone <repo>
cd sow-renderer-service
npm install
pm2 start index.js --name ethos-sow-renderer
```

## API Reference

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "templateLoaded": true,
  "version": "1.0.0"
}
```

### `POST /render`

Render SOW content to DOCX.

**Request:**
```json
{
  "content": {
    "cover": {
      "clientName": "Acme Corp",
      "date": "February 23rd, 2026",
      "sowNumber": "SOW71157"
    },
    "projectPurpose": "...",
    "functionalScope": [...],
    "fees": {...},
    // ... full SOW content from generate-sow
  }
}
```

**Response:**
```json
{
  "success": true,
  "filename": "Ethos_SOW_SOW71157_Acme_Corp.docx",
  "base64": "UEsDBBQAAAAIAP...",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
}
```

### `POST /download`

Same as `/render` but returns the DOCX file directly (for testing).

## Integration with Lovable

Update your frontend to call this service instead of the Edge Function for DOCX rendering:

```typescript
const renderSOW = async (content: SOWContent) => {
  const response = await fetch('https://your-renderer.railway.app/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  
  const { base64, filename } = await response.json();
  
  // Download the file
  const link = document.createElement('a');
  link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`;
  link.download = filename;
  link.click();
};
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `TEMPLATE_PATH` | `./templates/ethos_sow_template_with_placeholders.docx` | Path to DOCX template |

## Troubleshooting

### "Template not loaded"

Ensure your template file exists at the path specified by `TEMPLATE_PATH`.

### Placeholder not replaced

- Check placeholder syntax: `{{PLACEHOLDER_NAME}}` (double curly braces)
- Ensure no hidden formatting in Word (try typing placeholder fresh)
- Check console for docxtemplater error details

### Loop not working

- Use `{#LOOP_NAME}...{/LOOP_NAME}` syntax
- Ensure the data array exists and has items
