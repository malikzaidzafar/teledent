FROM python:3.11-slim

# System deps — compatible with Debian Trixie (python:3.11-slim base):
#   - libgl1-mesa-glx was renamed to libgl1 in Trixie
#   - libgdk-pixbuf2.0-0 was renamed to libgdk-pixbuf-xlib-2.0-0 in Trixie
#   - WeasyPrint needs: libpango, libcairo, libgdk-pixbuf, libffi, shared-mime-info
#   - OpenCV (headless) needs: libgl1, libglib2.0-0
#   - psycopg2 needs: libpq-dev, gcc
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-xlib-2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# HF Spaces runs as port 7860 by default
EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
