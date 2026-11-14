# Audit worker for the CRM. Runs anywhere with outbound internet (Railway, Fly.io, a VPS, your PC).
# Uses the official Playwright image so Chromium and its system libraries are already present.
FROM mcr.microsoft.com/playwright/python:v1.52.0-noble
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY crm_worker ./crm_worker
ENV PYTHONUNBUFFERED=1 AUDIT_USE_PLAYWRIGHT=1
USER pwuser
CMD ["python", "-m", "crm_worker"]
