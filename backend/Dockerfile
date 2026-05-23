FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install system dependencies (needed for psycopg2 and other libs)
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m pip install --no-cache-dir --upgrade "pip>=26.1" "wheel>=0.46.2" \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY . .

# Production entrypoint
CMD ["gunicorn", "-c", "gunicorn_conf.py", "app.main:app"]
