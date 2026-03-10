# Incident Runbook — FloraScout

## Monitoring & Alerts

### Sentry (Crash Monitoring)
- Dashboard: Check Sentry project for crash-free rate
- Alert: Spike in unhandled exceptions triggers email alert
- Action: Triage → hotfix via OTA update or native build rollback

### RevenueCat (Payments)
- Dashboard: RevenueCat Dashboard → Overview
- Alert: Webhook failures visible in Supabase Edge Function logs
- Action: Check `revenucat-webhook` function logs, verify credit allocation

### Supabase (Backend)
- Dashboard: Supabase Dashboard → Database / Edge Functions
- Alert: Function invocation errors, DB connection limits
- Action: Check function logs, scale if needed

## Incident Response

### P0 — App Crash Loop
1. Check Sentry for stack trace + affected release
2. If JS-only: push OTA hotfix via `eas update --channel production`
3. If native: submit emergency build via `eas build --platform all`
4. Communicate via app status / support channels

### P0 — Payment Failure
1. Check RevenueCat webhook logs in Supabase
2. Verify credit allocation in `profiles.credits` table
3. Manual credit adjustment if needed via admin dashboard
4. Contact RevenueCat support if systemic

### P1 — AI Service Degradation
1. Check Supabase Edge Function logs for timeouts/errors
2. Network policy auto-retries (2 attempts, 45s timeout)
3. If persistent: check upstream API status
4. Fallback: users see error state with retry button

### P1 — Database Migration Failure
1. Check GitHub Actions → Supabase Deploy workflow
2. `supabase migration repair --status reverted <version>` if needed
3. Fix migration SQL, push to main
4. Never run destructive migrations without backup

## Rollback Procedures

### OTA Rollback
```bash
# List recent updates
eas update:list --channel production

# Rollback to previous update
eas update:rollback --channel production
```

### Native Build Rollback
- iOS: Submit previous build version via App Store Connect
- Android: Rollback via Google Play Console staged rollout

### Database Rollback
- Supabase point-in-time recovery (if enabled)
- Manual: write reverse migration SQL
