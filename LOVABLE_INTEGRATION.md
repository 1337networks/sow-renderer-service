# Lovable Integration Guide

## Step 1: Deploy to Vercel

### Quick Deploy

1. **Push to GitHub:**
   ```bash
   cd sow-renderer-service
   git init
   git add .
   git commit -m "Ethos SOW Renderer"
   gh repo create ethos-sow-renderer --private --source=. --push
   ```

2. **Deploy to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repo
   - Click "Deploy"

3. **Get your URL:**
   Your endpoint will be: `https://ethos-sow-renderer.vercel.app/api/render`

---

## Step 2: Update Lovable Frontend

Add this function to your Lovable app to download rendered SOWs:

### In your SOW component (e.g., `SOWReview.tsx`):

```typescript
const RENDERER_URL = 'https://your-project.vercel.app/api/render';

const downloadSOW = async (sowContent: SOWContent) => {
  try {
    setIsDownloading(true);
    
    const response = await fetch(RENDERER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: sowContent }),
    });
    
    if (!response.ok) {
      throw new Error('Render failed');
    }
    
    const { base64, filename } = await response.json();
    
    // Create download link
    const link = document.createElement('a');
    link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('SOW downloaded!');
    
  } catch (error) {
    console.error('Download error:', error);
    toast.error('Failed to download SOW');
  } finally {
    setIsDownloading(false);
  }
};
```

### Add Download Button:

```tsx
<Button 
  onClick={() => downloadSOW(generatedSOW)}
  disabled={isDownloading}
  className="bg-gradient-to-r from-cyan-500 to-blue-600"
>
  {isDownloading ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Generating...
    </>
  ) : (
    <>
      <Download className="mr-2 h-4 w-4" />
      Download Word Document
    </>
  )}
</Button>
```

---

## Step 3: Environment Variable (Optional)

Instead of hardcoding the URL, add to Lovable's environment:

```
VITE_SOW_RENDERER_URL=https://your-project.vercel.app/api/render
```

Then use:
```typescript
const RENDERER_URL = import.meta.env.VITE_SOW_RENDERER_URL;
```

---

## Full Lovable Prompt Addition

Add this to your Lovable project to implement the download feature:

```
Add a "Download Word Document" button to the SOW Review page that:

1. Calls an external API endpoint to render the SOW to DOCX format
2. The endpoint URL should be stored in VITE_SOW_RENDERER_URL environment variable
3. POST the generated SOW content (from generate-sow response) to this endpoint
4. The API returns { success: true, filename: "...", base64: "...", mimeType: "..." }
5. Create a download link from the base64 data and trigger download
6. Show loading state while generating
7. Handle errors with toast notifications

The button should have Ethos brand styling (cyan-to-blue gradient) and include a download icon.
```

---

## Testing

Test the endpoint with curl:

```bash
curl -X POST https://your-project.vercel.app/api/render \
  -H "Content-Type: application/json" \
  -d '{
    "content": {
      "cover": {
        "clientName": "Test Corp",
        "date": "February 23rd, 2026",
        "sowNumber": "SOW99999"
      },
      "fees": {
        "totalHours": 2996,
        "totalAmount": 579020,
        "discountedTotal": 521118,
        "depositAmount": 52111.80,
        "discountPercent": 10,
        "staffing": [
          {"category": "Director", "hours": 124, "amount": 34100, "discountedAmount": 30690},
          {"category": "Senior Manager", "hours": 256, "amount": 57600, "discountedAmount": 51840}
        ]
      }
    }
  }'
```

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Lovable App    │────▶│  generate-sow    │────▶│  SOW Content    │
│  (Frontend)     │     │  (Edge Function) │     │  (JSON)         │
└────────┬────────┘     └──────────────────┘     └────────┬────────┘
         │                                                 │
         │  Download Button Click                          │
         ▼                                                 ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Vercel         │────▶│  docxtemplater   │────▶│  Pixel-Perfect  │
│  /api/render    │     │  + Template      │     │  DOCX           │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```
