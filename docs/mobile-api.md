# Mobile API

Краткая документация для интеграции мобильного приложения с backend.

## Base URL

Все mobile endpoint-ы идут под префиксом:

```text
/api/mobile/*
```

Пример:

```text
POST /api/mobile/auth/login
GET /api/mobile/objects
GET /api/mobile/documents
GET /api/mobile/reports/aroma
```

## Авторизация

После успешного логина backend возвращает JWT token.

Во все следующие запросы нужно передавать:

```http
Authorization: Bearer <token>
```

Если token не передан или невалидный, backend вернет `401`.

## Роль и frontend

В login backend возвращает:

- `role`
- `frontend`
- `source`

Правила:

- `role=customer` -> `frontend=employee`
- `role=admin|hr|procurement` -> `frontend=erp`

Это можно использовать в мобильном приложении для разделения микрофронтенда.

## 1. Auth

### POST `/api/mobile/auth/login`

Логин пользователя.

Поддерживаемые поля в body:

```json
{
  "login": "998901234567",
  "password": "123456"
}
```

Также можно отправлять:

```json
{
  "phone": "998901234567",
  "password": "123456"
}
```

или

```json
{
  "email": "admin@diamond.local",
  "password": "password123"
}
```

Пример ответа:

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
  "access": {
    "buildingId": 3,
    "objectIds": [8, 9],
    "objectNames": ["Lobby", "Office Floor 2"]
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

Важно:

- для `customer` при логине автоматически создается/возвращается запись attendance за день
- статус attendance считается по `Asia/Tashkent`
- если вход до `09:00`, будет `on_time`
- если после `09:00`, будет `late`

### GET `/api/mobile/auth/me`

Возвращает текущего пользователя по токену.

Header:

```http
Authorization: Bearer <token>
```

Ответ:

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
  "access": {
    "buildingId": 3,
    "objectIds": [8, 9],
    "objectNames": ["Lobby", "Office Floor 2"]
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

## 2. Objects

### GET `/api/mobile/objects`

Возвращает только доступные текущему пользователю объекты.

Query params:

- `activeOnly=true` — только активные объекты

Пример:

```http
GET /api/mobile/objects?activeOnly=true
Authorization: Bearer <token>
```

Ответ:

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

Возвращает один объект, если у пользователя есть к нему доступ.

Пример:

```http
GET /api/mobile/objects/8
Authorization: Bearer <token>
```

Если доступа нет, backend вернет `404`.

## 3. Documents

### GET `/api/mobile/documents`

Возвращает документы по доступным объектам.

Query params:

- `objectId` — опционально, если нужно отфильтровать по одному объекту

Пример:

```http
GET /api/mobile/documents?objectId=8
Authorization: Bearer <token>
```

Особенности:

- `customer` видит только свои назначения и свои подписи
- `erp` роли видят объектный срез целиком

Ответ:

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

Подписание документа сотрудником через мобильное приложение.

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

Важно:

- `employeeName` и `phoneNumber` брать из клиента не нужно
- backend сам возьмет их из токена
- подписать можно только документ, назначенный текущему пользователю
- при повторной подписи backend вернет `409`

Пример ответа:

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

Возвращает список доступных report endpoint-ов.

Ответ:

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

- `objectId` — опционально

Ответ:

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

- `objectId` — опционально

Ответ:

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

- `objectId` — опционально

Ответ:

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

- `objectId` — опционально

Ответ:

```json
{
  "role": "customer",
  "frontend": "employee",
  "objectIds": [8],
  "bins": [],
  "reports": []
}
```

## Рекомендуемый Flow Для Мобильного Приложения

1. Вызвать `POST /api/mobile/auth/login`
2. Сохранить `token`
3. Сохранить `role` и `frontend`
4. Построить нужный микрофронтенд по `frontend`
5. Сохранить `objects` из login response
6. Во все следующие запросы добавлять `Authorization: Bearer <token>`
7. Для документов использовать `GET /api/mobile/documents`
8. Для подписи использовать `POST /api/mobile/documents/sign`
9. Для отчетов использовать `GET /api/mobile/reports/*`

## Основные Ошибки

- `400` — некорректный body/query
- `401` — нет токена или токен невалидный
- `403` — нет доступа к объекту или документу
- `404` — сущность не найдена
- `409` — конфликт, например документ уже подписан

