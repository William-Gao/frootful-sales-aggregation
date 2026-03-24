FROM python:3.11-slim

# System deps for Playwright/Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright + Chromium
RUN pip install --no-cache-dir playwright && playwright install --with-deps chromium

# Install uv
RUN pip install --no-cache-dir uv

# Copy application code
COPY . /app
WORKDIR /app

# Reference data (empaques, farms, picklists, varieties, etc.)
# Lives in browser-agent/data/ (gitignored). MCP server reads from here by default.

# Ensure working directories exist
RUN mkdir -p tmp orders/instructions logs

# Install Python dependencies
RUN uv sync --frozen

# Cloud Run uses PORT env var (default 8080)
ENV PORT=8080

CMD ["uv", "run", "uvicorn", "orchestrator:app", "--host", "0.0.0.0", "--port", "8080"]
