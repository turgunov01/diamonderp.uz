# Mobile API

РљСЂР°С‚РєР°СЏ РґРѕРєСѓРјРµРЅС‚Р°С†РёСЏ РґР»СЏ РёРЅС‚РµРіСЂР°С†РёРё РјРѕР±РёР»СЊРЅРѕРіРѕ РїСЂРёР»РѕР¶РµРЅРёСЏ СЃ backend.

## Base URL

Р’СЃРµ mobile endpoint-С‹ РёРґСѓС‚ РїРѕРґ РїСЂРµС„РёРєСЃРѕРј:

```text
/api/mobile/*
```

РџСЂРёРјРµСЂ:

```text
POST /api/mobile/auth/login
GET /api/mobile/auth/shift
POST /api/mobile/activity/location
GET /api/mobile/objects
GET /api/mobile/documents
GET /api/mobile/reports/aroma
GET /api/mobile/tasks
```

## РђРІС‚РѕСЂРёР·Р°С†РёСЏ

РџРѕСЃР»Рµ СѓСЃРїРµС€РЅРѕРіРѕ Р»РѕРіРёРЅР° backend РІРѕР·РІСЂР°С‰Р°РµС‚ JWT token.

Р’Рѕ РІСЃРµ СЃР»РµРґСѓСЋС‰РёРµ Р·Р°РїСЂРѕСЃС‹ РЅСѓР¶РЅРѕ РїРµСЂРµРґР°РІР°С‚СЊ:

```http
Authorization: Bearer <token>
```

Р•СЃР»Рё token РЅРµ РїРµСЂРµРґР°РЅ РёР»Рё РЅРµРІР°Р»РёРґРЅС‹Р№, backend РІРµСЂРЅРµС‚ `401`.

## Р РѕР»СЊ Рё frontend

Р’ login backend РІРѕР·РІСЂР°С‰Р°РµС‚:

- `role`
- `frontend`
- `source`
- `shift`

РџСЂР°РІРёР»Р°:

- `role=customer|cleaner` -> `frontend=employee`
- `role=manager` -> `frontend=manager`
- `role=supervisor` -> `frontend=supervisor`
- `role=procurement` -> `frontend=procurement`
- `role=admin|hr` -> `frontend=erp`

Р­С‚Рѕ РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РІ РјРѕР±РёР»СЊРЅРѕРј РїСЂРёР»РѕР¶РµРЅРёРё РґР»СЏ СЂР°Р·РґРµР»РµРЅРёСЏ РјРёРєСЂРѕС„СЂРѕРЅС‚РµРЅРґР°.

## 1. Auth

### POST `/api/mobile/auth/login`

Р›РѕРіРёРЅ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.

РџРѕРґРґРµСЂР¶РёРІР°РµРјС‹Рµ РїРѕР»СЏ РІ body:

```json
{
  "login": "998901234567",
  "password": "123456"
}
```

РўР°РєР¶Рµ РјРѕР¶РЅРѕ РѕС‚РїСЂР°РІР»СЏС‚СЊ:

```json
{
  "phone": "998901234567",
  "password": "123456"
}
```

РёР»Рё

```json
{
  "email": "admin@diamond.local",
  "password": "password123"
}
```

Р”Р»СЏ СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ РјРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ `location`; РѕРЅР° Р·Р°РїРёС€РµС‚СЃСЏ РєР°Рє СЃС‚Р°СЂС‚РѕРІР°СЏ С‚РѕС‡РєР° СЃРјРµРЅС‹ Рё РїРµСЂРІР°СЏ С‚РѕС‡РєР° РјР°СЂС€СЂСѓС‚Р°:

```json
{
  "login": "998901234567",
  "password": "123456",
  "location": {
    "latitude": 41.311081,
    "longitude": 69.240562,
    "accuracy": 18,
    "capturedAt": "2026-03-29T11:50:00.000Z"
  }
}
```

РџСЂРёРјРµСЂ РѕС‚РІРµС‚Р°:

```json
{
  "user": {
    "id": 25,
    "name": "Ali Valiyev",
    "phone": "+998901234567",
    "role": "customer",
    "avatar": null
  },
  "token": "jwt_token_here",
  "role": "customer",
  "frontend": "employee",
  "source": "customer",
  "mustChangePassword": true,
  "access": {
    "buildingId": 3,
    "objectIds": [8, 9],
    "objectNames": ["Lobby", "Office Floor 2"]
  },
  "shift": {
    "workShift": "day",
    "label": "Р”РµРЅСЊ",
    "timezone": "Asia/Tashkent",
    "shiftStartHour": 8,
    "shiftEndHour": 20,
    "isActiveNow": true,
    "shouldLogoutNow": false,
    "startedAt": "2026-03-29T03:00:00.000Z",
    "logoutAt": "2026-03-29T15:00:00.000Z",
    "nextShiftStartsAt": "2026-03-30T03:00:00.000Z"
  },
  "objects": [
    {
      "id": 8,
      "buildingId": 3,
      "name": "Lobby",
      "description": "Main lobby",
      "address": "Tashkent",
      "code": "summit-lobby",
      "isActive": true
    }
  ],
  "activity": {
    "created": true,
    "recordedAt": "2026-03-29T11:50:00.000Z",
    "activity": {
      "id": 77,
      "employeeId": 25,
      "employeeName": "Ali Valiyev",
      "date": "2026-03-29",
      "status": "late",
      "workMinutes": 0,
      "lateMinutes": 470
    }
  }
}
```

Р’Р°Р¶РЅРѕ:

- РґР»СЏ `customer` РїСЂРё Р»РѕРіРёРЅРµ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЃРѕР·РґР°РµС‚СЃСЏ/РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ Р·Р°РїРёСЃСЊ attendance Р·Р° РґРµРЅСЊ
- РґР»СЏ `customer` РїСЂРё Р»РѕРіРёРЅРµ С‚Р°РєР¶Рµ РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ `shift`
- РµСЃР»Рё `shift.shouldLogoutNow=true`, РјРѕР±РёР»СЊРЅРѕРµ РїСЂРёР»РѕР¶РµРЅРёРµ РјРѕР¶РµС‚ СЃСЂР°Р·Сѓ Р·Р°РІРµСЂС€РёС‚СЊ СЃРµСЃСЃРёСЋ
- РµСЃР»Рё `shift.logoutAt` РЅРµ `null`, СЌС‚Рѕ РІСЂРµРјСЏ СЂРµРєРѕРјРµРЅРґРѕРІР°РЅРЅРѕРіРѕ logout РїРѕ С‚РµРєСѓС‰РµР№ СЃРјРµРЅРµ
- СЃС‚Р°С‚СѓСЃ attendance СЃС‡РёС‚Р°РµС‚СЃСЏ РїРѕ `Asia/Tashkent`
- СЃС‚Р°С‚СѓСЃ `on_time`/`late` СЃС‡РёС‚Р°РµС‚СЃСЏ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РЅР°С‡Р°Р»Р° СЃРјРµРЅС‹ (`08:00` РґР»СЏ `day`, `20:00` РґР»СЏ `night`)
- РґР»СЏ `night` СЃРјРµРЅС‹ `activity.date` вЂ” СЌС‚Рѕ РґР°С‚Р° РЅР°С‡Р°Р»Р° СЃРјРµРЅС‹ (РјРѕР¶РµС‚ Р±С‹С‚СЊ РІС‡РµСЂР°)

### GET `/api/mobile/auth/me`

Р’РѕР·РІСЂР°С‰Р°РµС‚ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РїРѕ С‚РѕРєРµРЅСѓ.

Header:

```http
Authorization: Bearer <token>
```

РћС‚РІРµС‚:

```json
{
  "user": {
    "id": 25,
    "name": "Ali Valiyev",
    "phone": "+998901234567",
    "role": "customer",
    "avatar": null
  },
  "role": "customer",
  "frontend": "employee",
  "source": "customer",
  "mustChangePassword": true,
  "access": {
    "buildingId": 3,
    "objectIds": [8, 9],
    "objectNames": ["Lobby", "Office Floor 2"]
  },
  "shift": {
    "workShift": "day",
    "label": "Р”РµРЅСЊ",
    "timezone": "Asia/Tashkent",
    "shiftStartHour": 8,
    "shiftEndHour": 20,
    "isActiveNow": true,
    "shouldLogoutNow": false,
    "startedAt": "2026-03-29T03:00:00.000Z",
    "logoutAt": "2026-03-29T15:00:00.000Z",
    "nextShiftStartsAt": "2026-03-30T03:00:00.000Z"
  },
  "objects": [
    {
      "id": 8,
      "buildingId": 3,
      "name": "Lobby",
      "description": "Main lobby",
      "address": "Tashkent",
      "code": "summit-lobby",
      "isActive": true
    }
  ]
}
```

### POST `/api/mobile/auth/change-password`

РњРµРЅСЏРµС‚ РїР°СЂРѕР»СЊ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (С‚РѕР»СЊРєРѕ `customer` Р°РєРєР°СѓРЅС‚С‹) Рё СЃР±СЂР°СЃС‹РІР°РµС‚ С„Р»Р°Рі `mustChangePassword=false`.

Header:

```http
Authorization: Bearer <token>
```

Body:

```json
{
  "currentPassword": "12345678",
  "newPassword": "MyNewPassword123"
}
```

РћС‚РІРµС‚:

```json
{
  "ok": true,
  "mustChangePassword": false
}
```

### GET `/api/mobile/auth/shift`

Р’РѕР·РІСЂР°С‰Р°РµС‚ С‚РѕР»СЊРєРѕ РёРЅС„РѕСЂРјР°С†РёСЋ РїРѕ СЃРјРµРЅРµ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.

Header:

```http
Authorization: Bearer <token>
```

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "source": "customer",
  "shift": {
    "workShift": "day",
    "label": "Р”РµРЅСЊ",
    "timezone": "Asia/Tashkent",
    "shiftStartHour": 8,
    "shiftEndHour": 20,
    "isActiveNow": true,
    "shouldLogoutNow": false,
    "startedAt": "2026-03-29T03:00:00.000Z",
    "logoutAt": "2026-03-29T15:00:00.000Z",
    "nextShiftStartsAt": "2026-03-30T03:00:00.000Z"
  }
}
```

РџСЂРёРјРµС‡Р°РЅРёРµ:

- `day` СЃС‡РёС‚Р°РµС‚СЃСЏ РєР°Рє `08:00-20:00` РїРѕ `Asia/Tashkent`
- `night` СЃС‡РёС‚Р°РµС‚СЃСЏ РєР°Рє `20:00-08:00` РїРѕ `Asia/Tashkent`
- `logoutAt` Р·Р°РїРѕР»РЅРµРЅ С‚РѕР»СЊРєРѕ РµСЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃРµР№С‡Р°СЃ РІРЅСѓС‚СЂРё СЃРІРѕРµР№ СЃРјРµРЅС‹

### POST `/api/mobile/activity/finish`

РћС‚РјРµС‡Р°РµС‚ РѕРєРѕРЅС‡Р°РЅРёРµ СЂР°Р±РѕС‚С‹ СЃРѕС‚СЂСѓРґРЅРёРєР° Рё РѕР±РЅРѕРІР»СЏРµС‚ `workMinutes` РІ Р·Р°РїРёСЃРё attendance С‚РµРєСѓС‰РµР№ СЃРјРµРЅС‹.

Header:

```http
Authorization: Bearer <token>
```

Body (optional):

```json
{
  "finishedAt": "2026-03-29T15:00:00.000Z",
  "location": {
    "latitude": 41.311502,
    "longitude": 69.241120,
    "accuracy": 20,
    "capturedAt": "2026-03-29T15:00:00.000Z"
  }
}
```

Р•СЃР»Рё `finishedAt` РЅРµ РїРµСЂРµРґР°РЅ вЂ” РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ С‚РµРєСѓС‰РµРµ РІСЂРµРјСЏ СЃРµСЂРІРµСЂР°.

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "finishedAt": "2026-03-29T15:00:00.000Z",
  "activity": {
    "id": 77,
    "employeeId": 25,
    "employeeName": "Ali Valiyev",
    "date": "2026-03-29",
    "status": "late",
    "workMinutes": 250,
    "lateMinutes": 470
  }
}
```

РџСЂР°РІРёР»Р°:

- endpoint РёС‰РµС‚ СЃСѓС‰РµСЃС‚РІСѓСЋС‰СѓСЋ Р·Р°РїРёСЃСЊ attendance РґР»СЏ С‚РµРєСѓС‰РµР№ СЃРјРµРЅС‹ (РєР°Рє РїСЂР°РІРёР»Рѕ, РѕРЅР° СЃРѕР·РґР°РµС‚СЃСЏ РїСЂРё Р»РѕРіРёРЅРµ)
- `workMinutes` = `max(0, minutes(shiftStart в†’ min(finishedAt, shiftEnd)) - lateMinutes)`

### POST `/api/mobile/activity/location`

Р—Р°РїРёСЃС‹РІР°РµС‚ С‚РµРєСѓС‰СѓСЋ С‚РѕС‡РєСѓ РјР°СЂС€СЂСѓС‚Р° СЃРѕС‚СЂСѓРґРЅРёРєР°. РСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РјРѕР±РёР»СЊРЅС‹Рј РїСЂРёР»РѕР¶РµРЅРёРµРј РґР»СЏ С„РѕРЅРѕРІРѕРіРѕ С‚СЂРµРєРёРЅРіР° Рё РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ РјР°СЂС€СЂСѓС‚Р° РІ HR в†’ РђРєС‚РёРІРЅРѕСЃС‚СЊ СЃРѕС‚СЂСѓРґРЅРёРєРѕРІ.

Header:

```http
Authorization: Bearer <token>
```

Body:

```json
{
  "location": {
    "latitude": 41.311081,
    "longitude": 69.240562,
    "accuracy": 18,
    "heading": 95,
    "speed": 1.4,
    "capturedAt": "2026-03-29T11:55:00.000Z"
  }
}
```

Р”Р»СЏ РїР°РєРµС‚РЅРѕР№ РѕС‚РїСЂР°РІРєРё РїРѕСЃР»Рµ РѕС„Р»Р°Р№РЅР° РјРѕР¶РЅРѕ РїРµСЂРµРґР°С‚СЊ `locations`:

```json
{
  "locations": [
    {
      "latitude": 41.311081,
      "longitude": 69.240562,
      "accuracy": 18,
      "capturedAt": "2026-03-29T11:55:00.000Z"
    },
    {
      "latitude": 41.311502,
      "longitude": 69.241120,
      "accuracy": 20,
      "capturedAt": "2026-03-29T11:56:00.000Z"
    }
  ]
}
```

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "count": 1,
  "locations": [
    {
      "id": 1001,
      "employeeId": 25,
      "employeeName": "Ali Valiyev",
      "activityId": 77,
      "buildingId": 3,
      "recordedAt": "2026-03-29T11:55:00.000Z",
      "capturedAt": "2026-03-29T11:55:00.000Z",
      "latitude": 41.311081,
      "longitude": 69.240562,
      "accuracy": 18,
      "altitude": null,
      "altitudeAccuracy": null,
      "heading": 95,
      "speed": 1.4,
      "mapUrl": "https://www.google.com/maps?q=41.311081,69.240562"
    }
  ]
}
```

РџСЂР°РІРёР»Р°:

- endpoint РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ СЃРѕС‚СЂСѓРґРЅРёРєР°Рј (`customer`/РєР°СЃС‚РѕРјРЅС‹Рµ РјРѕР±РёР»СЊРЅС‹Рµ СЂРѕР»Рё)
- РµСЃР»Рё attendance Р·Р° СЃРјРµРЅСѓ РµС‰Рµ РЅРµ СЃРѕР·РґР°РЅ, РѕРЅ Р±СѓРґРµС‚ СЃРѕР·РґР°РЅ РєР°Рє РїСЂРё Р»РѕРіРёРЅРµ
- РјР°РєСЃРёРјСѓРј 250 С‚РѕС‡РµРє РІ РѕРґРЅРѕРј Р·Р°РїСЂРѕСЃРµ
- РїРµСЂРµРґ РІРєР»СЋС‡РµРЅРёРµРј РЅСѓР¶РЅРѕ РІС‹РїРѕР»РЅРёС‚СЊ `db/postgres/employee_location_points.sql`

## 2. Objects

### GET `/api/mobile/objects`

Р’РѕР·РІСЂР°С‰Р°РµС‚ С‚РѕР»СЊРєРѕ РґРѕСЃС‚СѓРїРЅС‹Рµ С‚РµРєСѓС‰РµРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ РѕР±СЉРµРєС‚С‹.

Query params:

- `activeOnly=true` вЂ” С‚РѕР»СЊРєРѕ Р°РєС‚РёРІРЅС‹Рµ РѕР±СЉРµРєС‚С‹

РџСЂРёРјРµСЂ:

```http
GET /api/mobile/objects?activeOnly=true
Authorization: Bearer <token>
```

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "items": [
    {
      "id": 8,
      "buildingId": 3,
      "name": "Lobby",
      "description": "Main lobby",
      "address": "Tashkent",
      "code": "summit-lobby",
      "isActive": true
    }
  ]
}
```

### GET `/api/mobile/objects/:id`

Р’РѕР·РІСЂР°С‰Р°РµС‚ РѕРґРёРЅ РѕР±СЉРµРєС‚, РµСЃР»Рё Сѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РµСЃС‚СЊ Рє РЅРµРјСѓ РґРѕСЃС‚СѓРї.

РџСЂРёРјРµСЂ:

```http
GET /api/mobile/objects/8
Authorization: Bearer <token>
```

Р•СЃР»Рё РґРѕСЃС‚СѓРїР° РЅРµС‚, backend РІРµСЂРЅРµС‚ `404`.

## 3. Documents

### GET `/api/mobile/documents`

Р’РѕР·РІСЂР°С‰Р°РµС‚ РґРѕРєСѓРјРµРЅС‚С‹ РїРѕ РґРѕСЃС‚СѓРїРЅС‹Рј РѕР±СЉРµРєС‚Р°Рј.

Query params:

- `objectId` вЂ” РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ, РµСЃР»Рё РЅСѓР¶РЅРѕ РѕС‚С„РёР»СЊС‚СЂРѕРІР°С‚СЊ РїРѕ РѕРґРЅРѕРјСѓ РѕР±СЉРµРєС‚Сѓ

РџСЂРёРјРµСЂ:

```http
GET /api/mobile/documents?objectId=8
Authorization: Bearer <token>
```

РћСЃРѕР±РµРЅРЅРѕСЃС‚Рё:

- `customer` РІРёРґРёС‚ С‚РѕР»СЊРєРѕ СЃРІРѕРё РЅР°Р·РЅР°С‡РµРЅРёСЏ Рё СЃРІРѕРё РїРѕРґРїРёСЃРё
- `erp` СЂРѕР»Рё РІРёРґСЏС‚ РѕР±СЉРµРєС‚РЅС‹Р№ СЃСЂРµР· С†РµР»РёРєРѕРј

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "objectIds": [8],
  "templates": [
    {
      "id": 5,
      "objectId": 8,
      "name": "NDA",
      "description": "NDA employee",
      "contractType": "nda",
      "html": "<section>...</section>",
      "css": "",
      "storagePath": "templates/nda.json",
      "createdAt": "2026-03-20T10:00:00.000Z",
      "updatedAt": "2026-03-20T10:00:00.000Z"
    }
  ],
  "dispatches": [
    {
      "id": 12,
      "objectId": 8,
      "templateId": 5,
      "templateName": "NDA",
      "title": "NDA - 29.03.2026",
      "recipientIds": [25],
      "recipientPhones": ["+998901234567"],
      "recipientCount": 1,
      "signedCount": 0,
      "status": "sent",
      "sentAt": "2026-03-29T08:00:00.000Z",
      "recipients": [
        {
          "id": 25,
          "username": "ali",
          "phoneNumber": "+998901234567"
        }
      ],
      "assignedToCurrentUser": true,
      "signedByCurrentUser": false
    }
  ],
  "signed": []
}
```

### POST `/api/mobile/documents/sign`

РџРѕРґРїРёСЃР°РЅРёРµ РґРѕРєСѓРјРµРЅС‚Р° СЃРѕС‚СЂСѓРґРЅРёРєРѕРј С‡РµСЂРµР· РјРѕР±РёР»СЊРЅРѕРµ РїСЂРёР»РѕР¶РµРЅРёРµ.

Body:

```json
{
  "dispatchId": 12,
  "templateId": 5,
  "signatureImage": "data:image/png;base64,iVBORw0KGgoAAA...",
  "signatureJson": {},
  "consentChecked": true,
  "userAgent": "Flutter App"
}
```

Р’Р°Р¶РЅРѕ:

- `employeeName` Рё `phoneNumber` Р±СЂР°С‚СЊ РёР· РєР»РёРµРЅС‚Р° РЅРµ РЅСѓР¶РЅРѕ
- backend СЃР°Рј РІРѕР·СЊРјРµС‚ РёС… РёР· С‚РѕРєРµРЅР°
- РїРѕРґРїРёСЃР°С‚СЊ РјРѕР¶РЅРѕ С‚РѕР»СЊРєРѕ РґРѕРєСѓРјРµРЅС‚, РЅР°Р·РЅР°С‡РµРЅРЅС‹Р№ С‚РµРєСѓС‰РµРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ
- РїСЂРё РїРѕРІС‚РѕСЂРЅРѕР№ РїРѕРґРїРёСЃРё backend РІРµСЂРЅРµС‚ `409`

РџСЂРёРјРµСЂ РѕС‚РІРµС‚Р°:

```json
{
  "id": 31,
  "objectId": 8,
  "dispatchId": 12,
  "templateId": 5,
  "employeeName": "Ali Valiyev",
  "phoneNumber": "+998901234567",
  "signedAt": "2026-03-29T12:10:00.000Z",
  "signedVia": "mobile",
  "fileUrl": "https://.../document-signatures/...",
  "signaturePath": "ali-valiyev/5-12-1711711111.jpg",
  "dispatchStatus": "signed",
  "signedCount": 1
}
```

## 4. Reports

### GET `/api/mobile/reports`

Р’РѕР·РІСЂР°С‰Р°РµС‚ СЃРїРёСЃРѕРє РґРѕСЃС‚СѓРїРЅС‹С… report endpoint-РѕРІ.

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "objectIds": [8, 9],
  "endpoints": {
    "aroma": "/api/mobile/reports/aroma",
    "marble": "/api/mobile/reports/marble",
    "sanitation": "/api/mobile/reports/sanitation",
    "waste": "/api/mobile/reports/waste"
  }
}
```

### GET `/api/mobile/reports/aroma`

Query params:

- `objectId` вЂ” РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "objectIds": [8],
  "devices": [],
  "refills": []
}
```

### GET `/api/mobile/reports/marble`

Query params:

- `objectId` вЂ” РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "objectIds": [8],
  "events": []
}
```

### GET `/api/mobile/reports/sanitation`

Query params:

- `objectId` вЂ” РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "objectIds": [8],
  "events": []
}
```

### GET `/api/mobile/reports/waste`

Query params:

- `objectId` вЂ” РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "objectIds": [8],
  "bins": [],
  "reports": []
}
```

## 5. Tasks

### GET `/api/mobile/tasks`

Р’РѕР·РІСЂР°С‰Р°РµС‚ to-do Р»РёСЃС‚С‹:

- РґР»СЏ `role=customer|cleaner`: Р·Р°РґР°С‡Рё, РЅР°Р·РЅР°С‡РµРЅРЅС‹Рµ СЃРѕС‚СЂСѓРґРЅРёРєСѓ
- РґР»СЏ `role=manager`: Р·Р°РґР°С‡Рё РЅР° РїСЂРѕРІРµСЂРєСѓ (РїРѕСЃР»Рµ Р·Р°РІРµСЂС€РµРЅРёСЏ РєР»РёРЅРµСЂРѕРј)

Query params:

- `status` вЂ” РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ: `open`, `in_progress`, `completed` (РґР»СЏ `customer|cleaner`)
- `reviewStatus` вЂ” РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ: `pending`, `approved`, `rejected` (РґР»СЏ `manager`, default: `pending`)

РџСЂРёРјРµСЂ:

```http
GET /api/mobile/tasks?status=open
Authorization: Bearer <token>
```

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "items": [
    {
      "id": 44,
      "objectId": 8,
      "objectName": "Lobby",
      "employeeId": 25,
      "employeeName": "Ali Valiyev",
      "title": "РћС‚РєСЂС‹С‚РёРµ СЃРјРµРЅС‹",
      "note": "РџСЂРѕР№С‚РёСЃСЊ РїРѕ РІС…РѕРґРЅРѕР№ РіСЂСѓРїРїРµ РґРѕ 09:15",
      "dueDate": "2026-03-30",
      "status": "in_progress",
      "totalItems": 4,
      "completedItems": 2,
      "progressPercent": 50,
      "items": [
        {
          "id": 101,
          "taskListId": 44,
          "title": "РџСЂРѕРІРµСЂРёС‚СЊ РІС…РѕРґРЅСѓСЋ РіСЂСѓРїРїСѓ",
          "isDone": true,
          "completedAt": "2026-03-30T04:01:00.000Z",
          "sortOrder": 0
        }
      ]
    }
  ]
}
```

### PATCH `/api/mobile/tasks/:taskId/items/:itemId`

РћС‚РјРµС‡Р°РµС‚ РїСѓРЅРєС‚ С‡РµРє-Р»РёСЃС‚Р° РєР°Рє РІС‹РїРѕР»РЅРµРЅРЅС‹Р№ РёР»Рё РІРѕР·РІСЂР°С‰Р°РµС‚ РѕР±СЂР°С‚РЅРѕ РІ РЅРµРІС‹РїРѕР»РЅРµРЅРЅС‹Рµ.

Body:

```json
{
  "done": true
}
```

РџСЂРёРјРµСЂ:

```http
PATCH /api/mobile/tasks/44/items/101
Authorization: Bearer <token>
Content-Type: application/json
```

РћС‚РІРµС‚:

```json
{
  "role": "customer",
  "frontend": "employee",
  "task": {
    "id": 44,
    "status": "completed",
    "completedItems": 4,
    "totalItems": 4,
    "progressPercent": 100,
    "items": [
      {
        "id": 101,
        "taskListId": 44,
        "title": "РџСЂРѕРІРµСЂРёС‚СЊ РІС…РѕРґРЅСѓСЋ РіСЂСѓРїРїСѓ",
        "isDone": true,
        "completedAt": "2026-03-30T04:15:00.000Z",
        "sortOrder": 0
      }
    ]
  }
}
```

### POST `/api/mobile/tasks/:taskId/review` (РёР»Рё `PATCH`)

Р”РѕСЃС‚СѓРї: `role=manager`.

Body:

```json
{
  "decision": "approved"
}
```

РёР»Рё

```json
{
  "decision": "rejected",
  "comment": "РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅР°СЏ С„РѕС‚РѕС„РёРєСЃР°С†РёСЏ, РїРµСЂРµРґРµР»Р°С‚СЊ."
}
```

РџРѕРІРµРґРµРЅРёРµ:

- `approved`: С„РёРєСЃРёСЂСѓРµС‚ РїСЂРѕРІРµСЂРєСѓ, Р·Р°РґР°С‡Р° РѕСЃС‚Р°С‘С‚СЃСЏ `completed` Рё РїРѕР»СѓС‡Р°РµС‚ `reviewStatus=approved`
- `rejected`: РІРѕР·РІСЂР°С‰Р°РµС‚ Р·Р°РґР°С‡Сѓ РєР»РёРЅРµСЂСѓ (С‡РµРє-Р»РёСЃС‚ СЃР±СЂР°СЃС‹РІР°РµС‚СЃСЏ, `status=open`, `reviewStatus=rejected`)

## Р РµРєРѕРјРµРЅРґСѓРµРјС‹Р№ Flow Р”Р»СЏ РњРѕР±РёР»СЊРЅРѕРіРѕ РџСЂРёР»РѕР¶РµРЅРёСЏ

1. Р’С‹Р·РІР°С‚СЊ `POST /api/mobile/auth/login`
2. РЎРѕС…СЂР°РЅРёС‚СЊ `token`
3. РЎРѕС…СЂР°РЅРёС‚СЊ `role` Рё `frontend`
4. РџРѕСЃС‚СЂРѕРёС‚СЊ РЅСѓР¶РЅС‹Р№ РјРёРєСЂРѕС„СЂРѕРЅС‚РµРЅРґ РїРѕ `frontend`
5. РЎРѕС…СЂР°РЅРёС‚СЊ `objects` РёР· login response
6. Р’Рѕ РІСЃРµ СЃР»РµРґСѓСЋС‰РёРµ Р·Р°РїСЂРѕСЃС‹ РґРѕР±Р°РІР»СЏС‚СЊ `Authorization: Bearer <token>`
7. Р”Р»СЏ РґРѕРєСѓРјРµРЅС‚РѕРІ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ `GET /api/mobile/documents`
8. Р”Р»СЏ РїРѕРґРїРёСЃРё РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ `POST /api/mobile/documents/sign`
9. Р”Р»СЏ РѕС‚С‡РµС‚РѕРІ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ `GET /api/mobile/reports/*`
10. Р”Р»СЏ Р·Р°РґР°С‡ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ `GET /api/mobile/tasks`
11. Р”Р»СЏ РѕС‚РјРµС‚РєРё РІС‹РїРѕР»РЅРµРЅРёСЏ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ `PATCH /api/mobile/tasks/:taskId/items/:itemId`

## РћСЃРЅРѕРІРЅС‹Рµ РћС€РёР±РєРё

- `400` вЂ” РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ body/query
- `401` вЂ” РЅРµС‚ С‚РѕРєРµРЅР° РёР»Рё С‚РѕРєРµРЅ РЅРµРІР°Р»РёРґРЅС‹Р№
- `403` вЂ” РЅРµС‚ РґРѕСЃС‚СѓРїР° Рє РѕР±СЉРµРєС‚Сѓ РёР»Рё РґРѕРєСѓРјРµРЅС‚Сѓ
- `404` вЂ” СЃСѓС‰РЅРѕСЃС‚СЊ РЅРµ РЅР°Р№РґРµРЅР°
- `409` вЂ” РєРѕРЅС„Р»РёРєС‚, РЅР°РїСЂРёРјРµСЂ РґРѕРєСѓРјРµРЅС‚ СѓР¶Рµ РїРѕРґРїРёСЃР°РЅ
