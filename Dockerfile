FROM python:3.12-slim

# Hugging Face Spaces rulează containerul ca user 1000
RUN useradd -m -u 1000 user

WORKDIR /app

# Instalează dependențele întâi (cache de layer mai eficient)
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiază restul aplicației
COPY --chown=user . /app

USER user

# HF Spaces expune portul 7860; cache-ul SQLite e efemer (writable)
ENV CACHE_DB=/tmp/cache.db \
    PORT=7860 \
    PYTHONUNBUFFERED=1

EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
