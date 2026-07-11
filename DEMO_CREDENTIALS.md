# Z-Rooms Demo System - Generated Credentials

## Generated Demo Secret

Use one of these secrets for authorization:

```
zrooms-demo-gtiyz4h2p3q
zrooms-demo-mcfu7782wdo  
zrooms-demo-c2vyziv06iu
```

**Note:** These are examples. Generate your own secret:
```bash
node -e "console.log('zrooms-demo-' + Math.random().toString(36).substring(2, 15))"
```

## Demo User Credentials

**Email:** `demo@zomet.my.id`  
**Role:** USER  
**Password:** Set via your auth system (handled by seed function)

## Quick Start Commands

### 1. Apply Migration
```bash
cd /tmp/Z-Rooms
npx prisma migrate deploy
```

### 2. Setup Demo Data
```bash
SECRET="zrooms-demo-gtiyz4h2p3q"
curl -X POST http://localhost:3000/api/demo/setup \
  -H "Authorization: Bearer $SECRET"
```

### 3. Reset Expired Demos (for cron)
```bash
SECRET="zrooms-demo-gtiyz4h2p3q"
curl -X POST http://localhost:3000/api/demo/reset-daily \
  -H "Authorization: Bearer $SECRET"
```

## Endpoint URLs

| Endpoint | Method | URL | Secret Required |
|----------|--------|-----|-----------------|
| Setup Demo | POST | `/api/demo/setup` | Yes |
| Reset Daily | POST | `/api/demo/reset-daily` | Yes |

## Demo Data Structure

### Created Property
- **Name:** Demo Kos Sejahtera
- **Type:** KOS (Boarding House)
- **Location:** Jln. Merdeka No. 123, Pontianak, Kalimantan Barat
- **Facilities:** WiFi, Free Parking, In-room Bathroom, AC
- **Expiry:** 2 hours from creation

### Sample Rooms (5 total)
- **A-101** (Standar, Floor 1) - Rp 1,000,000/month
- **A-102** (Standar, Floor 1) - Rp 1,000,000/month
- **B-201** (Deluxe, Floor 2) - Rp 1,200,000/month
- **B-202** (Deluxe, Floor 2) - Rp 1,200,000/month
- **C-301** (VIP, Floor 3) - Rp 1,500,000/month

### Sample Tenants (2 total)
1. **Budi Santoso**
   - Phone: 081234567890
   - Email: budi@example.com
   - Job: Karyawan Swasta

2. **Siti Nurhaliza**
   - Phone: 082345678901
   - Email: siti@example.com
   - Job: Pegawai Negeri

### Sample Rentals (3 total)
1. Budi → Room A-101 (AKTIF)
2. Siti → Room B-201 (AKTIF)
3. Budi → Room A-102 (PENDING)

### Sample Invoices (5 total)
1. Current month - BELUM_BAYAR (Unpaid)
2. Previous month - LUNAS (Paid)
3. Current month - SEBAGIAN (Partial Payment)
4. 2 months ago - TERLAMBAT (Overdue)
5. Next month - BELUM_BAYAR (For upcoming rental)

## Database Verification

### Check Demo Properties
```bash
psql $DATABASE_URL -c 'SELECT id, nama, isDemo, demoExpiresAt FROM "Properti" WHERE isDemo = true;'
```

### Count Demo Rooms
```bash
psql $DATABASE_URL << 'SQL'
SELECT COUNT(*) as demo_rooms 
FROM "Kamar" 
WHERE "propertiId" IN (
  SELECT id FROM "Properti" WHERE isDemo = true
);
SQL
```

### View Demo Statistics
```bash
psql $DATABASE_URL << 'SQL'
SELECT 
  COUNT(*) as total_demo_properties,
  COUNT(CASE WHEN "demoExpiresAt" > NOW() THEN 1 END) as active_demos,
  COUNT(CASE WHEN "demoExpiresAt" <= NOW() THEN 1 END) as expired_demos
FROM "Properti"
WHERE isDemo = true;
SQL
```

## Environment Configuration

### .env.local
```env
DATABASE_URL="postgresql://user:password@localhost:5432/zrooms"
NEXTAUTH_URL="http://localhost:3000"
DEMO_SECRET="zrooms-demo-gtiyz4h2p3q"
DEMO_API_URL="http://localhost:3000"
```

### .env.production
```env
DEMO_SECRET="zrooms-demo-production-secret"
DEMO_API_URL="https://your-production-domain.com"
```

## Cron Job Configuration

### Crontab Entry
```bash
# Reset demo data daily at 2 AM
0 2 * * * curl -s -X POST http://localhost:3000/api/demo/reset-daily \
  -H "Authorization: Bearer zrooms-demo-gtiyz4h2p3q" \
  >> /var/log/zrooms-demo-reset.log 2>&1
```

### Monitor Cron Execution
```bash
tail -f /var/log/zrooms-demo-reset.log
```

## Testing Checklist

- [ ] Database migration applied successfully
- [ ] Demo secret generated and stored safely
- [ ] Setup endpoint returns 200 with valid data
- [ ] Demo property created in database
- [ ] Demo data includes 5 rooms, 2 tenants, 3 rentals, 5 invoices
- [ ] Demo expiry is set to 2 hours from creation
- [ ] Reset endpoint finds expired demos
- [ ] Reset endpoint cleans up demo data
- [ ] Demo badge displays on UI
- [ ] Cron job runs on schedule

## Files Modified/Created

| File | Type | Purpose |
|------|------|---------|
| `prisma/schema.prisma` | Modified | Added isDemo, demoExpiresAt fields |
| `prisma/migrations/20260711222600_add_demo_fields/` | New | Database migration |
| `app/lib/demo-seed.ts` | New | Seed data functions |
| `app/api/demo/setup/route.ts` | New | Setup endpoint |
| `app/api/demo/reset-daily/route.ts` | New | Reset endpoint |
| `DEMO_SYSTEM.md` | New | Full documentation |
| `DEMO_INTEGRATION_GUIDE.md` | New | Integration examples |
| `DEMO_CREDENTIALS.md` | New | This file |

## Git Commits

```
656cc02 docs: Add demo system integration guide with examples and best practices
7e8b9b0 docs: Add comprehensive demo system documentation
669ddf2 feat: Add demo system for Z-Rooms app
```

## Next Steps

1. **Generate Production Secret**
   ```bash
   node -e "console.log('zrooms-demo-' + Math.random().toString(36).substring(2, 15))"
   ```

2. **Store in Secret Manager**
   - HashiCorp Vault
   - AWS Secrets Manager
   - 1Password / LastPass
   - Environment variables

3. **Configure Cron Job**
   - Add to crontab
   - Or use node-cron
   - Or use GitHub Actions

4. **Deploy Migration**
   ```bash
   npx prisma migrate deploy
   ```

5. **Test Endpoints**
   - Call setup endpoint
   - Verify demo data created
   - Test reset endpoint
   - Verify demo data cleared

6. **Monitor Execution**
   - Track cron job runs
   - Monitor database for orphaned data
   - Alert on failures

## Support

For issues or questions:
- Check `DEMO_SYSTEM.md` for detailed documentation
- Review `DEMO_INTEGRATION_GUIDE.md` for implementation examples
- Check application logs for error details
- Verify Bearer token format and secret value
