# Demo System Integration Guide

## Quick Start

### 1. Generate a Demo Secret
```bash
SECRET=$(node -e "console.log('zrooms-demo-' + Math.random().toString(36).substring(2, 15))")
echo "Demo Secret: $SECRET"
```

### 2. Apply Database Migration
```bash
cd /tmp/Z-Rooms
npx prisma migrate deploy
```

### 3. Setup Demo Data
```bash
curl -X POST http://localhost:3000/api/demo/setup \
  -H "Authorization: Bearer zrooms-demo-gtiyz4h2p3q"
```

## Endpoint URLs

### Setup Endpoint
```
POST /api/demo/setup
Authorization: Bearer zrooms-demo-[secret]
```
URL: `http://localhost:3000/api/demo/setup`

### Reset Daily Endpoint  
```
POST /api/demo/reset-daily
Authorization: Bearer zrooms-demo-[secret]
```
URL: `http://localhost:3000/api/demo/reset-daily`

## Cron Job Setup Examples

### Crontab (Linux/Mac)
```bash
0 2 * * * curl -X POST http://localhost:3000/api/demo/reset-daily \
  -H "Authorization: Bearer zrooms-demo-your-secret"
```

### Node-cron Implementation
Create `app/jobs/demo-reset-cron.ts`:
```typescript
import cron from "node-cron";

const DEMO_SECRET = process.env.DEMO_SECRET;

export function startDemoResetCron() {
  cron.schedule("0 2 * * *", async () => {
    try {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const response = await fetch(`${baseUrl}/api/demo/reset-daily`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEMO_SECRET}`,
        },
      });
      const result = await response.json();
      console.log("[Demo Reset] Success:", result.message);
    } catch (error) {
      console.error("[Demo Reset] Failed:", error);
    }
  });
}
```

## Environment Setup

Add to `.env.local`:
```env
DEMO_SECRET=zrooms-demo-your-generated-secret
DEMO_API_URL=http://localhost:3000
```

## Testing Workflow

### 1. Setup Demo
```bash
curl -X POST http://localhost:3000/api/demo/setup \
  -H "Authorization: Bearer zrooms-demo-gtiyz4h2p3q" | jq .
```

Response includes:
- demoUser (email: demo@zomet.my.id)
- properti with isDemo=true, 2-hour expiry
- stats: 5 kamars, 2 penyewas, 3 sewas, 5 tagihans

### 2. Verify in Database
```bash
psql $DATABASE_URL -c 'SELECT id, nama, isDemo, demoExpiresAt FROM "Properti" WHERE isDemo = true;'
```

### 3. Test Reset
```bash
curl -X POST http://localhost:3000/api/demo/reset-daily \
  -H "Authorization: Bearer zrooms-demo-gtiyz4h2p3q" | jq .
```

### 4. Verify Cleanup
```bash
psql $DATABASE_URL -c 'SELECT COUNT(*) FROM "Properti" WHERE isDemo = true;'
```

## Dashboard Integration

### Display Demo Banner
```typescript
async function DashboardBanner() {
  const properti = await getPropertyData();
  
  if (properti?.isDemo) {
    return (
      <div className="bg-yellow-100 border border-yellow-400 p-4">
        <p className="text-yellow-800 font-bold">🚀 Demo Mode Active</p>
        <p className="text-yellow-700 text-sm">
          Expires: {new Date(properti.demoExpiresAt).toLocaleString()}
        </p>
      </div>
    );
  }
}
```

## Filtering Demo Data in Queries

### Exclude Demo Properties
```typescript
const properties = await prisma.properti.findMany({
  where: { isDemo: false },
});
```

### Get Active Demos Only
```typescript
const activeDemos = await prisma.properti.findMany({
  where: {
    isDemo: true,
    demoExpiresAt: { gt: new Date() },
  },
});
```

### Check Demo Expiry in API
```typescript
export async function checkDemoExpiry(propertiId: string) {
  const properti = await prisma.properti.findUnique({
    where: { id: propertiId },
  });

  if (properti?.isDemo && properti.demoExpiresAt) {
    if (new Date() > properti.demoExpiresAt) {
      throw new Error("Demo has expired. Please request a new demo.");
    }
  }

  return properti;
}
```

## Monitoring

### Demo Statistics
```sql
SELECT 
  COUNT(*) as total_demo_properties,
  COUNT(CASE WHEN "demoExpiresAt" > NOW() THEN 1 END) as active_demos,
  COUNT(CASE WHEN "demoExpiresAt" <= NOW() THEN 1 END) as expired_demos,
  COUNT(DISTINCT "ownerId") as unique_demo_users
FROM "Properti"
WHERE isDemo = true;
```

### Demo Activity
```sql
SELECT 
  p.id,
  p.nama,
  p.createdAt,
  p."demoExpiresAt",
  COUNT(DISTINCT k.id) as room_count,
  COUNT(DISTINCT s.id) as rental_count
FROM "Properti" p
LEFT JOIN "Kamar" k ON p.id = k."propertiId"
LEFT JOIN "Sewa" s ON k.id = s."kamarId"
WHERE p.isDemo = true
GROUP BY p.id
ORDER BY p.createdAt DESC;
```

## Best Practices

1. **Different Secrets Per Environment**: Dev/staging/production should have unique secrets
2. **Rotate Secrets**: Generate new secrets periodically
3. **Log Operations**: Monitor cron job execution and results
4. **Test Expiry**: Verify demo cleanup works automatically
5. **Alert on Failure**: Set up notifications for reset failures
6. **Monitor Database**: Watch for orphaned or corrupted demo data
7. **Secure Storage**: Use secret management (1Password, HashiCorp Vault, etc.)

## Troubleshooting

### Demo not resetting
- Verify cron job is running: `sudo journalctl -u cron`
- Check authorization token format and value
- Verify network connectivity to the reset endpoint
- Review application error logs

### Performance concerns
- Add index for demo queries:
```sql
CREATE INDEX idx_properti_demo ON "Properti"(isDemo, "demoExpiresAt");
```
- Filter demo data in critical queries to exclude from performance metrics

### Demo data cleanup
- Manual reset: `curl -X POST /api/demo/reset-daily -H "Authorization: Bearer zrooms-demo-xxx"`
- Check PrismaClient connection in production
