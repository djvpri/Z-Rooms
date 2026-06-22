## Z-Rooms Integration Checklist

### 1. Database Changes
- [x] User schema already has `role` field
- [ ] Add `faceId` TEXT UNIQUE to User model
- [ ] Add `isActive` BOOLEAN DEFAULT true
- [ ] Align role enum with ZOne (ADMIN/USER vs OWNER/MANAGER/STAFF)

### 2. Auth Integration
- [ ] Add cross-app API endpoint `/api/admin/cross-app`
- [ ] Support CROSS_APP_SECRET authentication
- [ ] Actions: create, updateRole, toggleActive, resetPassword, delete
- [ ] Face login endpoint `/api/auth/face-login`

### 3. Environment Variables (Railway)
- [ ] CROSS_APP_SECRET=z-ecosystem-admin-2026
- [ ] FACE_LOGIN_SECRET=Fffhjjtxdddggh4457743$&$#$&+
- [ ] ZFACE_API_URL=https://zface.zomet.my.id

### 4. ZOne Dashboard
- [ ] Add Z-Rooms tab in ZOne admin panel
- [ ] User management (list, create, delete, reset password)
- [ ] Show login URL: https://z-rooms-production.up.railway.app

### 5. Face Recognition
- [ ] Camera component for face registration
- [ ] Face login flow (capture → ZFace identify → signIn)
- [ ] Profile page: manage face photo

### 6. SSO (Optional - Phase 2)
- [ ] ZOne login checks Z-Rooms DB
- [ ] Auto-create ZOne user if found in Z-Rooms

---
Start with: Schema changes + cross-app API
