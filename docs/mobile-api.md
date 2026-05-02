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
GET /api/mobile/auth/shift
GET /api/mobile/objects
GET /api/mobile/documents
GET /api/mobile/reports/aroma
GET /api/mobile/tasks
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
- `shift`

Правила:

- `role=customer|cleaner` -> `frontend=employee`
- `role=manager` -> `frontend=manager`
- `role=supervisor` -> `frontend=supervisor`
- `role=procurement` -> `frontend=procurement`
- `role=admin|hr` -> `frontend=erp`

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
  "mustChangePassword": true,
  "access": {
    "buildingId": 3,
    "objectIds": [8, 9],
    "objectNames": ["Lobby", "Office Floor 2"]
  },
  "shift": {
    "workShift": "day",
    "label": "День",
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

Важно:

- для `customer` при логине автоматически создается/возвращается запись attendance за день
- для `customer` при логине также возвращается `shift`
- если `shift.shouldLogoutNow=true`, мобильное приложение может сразу завершить сессию
- если `shift.logoutAt` не `null`, это время рекомендованного logout по текущей смене
- статус attendance считается по `Asia/Tashkent`
- статус `on_time`/`late` считается относительно начала смены (`08:00` для `day`, `20:00` для `night`)
- для `night` смены `activity.date` — это дата начала смены (может быть вчера)

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
  "mustChangePassword": true,
  "access": {
    "buildingId": 3,
    "objectIds": [8, 9],
    "objectNames": ["Lobby", "Office Floor 2"]
  },
  "shift": {
    "workShift": "day",
    "label": "День",
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

Меняет пароль текущего пользователя (только `customer` аккаунты) и сбрасывает флаг `mustChangePassword=false`.

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

Ответ:

```json
{
  "ok": true,
  "mustChangePassword": false
}
```

### GET `/api/mobile/auth/shift`

Возвращает только информацию по смене текущего пользователя.

Header:

```http
Authorization: Bearer <token>
```

Ответ:

```json
{
  "role": "customer",
  "frontend": "employee",
  "source": "customer",
  "shift": {
    "workShift": "day",
    "label": "День",
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

Примечание:

- `day` считается как `08:00-20:00` по `Asia/Tashkent`
- `night` считается как `20:00-08:00` по `Asia/Tashkent`
- `logoutAt` заполнен только если пользователь сейчас внутри своей смены

### POST `/api/mobile/activity/finish`

Отмечает окончание работы сотрудника и обновляет `workMinutes` в записи attendance текущей смены.

Header:

```http
Authorization: Bearer <token>
```

Body (optional):

```json
{
  "finishedAt": "2026-03-29T15:00:00.000Z"
}
```

Если `finishedAt` не передан — используется текущее время сервера.

Ответ:

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

Правила:

- endpoint ищет существующую запись attendance для текущей смены (как правило, она создается при логине)
- `workMinutes` = `max(0, minutes(shiftStart → min(finishedAt, shiftEnd)) - lateMinutes)`

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

## 5. Tasks

### GET `/api/mobile/tasks`

Возвращает to-do листы:

- для `role=customer|cleaner`: задачи, назначенные сотруднику
- для `role=manager`: задачи на проверку (после завершения клинером)

Query params:

- `status` — опционально: `open`, `in_progress`, `completed` (для `customer|cleaner`)
- `reviewStatus` — опционально: `pending`, `approved`, `rejected` (для `manager`, default: `pending`)

Пример:

```http
GET /api/mobile/tasks?status=open
Authorization: Bearer <token>
```

Ответ:

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
      "title": "Открытие смены",
      "note": "Пройтись по входной группе до 09:15",
      "dueDate": "2026-03-30",
      "status": "in_progress",
      "totalItems": 4,
      "completedItems": 2,
      "progressPercent": 50,
      "items": [
        {
          "id": 101,
          "taskListId": 44,
          "title": "Проверить входную группу",
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

Отмечает пункт чек-листа как выполненный или возвращает обратно в невыполненные.

Body:

```json
{
  "done": true
}
```

Пример:

```http
PATCH /api/mobile/tasks/44/items/101
Authorization: Bearer <token>
Content-Type: application/json
```

Ответ:

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
        "title": "Проверить входную группу",
        "isDone": true,
        "completedAt": "2026-03-30T04:15:00.000Z",
        "sortOrder": 0
      }
    ]
  }
}
```

### POST `/api/mobile/tasks/:taskId/review` (или `PATCH`)

Доступ: `role=manager`.

Body:

```json
{
  "decision": "approved"
}
```

или

```json
{
  "decision": "rejected",
  "comment": "Недостаточная фотофиксация, переделать."
}
```

Поведение:

- `approved`: фиксирует проверку, задача остаётся `completed` и получает `reviewStatus=approved`
- `rejected`: возвращает задачу клинеру (чек-лист сбрасывается, `status=open`, `reviewStatus=rejected`)

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
10. Для задач использовать `GET /api/mobile/tasks`
11. Для отметки выполнения использовать `PATCH /api/mobile/tasks/:taskId/items/:itemId`

## Основные Ошибки

- `400` — некорректный body/query
- `401` — нет токена или токен невалидный
- `403` — нет доступа к объекту или документу
- `404` — сущность не найдена
- `409` — конфликт, например документ уже подписан
