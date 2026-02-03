# MeetUp Backend

Real-time location sharing system with privacy-first principles.

## Quickstart

### Prerequisites
- Docker & Docker Compose
- Python 3.11+ (for local logic dev)

### Running the Stack

1. **Start Infrastructure**:
   ```bash
   docker-compose up -d --build
   ```

2. **Run Migrations** (After DB is up):
   ```bash
   docker-compose exec backend alembic revision --autogenerate -m "Initial tables"
   docker-compose exec backend alembic upgrade head
   ```

3. **API Documentation**:
   Access the interactive API docs at `http://localhost:8000/docs`.

## Architecture
- **API**: FastAPI (Auth, User Management, Session Logic)
- **DB**: PostgreSQL + PostGIS (Geospatial data, Relations)
- **Cache/PubSub**: Redis (Realtime state, WS fanout)

## Development

### Running Tests
```bash
# Install dependencies locally
pip install -r backend/requirements.txt
# Run tests
pytest
```
