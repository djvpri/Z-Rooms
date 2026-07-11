# Z-Rooms Demo System Documentation

## Overview
The demo system allows automated setup and management of demo/test data for the Z-Rooms property management application. It includes seed data and endpoints for initializing and resetting demo properties.

## Database Changes

### Schema Updates
Added two new fields to the `Properti` model:
- `isDemo: Boolean @default(false)` - Marks a property as demo data
- `demoExpiresAt: DateTime?` - Timestamp when demo expires

### Migration
Migration file: `prisma/migrations/20260711222600_add_demo_fields/migration.sql`

Run with: `npx prisma migrate deploy`

## Files Created

### 1. `/app/lib/demo-seed.ts`
Contains two main functions:

#### `seedDemoData(): Promise<SeedResult>`
Creates a complete demo dataset with:
- **1 Demo Property**: "Demo Kos Sejahtera" (KOS type)
- **5 Rooms**: Mix of STANDAR, DELUXE, and VIP types
- **2 Tenants**: Budi Santoso and Siti Nurhaliza
- **3 Rentals**: 2 AKTIF, 1 PENDING
- **5 Invoices**: Various statuses (BELUM_BAYAR, LUNAS, SEBAGIAN, TERLAMBAT)
- **2 Payments**: Associated with paid/partial invoices

Returns object containing IDs of all created entities.

#### `resetDemoData(propertiId: string): Promise<void>`
Cleans up demo data by:
1. Finding all rooms for the property
2. Deleting in order: payments → invoices → rentals → room prices → rooms
3. Resetting demo flags on the property

## API Endpoints

### 1. POST `/api/demo/setup`
**Purpose**: Initialize demo data for testing

**Authentication**: Bearer token with `zrooms-demo-` prefix
```bash
Authorization: Bearer zrooms-demo-[random-string]
```

**Request**:
```bash
curl -X POST http://localhost:3000/api/demo/setup \
  -H "Authorization: Bearer zrooms-demo-gtiyz4h2p3q"
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Demo data setup completed",
  "data": {
    "demoUser": {
      "id": "user-id",
      "email": "demo@zomet.my.id"
    },
    "properti": {
      "id": "properti-id",
      "nama": "Demo Kos Sejahtera",
      "isDemo": true,
      "demoExpiresAt": "2026-07-11T02:27:00.000Z"
    },
    "stats": {
      "kamars": 5,
      "penyewas": 2,
      "sewas": 3,
      "tagihans": 5
    }
  }
}
```

**Error Responses**:
- `401`: Missing or invalid Authorization header
- `403`: Invalid authorization token (must start with `zrooms-demo-`)
- `500`: Server error during setup

### 2. POST `/api/demo/reset-daily`
**Purpose**: Reset all expired demo properties (for cron job)

**Authentication**: Bearer token with `zrooms-demo-` prefix
```bash
Authorization: Bearer zrooms-demo-[same-token]
```

**Request**:
```bash
curl -X POST http://localhost:3000/api/demo/reset-daily \
  -H "Authorization: Bearer zrooms-demo-gtiyz4h2p3q"
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Processed 2 expired demo properties",
  "results": [
    {
      "propertiId": "properti-id-1",
      "propertiNama": "Demo Kos Sejahtera",
      "status": "reset_success"
    },
    {
      "propertiId": "properti-id-2",
      "propertiNama": "Another Demo",
      "status": "reset_success"
    }
  ]
}
```

## Demo Data Details

### Demo User
- Email: `demo@zomet.my.id`
- Role: USER
- Created automatically if not exists

### Demo Property
- Name: Demo Kos Sejahtera
- Type: KOS (boarding house)
- Location: Jln. Merdeka No. 123, Pontianak, Kalimantan Barat
- Facilities: WiFi, Free Parking, In-room Bathroom, AC
- Expiry: 2 hours from creation

### Rooms Created
| Nomor | Lantai | Tipe    | Luas (m²) | Harga Bulanan | Status    |
|-------|--------|---------|-----------|---------------|-----------|
| A-101 | 1      | STANDAR | 12.5      | Rp1.000.000   | TERSEDIA  |
| A-102 | 1      | STANDAR | 12.5      | Rp1.000.000   | TERSEDIA  |
| B-201 | 2      | DELUXE  | 16.0      | Rp1.200.000   | TERSEDIA  |
| B-202 | 2      | DELUXE  | 16.0      | Rp1.200.000   | TERSEDIA  |
| C-301 | 3      | VIP     | 20.0      | Rp1.500.000   | TERSEDIA  |

### Rentals
1. **Budi Santoso** → Room A-101 (AKTIF)
2. **Siti Nurhaliza** → Room B-201 (AKTIF)
3. **Budi Santoso** → Room A-102 (PENDING)

### Invoices
1. Current month - BELUM_BAYAR
2. Previous month - LUNAS (paid)
3. Current month - SEBAGIAN (partially paid)
4. 2 months ago - TERLAMBAT (overdue)
5. Next month - BELUM_BAYAR (for upcoming rental)

## Cron Integration

### Suggested Cron Configuration
To reset expired demo data daily at 2 AM:

```bash
0 2 * * * curl -X POST http://localhost:3000/api/demo/reset-daily \
  -H "Authorization: Bearer zrooms-demo-your-secret"
```

Or with node-cron in the application:

```typescript
import cron from "node-cron";

// Run daily at 2 AM
cron.schedule("0 2 * * *", async () => {
  try {
    const response = await fetch("http://localhost:3000/api/demo/reset-daily", {
      method: "POST",
      headers: {
        Authorization: `Bearer zrooms-demo-your-secret`,
      },
    });
    const result = await response.json();
    console.log("Demo reset completed:", result);
  } catch (error) {
    console.error("Demo reset failed:", error);
  }
});
```

## Security Considerations

1. **Token Format**: All tokens must follow the pattern `zrooms-demo-[random-string]`
2. **Header Validation**: Both endpoints validate the Authorization header
3. **Demo User Isolation**: Demo data is marked with `isDemo: true` for easy filtering
4. **Automatic Expiry**: Demo data expires after 2 hours automatically
5. **Safe Cascading Deletes**: Reset process properly handles foreign key relationships

## Token Generation

Generate a new demo secret:
```bash
node -e "console.log('zrooms-demo-' + Math.random().toString(36).substring(2, 15))"
```

Or use Node.js crypto:
```typescript
import crypto from "crypto";
const secret = `zrooms-demo-${crypto.randomBytes(8).toString("hex")}`;
```

## Testing

```bash
# 1. Generate a secret
SECRET="zrooms-demo-gtiyz4h2p3q"

# 2. Setup demo data
curl -X POST http://localhost:3000/api/demo/setup \
  -H "Authorization: Bearer $SECRET"

# 3. Check the data in your UI or database
psql $DATABASE_URL -c "SELECT * FROM \"Properti\" WHERE \"isDemo\" = true;"

# 4. Reset demo data
curl -X POST http://localhost:3000/api/demo/reset-daily \
  -H "Authorization: Bearer $SECRET"

# 5. Verify reset
psql $DATABASE_URL -c "SELECT * FROM \"Properti\" WHERE \"isDemo\" = true;"
```

## Troubleshooting

### Issue: "Invalid authorization token"
- Ensure token starts with `zrooms-demo-`
- Check header format: `Authorization: Bearer [token]`

### Issue: "Failed to setup demo data"
- Verify database connection
- Check Prisma migrations are applied: `npx prisma migrate deploy`
- Review server logs for detailed error

### Issue: Demo data not expiring
- Check `demoExpiresAt` is being set correctly
- Cron job may not be running - verify configuration
- Manually run reset endpoint to test

## Notes

- Demo data uses real data structures (not mocked)
- All relations and constraints are respected
- Data is suitable for UI testing, documentation, and demonstrations
- Demo user email is standardized (`demo@zomet.my.id`) for consistency
- Seed function is idempotent for the user (creates once, updates existing)
