## Summary

-

## Verification

- [ ] `docker compose up -d --build`
- [ ] `docker compose exec -T backend alembic upgrade head`
- [ ] `docker compose exec -T backend pytest -q`
- [ ] `./scripts/beta_smoke.sh`
- [ ] Mobile lint, if mobile changed

## Notes

Risks, follow-ups, or intentionally deferred work:
