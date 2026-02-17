# Deployment Checklist

This checklist ensures your SatsBlox backend is ready for production deployment.

## Pre-Deployment (Before First Deploy)

### Security Configuration

- [ ] **Generate strong JWT_SECRET**
  ```bash
  # Generate a strong random secret
  openssl rand -base64 32
  
  # Example output (use your own):
  # abc123def456ghi789jkl012mno345pqr678stu
  ```
  - [ ] Remove `JWT_SECRET=change_this...` from code
  - [ ] Use secrets manager (AWS Secrets, Vault, etc.)
  - [ ] Store securely (never in .env file in production)

- [ ] **Configure HTTPS/TLS**
  - [ ] Obtain SSL certificate (free via Let's Encrypt)
  - [ ] Configure HTTPS on load balancer or reverse proxy (nginx)
  - [ ] Force HTTP → HTTPS redirect
  - [ ] Test with SSL Labs: https://www.ssllabs.com/ssltest/

- [ ] **Database Security**
  - [ ] Use managed database service (AWS RDS, Google Cloud SQL, Azure)
  - [ ] Strong password for database user (30+ characters)
  - [ ] Restrict database access to application servers only (firewall rules)
  - [ ] Enable database encryption at rest
  - [ ] Enable database encryption in transit (SSL)
  - [ ] Set up automated backups (daily minimum)
  - [ ] Test backup restoration process

- [ ] **Environment Variables**
  - [ ] Set `NODE_ENV=production`
  - [ ] Set appropriate `LOG_LEVEL` (info or warn, not debug)
  - [ ] Verify `DATABASE_URL` points to production database
  - [ ] Verify `PORT` matches load balancer/reverse proxy
  - [ ] All required variables set and validated

### Code Quality

- [ ] **Test endpoints locally**
  ```bash
  npm run dev
  
  # Test registration
  curl -X POST http://localhost:3000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{...}'
  
  # Test login
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{...}'
  ```

- [ ] **No hardcoded secrets in code**
  - [ ] Search codebase: `grep -r "SECRET\|PASSWORD\|API_KEY" src/`
  - [ ] All secrets from environment variables

- [ ] **No sensitive data in logs**
  - [ ] Search for: `console.log(password)`, `console.log(token)`, etc.
  - [ ] Review error messages (don't expose internal details)

- [ ] **Dependencies updated**
  ```bash
  npm audit
  npm audit fix
  npm update
  ```

- [ ] **No development dependencies in production**
  - [ ] Verify `devDependencies` not included in production build
  - [ ] `nodemon` should not be running in production

### Performance

- [ ] **Database connection pooling configured**
  - [ ] Prisma connection limits set appropriately
  - [ ] Connection pool size: (CPU cores × 2) + idle connections
  - [ ] Connection timeout: reasonable (30-60 seconds)

- [ ] **Load balancer configured**
  - [ ] Multiple instances behind load balancer (redundancy)
  - [ ] Health check endpoint: `GET /` should return 200
  - [ ] Session handling (sticky sessions if needed)
  - [ ] Connection timeout: 60 seconds

- [ ] **Caching considered** (future)
  - [ ] Redis for token blacklist?
  - [ ] CloudFront/CDN for static files?

### Monitoring & Logging

- [ ] **Logging set up**
  - [ ] Logs sent to centralized service (Sentry, DataDog, ELK, Stackdriver)
  - [ ] Log retention: 30+ days minimum
  - [ ] Alerts configured for error rates

- [ ] **Error tracking configured**
  - [ ] Sentry or similar for exception tracking
  - [ ] Alerts for spike in errors
  - [ ] Daily error reports

- [ ] **Performance monitoring**
  - [ ] Track response times (p50, p95, p99)
  - [ ] Monitor CPU/memory usage
  - [ ] Database query performance
  - [ ] Alerts for slowdowns

### Infrastructure

- [ ] **Load balancer set up**
  - [ ] AWS ALB/NLB, Google Load Balancer, nginx, etc.
  - [ ] SSL termination configured
  - [ ] Health checks enabled

- [ ] **Auto-scaling configured**
  - [ ] Minimum instances: 2 (for redundancy)
  - [ ] Maximum instances: reasonable based on cost
  - [ ] Scale-up trigger: CPU > 70%, Requests/s high
  - [ ] Scale-down trigger: after sustained low load

- [ ] **Database failover configured**
  - [ ] Multi-AZ deployment (AWS RDS, Google Cloud SQL)
  - [ ] Automated failover enabled
  - [ ] Recovery time objective (RTO) acceptable

- [ ] **DNS configured**
  - [ ] API domain pointing to load balancer
  - [ ] DNS TTL: 1 hour (balance between caching and failover speed)
  - [ ] SSL certificate covers the domain

## Deployment Day

### Pre-Deployment

- [ ] **Take database backup**
  ```bash
  # AWS RDS
  aws rds create-db-snapshot --db-instance-identifier satsblox-prod \
    --db-snapshot-identifier satsblox-backup-$(date +%Y%m%d)
  ```

- [ ] **Notify stakeholders**
  - [ ] Send message to team: "Deploying at [TIME]"
  - [ ] Estimated downtime: ~5 minutes
  - [ ] Rollback plan available

- [ ] **Final code review**
  - [ ] All merge requests reviewed and merged
  - [ ] Build passed (CI/CD pipeline)
  - [ ] No uncommitted changes

### Deployment

- [ ] **Deploy new version**
  - [ ] Tag release: `git tag -a v1.0.0 -m "Production release"`
  - [ ] Build Docker image: `docker build -t satsblox-api:1.0.0 .`
  - [ ] Push to registry: `docker push satsblox-api:1.0.0`
  - [ ] Update deployment configuration with new image tag
  - [ ] Apply changes: `kubectl apply -f deployment.yaml`

- [ ] **Run database migrations** (if needed)
  ```bash
  # After deploying, run migrations
  npx prisma migrate deploy
  
  # Or if using Docker:
  docker-compose exec api npx prisma migrate deploy
  ```

- [ ] **Verify deployment**
  - [ ] Health check passes
  - [ ] Application logs show no errors
  - [ ] Database connection successful
  - [ ] Swagger UI accessible at `/api-docs`

### Post-Deployment Testing

- [ ] **Smoke tests** (test critical paths)
  ```bash
  # Register a test account
  curl -X POST https://api.satsblox.com/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{
      "fullName": "Integration Test",
      "email": "test+'$(date +%s)'@example.com",
      "password": "TestPassword123!",
      "phoneNumber": "+254700000000"
    }'
  
  # Verify response code is 201
  # Verify tokens are returned
  ```

- [ ] **Login flow test**
  ```bash
  # Use the email from registration above
  curl -X POST https://api.satsblox.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "TestPassword123!"
    }'
  
  # Verify response code is 200
  ```

- [ ] **Token refresh test**
  ```bash
  curl -X POST https://api.satsblox.com/api/auth/refresh \
    -H "Content-Type: application/json" \
    -d '{
      "refreshToken": "..."
    }'
  
  # Verify new access token returned
  ```

- [ ] **Error handling test**
  ```bash
  # Test invalid email
  curl -X POST https://api.satsblox.com/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email": "invalid-email"}'
  
  # Should return 400 Bad Request
  ```

- [ ] **Performance test**
  ```bash
  # Load test with reasonable traffic
  ab -n 1000 -c 10 https://api.satsblox.com/
  
  # Observe:
  # - Response time < 500ms
  # - Error rate = 0%
  # - Server handles load
  ```

### Post-Deployment Monitoring

- [ ] **Check error rate**
  - [ ] Should be near 0% for first hour
  - [ ] Monitor dashboards (Sentry, Datadog, etc.)

- [ ] **Check performance**
  - [ ] Response time p95 < 1 second
  - [ ] Database query time < 100ms
  - [ ] No connection pool exhaustion

- [ ] **Check logs**
  - [ ] Search for ERROR and WARN levels
  - [ ] No unexpected exceptions
  - [ ] Network connectivity ok

- [ ] **Notify stakeholders**
  - [ ] "Deployment successful!"
  - [ ] Share health dashboard link
  - [ ] Expected to see N% increase in request count

## First Week Post-Deployment

### Daily Checks

- [ ] **Monitor error rate**
  - [ ] Should remain < 0.1%
  - [ ] Investigate any spikes

- [ ] **Check performance metrics**
  - [ ] Response times stable
  - [ ] Database connections healthy
  - [ ] Memory usage normal

- [ ] **Review user feedback**
  - [ ] Any reports of issues?
  - [ ] Expected behavior?

### Weekly Tasks

- [ ] **Review metrics**
  - [ ] Successful registrations/logins
  - [ ] Average response time
  - [ ] Error trends

- [ ] **Security review**
  - [ ] Check logs for suspicious activity (brute force attempts, etc.)
  - [ ] Verify no unauthorized access

- [ ] **Backup verification**
  - [ ] Database backups completed successfully
  - [ ] Can we restore from backup if needed?

## Rollback Plan

If deployment has critical issues:

### Quick Rollback

```bash
# Revert to previous version
git revert <commit-hash>
git push

# If using Kubernetes
kubectl rollout undo deployment/satsblox-api

# If using Docker/Docker Compose
docker-compose down
git checkout <previous-tag>
docker-compose up -d
```

### Verify Rollback

- [ ] Health check passes
- [ ] Smoke tests pass
- [ ] Error rate returns to normal

## Post-Rollback

- [ ] **Root cause analysis**
  - [ ] What went wrong?
  - [ ] How do we prevent this?
  - [ ] Fix the issue

- [ ] **Re-deployment**
  - [ ] After fix is complete
  - [ ] Full testing cycle again
  - [ ] More conservative rollout (canary deployment?)

- [ ] **Document lessons learned**
  - [ ] Add to wiki/confluence
  - [ ] Share with team
  - [ ] Update procedures if needed

## Ongoing Production Maintenance

### Weekly

- [ ] Review error logs
- [ ] Check performance metrics
- [ ] Verify backups completed
- [ ] Update dependencies (`npm update`)

### Monthly

- [ ] Security audit
  - [ ] Review access logs
  - [ ] Check for suspicious patterns
  - [ ] Run security scanner (`npm audit`)
- [ ] Performance review
  - [ ] Analyze bottlenecks
  - [ ] Optimize slow endpoints
  - [ ] Review database indexes
- [ ] Capacity planning
  - [ ] Projected growth
  - [ ] Infrastructure needs in 3-6 months

### Quarterly

- [ ] Load test
  - [ ] Verify system can handle peak load
  - [ ] Identify breaking points
  - [ ] Plan infrastructure improvements
- [ ] Disaster recovery drill
  - [ ] Practice database failover
  - [ ] Test backup restoration
  - [ ] Time the recovery

- [ ] Security review
  - [ ] Penetration testing
  - [ ] Dependency audit
  - [ ] Infrastructure review

## Documentation & Runbooks

- [ ] **Deployment Runbook**
  - [ ] Step-by-step deployment instructions
  - [ ] Troubleshooting guide
  - [ ] Rollback procedures

- [ ] **Incident Response Runbook**
  - [ ] What to do if database is down
  - [ ] What to do if API is down
  - [ ] What to do if authentication is broken
  - [ ] Escalation procedures

- [ ] **Operations Manual**
  - [ ] How to scale up/down
  - [ ] How to update dependencies
  - [ ] How to add new endpoints
  - [ ] How to debug issues

---

## Useful Commands

```bash
# Check deployment status
kubectl get deployment satsblox-api

# View recent logs
kubectl logs -f deployment/satsblox-api

# Scale replicas
kubectl scale deployment satsblox-api --replicas=3

# Monitor resource usage
kubectl top nodes
kubectl top pods

# Database backup/restore
pg_dump satsblox_db | gzip > satsblox_backup.sql.gz
gunzip < satsblox_backup.sql.gz | psql satsblox_db

# Test API endpoint
curl -v https://api.satsblox.com/api/auth/register
```

## Emergency Contacts

- **On-call Engineer**: [Name] - [Phone/Slack]
- **Database Admin**: [Name] - [Phone/Slack]
- **DevOps Lead**: [Name] - [Phone/Slack]
- **CTO**: [Name] - [Phone/Slack]

## Escalation Path

1. **Minor issues** (< 1% error rate, < 100ms latency spike)
   - Action: Monitor and investigate
   - Time: Page on-call engineer if error rate stays high > 10 min

2. **Major issues** (> 5% error rate, auth endpoints down)
   - Action: Immediate page on-call engineer and database admin
   - Time: Target 5 min to initiate rollback

3. **Critical issues** (Auth completely broken, data loss risk)
   - Action: Page entire on-call team + CTO + database admin
   - Time: Target 5 min to initiate rollback

---

**Last Updated**: February 17, 2026  
**Version**: 1.0.0  
**Maintained By**: DevOps Team
