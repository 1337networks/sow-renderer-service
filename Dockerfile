FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY index.js ./

# Create templates directory
RUN mkdir -p templates

# Copy template if available (can be mounted at runtime)
COPY templates/ templates/

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production
ENV PORT=3001
ENV TEMPLATE_PATH=/app/templates/ethos_sow_template_with_placeholders.docx

# Start server
CMD ["node", "index.js"]
